""" Implementation of Dijkstra's algorithm for pathfinding in a graph. """
from queue import PriorityQueue

from networkx import MultiDiGraph


def djikstra(graph: MultiDiGraph, start: int, goal: int, heuristic: callable=None) -> tuple[list[int], list[int]]:
    visited = set()
    queue: PriorityQueue = PriorityQueue()
    queue.put((0, start, [start]))
    explored_nodes = []
    parent = {start: None}

    while not queue.empty():
        cost, current, path = queue.get()
        explored_nodes.append(current)

        if current == goal:
            return [node for node in explored_nodes], path

        if current not in visited:
            visited.add(current)
            for neighbor in graph.neighbors(current):
                if neighbor not in visited:
                    parent[neighbor] = current
                    edge_data = graph.get_edge_data(current, neighbor)
                    edge_cost = min(data["length"] for data in edge_data.values())
                    total_cost = cost + edge_cost
                    if heuristic is not None:
                        total_cost += heuristic(graph.nodes[neighbor], graph.nodes[goal])
                    queue.put((total_cost, neighbor, path + [neighbor]))
    path = []
    current = goal
    while current is not None:
        path.append(current)
        current = parent[current]
    path.reverse()
    return [node for node in explored_nodes], path
