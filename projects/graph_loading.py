import os
from pathlib import Path

import joblib
import osmnx as ox
from cachetools import LRUCache, cached

from projects import logger

SAVED_GRAPHS_DIR = Path("saved_graphs")


@cached(cache=LRUCache(maxsize=1))
def load_graph():
    pkl_path = SAVED_GRAPHS_DIR / "graph.pkl"
    if pkl_path.exists():
        logger.info("Loading graph from joblib pickle")
        return joblib.load(pkl_path)

    # Check if the graph is already saved on disk
    graph_path = SAVED_GRAPHS_DIR / "paris.graphml"
    if graph_path.exists():
        logger.info("Loading graph from disk")
        graph = ox.load_graphml(graph_path)
        joblib.dump(graph, pkl_path)
        return graph

    # Load the graph from Paris
    logger.info("Loading graph from OSMnx (this may take a while)")
    graph = ox.graph_from_place("Paris, France", network_type="walk")
    # Save the graph to disk for future use
    os.makedirs(SAVED_GRAPHS_DIR, exist_ok=True)
    ox.save_graphml(graph, os.path.join(SAVED_GRAPHS_DIR, "paris.graphml"))
    joblib.dump(graph, pkl_path)
    return graph
