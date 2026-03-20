import json
import os

import numpy as np
import requests
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from algorithms.pathfinding.utils import solve as solve_pathfinding
from algorithms.simulation.car import Car
from algorithms.simulation.estimators import KalmanCarFilter, dead_reckoning
from algorithms.simulation.utils import latlon_to_xy, xy_to_latlon
from projects import Timer, logger
from projects.graph_loading import load_graph

@ensure_csrf_cookie
def map_page(request):
    return render(request, "projects/map.html")


def solve_map_pathfinding(request):

    # Read input from request body
    data = json.loads(request.body)
    start = tuple(data["start"])
    goal = tuple(data["goal"])
    alg = data["alg"]
    logger.info(f"Received pathfinding request: {start=}, {goal=}, {alg=}")

    # Load static graph (Paris)
    logger.info("Loading graph data")
    graph = load_graph()

    logger.info(f"Solving pathfinding problem with {alg}...")
    with Timer(name="Pathfinding") as task_timer:
        visited, path, path_length = solve_pathfinding(graph=graph, start=start, goal=goal, alg=alg)

    # Add metadata:
    metadata = {
        "visited_count": len(visited),
        "path_length": path_length,
        "time": task_timer.elapsed,
    }

    return JsonResponse({"visited": visited, "path": path, "metadata": metadata})


def tile_proxy(request, z, x, y, ext):
    
    if ext != "png":
        return HttpResponse(status=404)
    
    MAPTILER_API_KEY = os.getenv("MAPTILER_API_KEY")
    if MAPTILER_API_KEY is None:
        logger.warning("No API key for map tiler.")
        return HttpResponse(status=500)

    url = f"https://api.maptiler.com/maps/aquarelle-v4/{z}/{x}/{y}.png?key={MAPTILER_API_KEY}"
    resp = requests.get(url)
    logger.debug(url)
    # Debug: check headers & content type
    logger.debug(f"{resp.status_code}: {resp.headers.get('Content-Type')}")
    
    if resp.status_code != 200 or resp.headers.get('Content-Type') != 'image/png':
        return HttpResponse("Tile fetch error", status=resp.status_code)

    return HttpResponse(resp.content, content_type='image/png')

@ensure_csrf_cookie
def kalman_page(request):
    return render(request, "projects/kalman.html")

def solve_kalman(request):
    # First find shortest path with A*
    data = json.loads(request.body)
    start = tuple(data["start"])
    goal = tuple(data["goal"])
    graph = load_graph()

    logger.info("Solving pathfinding problem...")
    with Timer(name="Pathfinding"):
        _, path, path_length = solve_pathfinding(graph, start, goal, alg="djikstra")
    logger.info(f"Path length: {path_length:.2f} meters")
    
    # Next, simulate a car following the path.
    car = Car(path, dt=0.2, gps_std=25, accelerometer_std=0.1, acc_drift=0.01, gps_frequency=1)
    with Timer(name="Simulation"):
        car.simulate()

    logger.info(f"Simulated car with {len(car.positions)} positions for a total time of {car.time[-1]:.2f} seconds.")

    lat0, lon0 = start

    dead_reckoning_estimations = dead_reckoning(car.acc_measurements, lat0=lat0, lon0=lon0)
    kalman_filter = KalmanCarFilter(gps_std=25, acc_std=0.1, process_std=0.1)
    
    events = []
    for t, m in car.acc_measurements:
        events.append((t, "acc", m))
    for t, m in car.gps_measurements:
        m_xy = latlon_to_xy(lat=m[0], lon=m[1], lat0=lat0, lon0=lon0)
        events.append((t, "gps", m_xy))
    events.sort(key=lambda e: e[0])
    for t, sensor, m in events:
        kalman_filter.process_event(t, sensor, m)

    t_to_state = {car.time[i]: i for i in range(len(car.time)) }

    kalman_positions = []
    kalman_accelerations = []
    kalman_errors = []
    kalman_times=[]
    ellipses=[]
    kalman_speeds = []
    for event in kalman_filter.history:
        t = event["time"]
        state = event["state"]
        ellipse = event["ellipse"]
        ellipses.append([xy_to_latlon(x, y, lat0=lat0, lon0=lon0) for x, y in ellipse])

        true_pos = car.positions[t_to_state[t]]
        kalman_errors.append(np.linalg.norm(true_pos - state[:2]))

        x, y = state[0], state[1]
        kalman_speeds.append(np.linalg.norm(state[2:4]))
        kalman_accelerations.append(np.linalg.norm(state[5:]))
        lat,lon = xy_to_latlon(x, y, lat0=lat0, lon0=lon0)
        kalman_positions.append([lat, lon])
        kalman_times.append(t)
    
    gps_error = []
    for t, gps_estimate in car.gps_measurements:
        true_pos = car.positions[t_to_state[t]]
        gps_error.append(np.linalg.norm(true_pos - np.array(latlon_to_xy(gps_estimate[0], gps_estimate[1], lat0, lon0))))
    
    dead_reckoning_error = []
    for i, t in enumerate(car.time):
        true_pos = car.positions[t_to_state[t]]
        dead_reckoning_error.append(np.linalg.norm(true_pos - np.array(latlon_to_xy(dead_reckoning_estimations[i][0], dead_reckoning_estimations[i][1], lat0, lon0))))


    # Finally, return the simulated GPS and acceleration measurements as JSON
    measurements = {
        "gps": [{"time": t, "position": pos, "error": err} for (t, pos), err in zip(car.gps_measurements, gps_error)],
        "acceleration": [{"time": t, "acceleration": acc.tolist()} for t, acc in car.acc_measurements],
        "estimators": [
            {"time": t, "dead_reckoning": dr, "dead_reckoning_error": dre} 
            for t, dr, dre in zip(car.time, dead_reckoning_estimations, dead_reckoning_error, strict=True)
        ],
        "kalman": [
            {"time": t, "position": p, "ellipse": e, "speed": s, "acceleration": a, "error": err}
            for t, p, e, s, a, err in zip(kalman_times, kalman_positions, ellipses, kalman_speeds, kalman_accelerations, kalman_errors, strict=True)
        ],
        "ground_truth": [
            {"time": t, "position": pos, "speed": np.linalg.norm(vel), "acceleration":  np.linalg.norm(acc)}
            for t, pos, vel, acc 
            in zip(car.time, car.positions_as_latlon, car.velocities, car.accelerations, strict=True)
        ],
    }
    return JsonResponse(measurements)