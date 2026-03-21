"""Utils related to pathfinding"""

from typing import Callable

from networkx import MultiDiGraph
from osmnx import nearest_nodes
from osmnx.distance import great_circle

from algorithms.pathfinding.a_star import a_star
from algorithms.pathfinding.bfs import bfs
from algorithms.pathfinding.djikstra import djikstra

AVAILABLE_SOLVERS: dict[str, Callable[[MultiDiGraph, int, int], tuple[list[int], list[int]]]] = {
    "bfs": bfs,
    "djikstra": djikstra,
    "a_star": a_star,
}


def path_length(graph: MultiDiGraph, path: list[int]) -> float:
    """Compute the length of a path in meters"""
    length = 0
    for i in range(len(path) - 1):
        node_a = graph.nodes[path[i]]
        node_b = graph.nodes[path[i + 1]]
        length += great_circle(
            lat1=node_a["y"], lon1=node_a["x"], lat2=node_b["y"], lon2=node_b["x"]
        )
    return length


def solve(graph: MultiDiGraph, start: tuple[float, float], goal: tuple[float, float], alg: str):
    if alg not in AVAILABLE_SOLVERS:
        raise ValueError(
            f"{alg=} is not a valid solver. "
            f"Available solvers: {', '.join(AVAILABLE_SOLVERS.keys())}"
        )

    start_node = nearest_nodes(graph, start[1], start[0])
    goal_node = nearest_nodes(graph, goal[1], goal[0])

    solver = AVAILABLE_SOLVERS[alg]
    visited, path = solver(graph, start_node, goal_node)
    visited_as_tuples = [(graph.nodes[node]["y"], graph.nodes[node]["x"]) for node in visited]
    path_as_tuples = [(graph.nodes[node]["y"], graph.nodes[node]["x"]) for node in path]
    return visited_as_tuples, path_as_tuples, path_length(graph=graph, path=path)
