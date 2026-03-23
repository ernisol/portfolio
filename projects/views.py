import json

import numpy as np
from cachetools import LRUCache
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from algorithms.pathfinding.utils import solve as solve_pathfinding
from algorithms.simulation.car import Car
from algorithms.simulation.estimators import KalmanCarFilter, dead_reckoning
from algorithms.simulation.utils import latlon_to_xy
from algorithms.utils import feature_collection, line_feature, point_feature, polygon_feature
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
        "visited_count": int(len(visited)),
        "path_length": float(path_length),
        "time": float(task_timer.elapsed),
    }

    visited_features = []
    for idx, (lat, lon) in enumerate(visited):
        visited_features.append(
            point_feature(
                lon=float(lon),
                lat=float(lat),
                properties={"index": idx, "series": "visited"},
            )
        )

    path_coords = [[float(lon), float(lat)] for lat, lon in path]
    path_feature = line_feature(path_coords, properties={"series": "path"})

    return JsonResponse(
        {
            "visited_points": feature_collection(visited_features),
            "path_lines": feature_collection([path_feature]),
            "metadata": metadata,
        }
    )


@ensure_csrf_cookie
def kalman_page(request):
    return render(request, "projects/kalman.html")


def solve_kalman(request):

    # Read inputs
    data = json.loads(request.body)
    start = tuple(data["start"])
    goal = tuple(data["goal"])

    try:
        gps_std = float(data.get("gps_std", 5))
        acc_std = float(data.get("acc_std", 0.1))
        acc_drift = float(data.get("acc_drift", 0.01))
    # Disabling formatting for black here (python 3.14 requires parentheses around multiple
    # except types but black formats it without)
    # fmt: off
    except (TypeError, ValueError):
        # fmt: on
        return JsonResponse(
            {"error": "gps_std, acc_std, and acc_drift must be numeric values."}, status=400
        )

    gps_std = min(50.0, max(0.1, gps_std))
    acc_std = min(1.0, max(0.01, acc_std))
    acc_drift = min(0.1, max(0.0, acc_drift))
    logger.info(
        "Kalman simulation parameters: gps_std=%.3f, acc_std=%.3f, acc_drift=%.3f",
        gps_std,
        acc_std,
        acc_drift,
    )

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
            gps_std=gps_std,
            accelerometer_std=acc_std,
            acc_drift=acc_drift,
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

    ground_truth_features = []
    ground_truth_line = []
    for t, pos, vel, acc in zip(
        car.time,
        car.positions_as_latlon,
        car.velocities,
        car.accelerations,
        strict=True,
    ):
        lat, lon = pos
        lonlat = [float(lon), float(lat)]
        ground_truth_line.append(lonlat)
        ground_truth_features.append(
            point_feature(
                lon=float(lon),
                lat=float(lat),
                properties={
                    "time": float(t),
                    "series": "ground_truth",
                    "speed": float(np.linalg.norm(vel)),
                    "acceleration": float(np.linalg.norm(acc)),
                },
            )
        )

    gps_features = []
    for gps_data in car.gps_measurements:
        lat, lon = gps_data["position"]
        gps_features.append(
            point_feature(
                lon=float(lon),
                lat=float(lat),
                properties={
                    "time": float(gps_data["time"]),
                    "series": "gps",
                    "error": float(gps_data["error"]),
                },
            )
        )

    dead_reckoning_features = []
    for t, dr, dre in zip(car.time, dead_reckoning_estimations, dead_reckoning_error, strict=True):
        dr_lat, dr_lon = dr
        dead_reckoning_features.append(
            point_feature(
                lon=float(dr_lon),
                lat=float(dr_lat),
                properties={
                    "time": float(t),
                    "series": "dead_reckoning",
                    "error": float(dre),
                },
            )
        )

    kalman_features = []
    kalman_ellipse_features = []
    for state in kalman_output:
        kalman_lat, kalman_lon = state["position"]
        kalman_features.append(
            point_feature(
                lon=float(kalman_lon),
                lat=float(kalman_lat),
                properties={
                    "time": float(state["time"]),
                    "series": "kalman",
                    "speed": float(state["speed"]),
                    "acceleration": float(state["acceleration"]),
                    "error": float(state["error"]),
                },
            )
        )

        ellipse_ring = [[float(lon), float(lat)] for lat, lon in state["ellipse"]]
        if ellipse_ring and ellipse_ring[0] != ellipse_ring[-1]:
            ellipse_ring.append(ellipse_ring[0])
        kalman_ellipse_features.append(
            polygon_feature(
                coords=[ellipse_ring],
                properties={
                    "time": float(state["time"]),
                    "series": "kalman_ellipse",
                    "confidence": 0.95,
                },
            )
        )

    measurements = {
        "ground_truth_path": feature_collection(
            [line_feature(ground_truth_line, properties={"series": "ground_truth_path"})]
        ),
        "ground_truth_points": feature_collection(ground_truth_features),
        "gps_points": feature_collection(gps_features),
        "dead_reckoning_points": feature_collection(dead_reckoning_features),
        "kalman_points": feature_collection(kalman_features),
        "kalman_ellipses": feature_collection(kalman_ellipse_features),
        "acceleration_series": [
            {"time": float(t), "acceleration": float(np.linalg.norm(acc))}
            for t, acc in car.acc_measurements
        ],
    }
    return JsonResponse(measurements)
