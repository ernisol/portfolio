"""Utils module for projects"""

from contextlib import contextmanager
from time import time


@contextmanager
def timer(name="Operation"):
    """Context manager to time a block of code"""
    start = time()
    yield
    end = time()
    print(f"{name} took {end - start:.2f} seconds")
