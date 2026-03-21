"""Implementation of Breadth-First Search (BFS) algorithm for pathfinding in a graph."""

from collections import deque

from networkx import MultiDiGraph


def bfs(graph: MultiDiGraph, start: int, goal: int) -> tuple[list[int], list[int]]:
    visited = set()
    queue = deque([(start, [start])])
    explored_nodes = []
    parent: dict[int, int | None] = {start: None}

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
    backtracker: int | None = goal
    while backtracker is not None:
        path.append(backtracker)
        backtracker = parent[backtracker]
    path.reverse()
    return explored_nodes, path
