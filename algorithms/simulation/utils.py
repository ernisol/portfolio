import numpy as np
from osmnx.distance import EARTH_RADIUS_M
from scipy.interpolate import CubicSpline


def latlon_to_xy(lat: float, lon: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Convert latitude / longitude to x / y coordinates in an orthonormal plan centered in lat0, lon0."""
    lat = np.radians(lat)
    lon = np.radians(lon)
    lat0 = np.radians(lat0)
    lon0 = np.radians(lon0)

    # Longitudinal circle has radius cos(lat0) * EARTH_RADIUS_M
    x = (lon - lon0) * np.cos(lat0) * EARTH_RADIUS_M
    y = (lat - lat0) * EARTH_RADIUS_M
    return np.array([x, y])


def xy_to_latlon(x: float, y: float, lat0: float, lon0: float) -> tuple[float, float]:
    """Convert x / y coordinates in an orthonormal plan centered in lat0, lon0 to latitude / longitude."""

    # Reverse operation
    lat = lat0 + (y / EARTH_RADIUS_M) * 180/np.pi
    lon = lon0 + (x / (EARTH_RADIUS_M*np.cos(np.radians(lat0)))) * 180/np.pi
    return lat, lon

def path_to_spline(path: list[tuple[float, float]]) -> tuple[CubicSpline, CubicSpline, np.ndarray, float, float]:
    """Interpolate a C2 smooth spline along a list of latitude / longitue pairs.

    Parameters
    ----------
    path: list[tuple[float, float]]
        List of latitude/longitude pairs to interpolate
    
    Returns
    -------
    tuple[CubicSpline, CubicSpline, np.ndarray, float, float]
        x spline, y spline, abscissa of the points, latitude of reference, longitude of regerence
    
    """
    lat0, lon0 = path[0]
    points = []
    # Convert from lat/lon to x/y
    for node in path:
        lat, lon = node
        points.append(latlon_to_xy(lat, lon, lat0, lon0))

    # Filter path
    points = filter_path(points, min_dist=30)

    # Build spline
    x_spline, y_spline, s = build_spline(points)

    return x_spline, y_spline, s, lat0, lon0



def filter_path(points: list[tuple[float, float]], min_dist: float)-> list[tuple[float, float]]:
    """Filter a path given a minimum distance.
    
    Parameters
    ----------
    points: list[tuple[float, float]]
        Points to filter, x and y coordinates in an arbitrary orthonormal plan (unit 1m).
    min_dist: float
        Minimum distance between points (m)

    Returns
    -------
    list[tuple[float, float]]
        Filtered points
    """
    filtered = [points[0]]

    for i in range(1, len(points)-1):
        # Consider next point
        A = filtered[-1]
        B = points[i]

        # Compute distance
        dist = np.linalg.norm(B - A)
        
        # Only keep if over min distance
        if dist > min_dist:
            filtered.append(B)

    filtered.append(points[-1])
    return filtered


def compute_arclength_params(points: list[tuple[float, float]]) -> np.ndarray[float]:
    """Assign abscissa depending on distance between points.
    
    Parameters
    ----------
    points: list[tuple[float, float]]
        Points in an arbitrary orthonormal x / y plan.

    Returns
    -------
    np.ndarray[float]
        Abscissa
    """
    dists = [0]
    for i in range(1, len(points)):
        dists.append(dists[-1] + np.linalg.norm(points[i] - points[i-1]))
    return np.array(dists)

def build_spline(points: np.ndarray[float]) -> tuple[CubicSpline, CubicSpline, np.ndarray[float]]:
    """ Interpolate a cubic spline between points

    Parameters
    ----------
    points: list[tuple[float, float]]
        Points in an arbitrary orthonormal x / y plan.

    Returns
    -------
    tuple[CubicSpline, CubicSpline, np.ndarray[float]]
        x spline, y spline, abscissa
    """
    points = np.array(points)

    # Resample spacially to avoid sharp turns
    points = resample_polyline(points=points)

    # Compute abscissa for the splines
    s = compute_arclength_params(points)

    # Interpolate
    x_spline = CubicSpline(s, points[:, 0], bc_type='natural')
    y_spline = CubicSpline(s, points[:, 1], bc_type='natural')

    return x_spline, y_spline, s

def evaluate_spline(x_spline: CubicSpline, y_spline: CubicSpline, s_vals: np.ndarray[float]):
    """Return position, derivative and second derivative of the spline relative to s.
    
    Parameters
    ----------
    x_spline: CubicSpline
        Spline x
    y_spline: CubicSpline
        Spline y
    s_vals: np.ndarray[float]
        Abscissa to evaluate
    
    Returns
    -------
    tuple[np.ndarray[float]]
        x, y, dx, dy, ddx, ddy, same shape as s_vals
    """

    # Order 0
    x = x_spline(s_vals)
    y = y_spline(s_vals)

    # Order 1
    dx = x_spline(s_vals, 1)
    dy = y_spline(s_vals, 1)

    # Order 2
    ddx = x_spline(s_vals, 2)
    ddy = y_spline(s_vals, 2)

    return x, y, dx, dy, ddx, ddy


def compute_curvature(dx: float, dy: float, ddx: float, ddy: float) -> float:
    """Compute curvature from derivatives."""
    return (dx * ddy - dy * ddx) / (dx**2 + dy**2)**1.5


def resample_polyline(points, ds=50):
    """Resample a list of points by interpolating points at a regular distance interval."""
    points = np.array(points)
    dists = np.sqrt(((points[1:] - points[:-1])**2).sum(axis=1))
    s = np.concatenate([[0], np.cumsum(dists)])

    s_new = np.arange(0, s[-1], ds)

    x = np.interp(s_new, s, points[:,0])
    y = np.interp(s_new, s, points[:,1])

    return np.stack([x, y], axis=1)