import logging
import os
import time

# Allow to set log level via environment variable, default to INFO
LOG_LEVEL = os.getenv("LOGLEVEL", "INFO").upper()

# Set up logging
logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=LOG_LEVEL)
logger = logging.getLogger(__name__)


class Timer:
    """Simple context manager to time a block of code"""

    def __init__(self, name="Operation"):
        self.name = name
        self.elapsed = None

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.elapsed = time.perf_counter() - self.start
        logger.info(f"{self.name} took {self.elapsed:.2f} seconds")
