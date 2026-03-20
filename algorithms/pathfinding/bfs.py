""" Implementation of Breadth-First Search (BFS) algorithm for pathfinding in a graph. """

from collections import deque

from networkx import MultiDiGraph


def bfs(graph: MultiDiGraph, start: int, goal: int) -> tuple[list[int], list[int]]:
    visited = set()
    queue = deque([(start, [start])])
    explored_nodes = []
    parent = {start: None}

    while queue:
        current, path = queue.popleft()
        explored_nodes.append(current)

        if current == goal:
            return explored_nodes, path

        if current not in visited:
            visited.add(current)
            for neighbor in graph.neighbors(current):
                if neighbor not in visited:
                    parent[neighbor] = current
                    queue.append((neighbor, path + [neighbor]))
    path = []
    current = goal
    while current is not None:
        path.append(current)
        current = parent[current]
    path.reverse()
    return explored_nodes, path
