"""Implementation of A* algorithm for pathfinding in a graph."""

from networkx import MultiDiGraph
from osmnx.distance import great_circle

from algorithms.pathfinding.djikstra import djikstra


def heuristic(a: dict, b: dict) -> float:
    return great_circle(lat1=a["y"], lon1=a["x"], lat2=b["y"], lon2=b["x"])


def a_star(graph: MultiDiGraph, start: int, goal: int) -> tuple[list[int], list[int]]:
    return djikstra(graph, start, goal, heuristic=heuristic)
