import json
import os

import numpy as np
import requests
from cachetools import LRUCache
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from algorithms.pathfinding.utils import solve as solve_pathfinding
from algorithms.simulation.car import Car
from algorithms.simulation.estimators import KalmanCarFilter, dead_reckoning
from algorithms.simulation.utils import latlon_to_xy
from projects import Timer, logger
from projects.graph_loading import load_graph

TILE_CACHE = LRUCache(500)


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

    # Only treat png requests
    if ext != "png":
        return HttpResponse(status=404)

    # Use a cache to avoid over-using requests to the tiler api.
    cache_key = (x, y, z)
    if cache_key in TILE_CACHE:
        logger.info(f"Cache hit for {cache_key=}")
        return HttpResponse(TILE_CACHE[cache_key], content_type="image/png")

    # Request the map tile
    # Prepare maptiler API key (secret)
    MAPTILER_API_KEY = os.getenv("MAPTILER_API_KEY")
    if MAPTILER_API_KEY is None:
        logger.warning("No API key for map tiler.")
        return HttpResponse(status=500)

    url = f"https://api.maptiler.com/maps/aquarelle-v4/{z}/{x}/{y}.png?key={MAPTILER_API_KEY}"
    resp = requests.get(url)

    if resp.status_code != 200 or resp.headers.get("Content-Type") != "image/png":
        return HttpResponse("Tile fetch error", status=resp.status_code)

    # Cache for re-use
    TILE_CACHE[cache_key] = resp.content

    return HttpResponse(resp.content, content_type="image/png")


@ensure_csrf_cookie
def kalman_page(request):
    return render(request, "projects/kalman.html")


def solve_kalman(request):

    # Read inputs
    data = json.loads(request.body)
    start = tuple(data["start"])
    goal = tuple(data["goal"])
    graph = load_graph()

    # Solve pathfinding
    with Timer(name="Pathfinding"):
        _, path, path_length = solve_pathfinding(graph, start, goal, alg="djikstra")
    logger.info(f"Path length: {path_length:.2f} meters")

    # Simulate a car following the path.
    with Timer(name="Simulation"):
        car = Car(
            path,
            dt=1,
            gps_std=5,
            accelerometer_std=0.1,
            acc_drift=0.01,
            gps_frequency=1,
        )
        car.simulate()
    logger.info(
        f"Simulated car with {len(car.positions)} positions "
        f"for a total time of {car.time[-1]:.2f} seconds."
    )

    # Run estimators
    with Timer(name="Dead reckoning"):
        dead_reckoning_estimations = dead_reckoning(
            acc_measurements=car.acc_measurements, lat0=car.lat0, lon0=car.lon0
        )
        index_lookup = {car.time[i]: i for i in range(len(car.time))}
        dead_reckoning_error = []
        for i, t in enumerate(car.time):
            true_pos = car.positions[index_lookup[t]]
            dead_reckoning_error.append(
                np.linalg.norm(
                    true_pos
                    - np.array(
                        latlon_to_xy(
                            dead_reckoning_estimations[i][0],
                            dead_reckoning_estimations[i][1],
                            car.lat0,
                            car.lon0,
                        )
                    )
                )
            )

    with Timer(name="Kalman filtering"):
        kalman_filter = KalmanCarFilter(car=car, process_std=0.1)
        kalman_output = kalman_filter.estimate_all()

    # Finally, return the simulated GPS and acceleration measurements as JSON
    measurements = {
        "gps": car.gps_measurements,
        "acceleration": [
            {"time": t, "acceleration": np.linalg.norm(acc)} for t, acc in car.acc_measurements
        ],
        "estimators": [
            {"time": t, "dead_reckoning": dr, "dead_reckoning_error": dre}
            for t, dr, dre in zip(
                car.time, dead_reckoning_estimations, dead_reckoning_error, strict=True
            )
        ],
        "kalman": kalman_output,
        "ground_truth": [
            {
                "time": t,
                "position": pos,
                "speed": np.linalg.norm(vel),
                "acceleration": np.linalg.norm(acc),
            }
            for t, pos, vel, acc in zip(
                car.time,
                car.positions_as_latlon,
                car.velocities,
                car.accelerations,
                strict=True,
            )
        ],
    }
    return JsonResponse(measurements)
