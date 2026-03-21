"""Module with estimators to run on a car simulation."""

from typing import Any

import numpy as np

from algorithms.simulation.car import Car
from algorithms.simulation.utils import latlon_to_xy, xy_to_latlon


def dead_reckoning(acc_measurements: list, lat0: float, lon0: float) -> list[tuple[float, float]]:
    """Estimate positions using dead reckoning. Position is integrated from acceleration using:
    dp = v*dt + 0.5*a*dt2

    Parameters
    ----------
    acc_measurements: list
        List of times, ax, ay
    lat0: float
        Latitude of reference and initial position.
    lon0: float
        Longitude of reference and initial position.

    Returns
    -------
    list[tuple[float, float]]
        List of latitude/longitude pairs of estimated positions

    """

    position = np.zeros(2)
    velocity = np.zeros(2)

    estimates = []

    previous_time = acc_measurements[0][0]

    for t, acc in acc_measurements:

        dt = t - previous_time
        previous_time = t

        # Integrate motion
        delta = velocity * dt + 0.5 * acc * dt**2
        position = position + delta

        velocity = velocity + acc * dt

        lat, lon = xy_to_latlon(position[0], position[1], lat0, lon0)

        estimates.append((lat, lon))

    return estimates


class KalmanCarFilter:

    def __init__(self, car: Car, process_std: float = 10):
        self.car = car
        self.x = np.zeros(6)  # states x, y, vx, vy, ax, ay

        self.process_std = process_std

        # Initial covariance
        self.P = np.diag(
            [
                100,
                100,  # position
                25,
                25,  # velocity
                4,
                4,  # acceleration
            ]
        )

        self.last_time = None
        self.last_innovation_norm = 1

        # measurement noise
        self.R_gps = np.eye(2) * car.gps_std**2
        self.R_acc = np.eye(2) * car.accelerometer_std**2

        # measurement matrices
        self.H_gps = np.zeros((2, 6))
        self.H_gps[0, 0] = 1  #
        self.H_gps[1, 1] = 1  #

        self.H_acc = np.zeros((2, 6))
        self.H_acc[0, 4] = 1  # acc x = acc x
        self.H_acc[1, 5] = 1  # acc

        # history for visualization
        self.history: list[dict[str, Any]] = []

    def build_Q(self, dt):
        dt2 = dt**2
        dt3 = dt**3
        dt4 = dt**4

        q = self.process_std**2

        Q = (
            np.array(
                [
                    [dt4 / 4, 0, dt3 / 2, 0, dt2 / 2, 0],
                    [0, dt4 / 4, 0, dt3 / 2, 0, dt2 / 2],
                    [dt3 / 2, 0, dt2, 0, dt, 0],
                    [0, dt3 / 2, 0, dt2, 0, dt],
                    [dt2 / 2, 0, dt, 0, 1, 0],
                    [0, dt2 / 2, 0, dt, 0, 1],
                ]
            )
            * q
        )

        return Q

    def build_F(self, dt):

        dt2 = dt * dt

        F = np.eye(6)
        # dynamics
        # position: x = x + vx dt + 0.5*ax dt2, y = y + vy dt + 0.5*ay dt2
        F[0, 2] = dt
        F[1, 3] = dt
        F[0, 4] = 0.5 * dt2
        F[1, 5] = 0.5 * dt2

        # Velocity : vx = vx + ax * dt
        F[2, 4] = dt
        F[3, 5] = dt

        return F

    def predict(self, dt):

        F = self.build_F(dt)
        Q = self.build_Q(dt)

        # Dynamic estimate of position and cov update
        self.x = F @ self.x
        self.P = F @ self.P @ F.T + Q

    def update(self, z, H, R):

        # Surprise: difference between measure and state
        # (H selects which parts of the state is relevant - observation model)
        y = z - H @ self.x

        # Gain - how much should we compromise between prediction and measure
        S = H @ self.P @ H.T + R
        K = self.P @ H.T @ np.linalg.inv(S)

        # Linear compromise. K=1 would mean keep only z (measurement). K=0 means keep only state.
        self.x = self.x + K @ y

        # Update covariance
        identity = np.eye(len(self.x))
        self.P = (identity - K @ H) @ self.P

        return y, K

    def process_event(self, time, sensor_type, measurement):
        """Process an asynchronous sensor event (either GPS or accelerometer update)."""

        # Dynamic update cannot be made without last_time, skipping first point
        if self.last_time is None:
            self.last_time = time
            return

        # Computing time difference
        dt = time - self.last_time
        self.last_time = time

        # Predict step: what state the car is in according to the car dynamics
        self.predict(dt)

        # Update step, different depending on the kind of measurement
        if sensor_type == "gps":
            y, _ = self.update(measurement, self.H_gps, self.R_gps)

        elif sensor_type == "acc":
            y, _ = self.update(measurement, self.H_acc, self.R_acc)

        else:
            raise ValueError("Unknown sensor")

        # Record state and covariance
        self.history.append(
            {
                "time": time,
                "state": self.x.copy(),
                "cov": self.P.copy(),
                "innovation": y,
                "sensor": sensor_type,
                "ellipse": self.covariance_to_ellipse_points(),  # Ellipse to visualize covariance
            }
        )

    def estimate_all(self):
        """Fit Kalman filter on the car."""
        # Build events list from sensors
        events = []
        for t, m in self.car.acc_measurements:
            events.append((t, "acc", m))
        for gps_data in self.car.gps_measurements:
            t = gps_data["time"]
            lat, lon = gps_data["position"]
            m_xy = latlon_to_xy(lat=lat, lon=lon, lat0=self.car.lat0, lon0=self.car.lon0)
            events.append((t, "gps", m_xy))

        # Sort by time
        events.sort(key=lambda e: e[0])

        # Fit Kalman filter
        for t, sensor, m in events:
            self.process_event(t, sensor, m)

        # Build output
        index_lookup = {self.car.time[i]: i for i in range(len(self.car.time))}
        output = []
        for event in self.history:
            x, y, vx, vy, ax, ay = event["state"]
            t = event["time"]
            true_pos = self.car.positions[index_lookup[t]]
            output.append(
                {
                    "time": event["time"],
                    "position": xy_to_latlon(x=x, y=y, lat0=self.car.lat0, lon0=self.car.lon0),
                    "ellipse": [
                        xy_to_latlon(x=xe, y=ye, lat0=self.car.lat0, lon0=self.car.lon0)
                        for xe, ye in event["ellipse"]
                    ],
                    "speed": np.linalg.norm([vx, vy]),
                    "acceleration": np.linalg.norm([ax, ay]),
                    "error": np.linalg.norm(true_pos - np.array([x, y])),
                }
            )
        return output

    def covariance_to_ellipse_points(self):
        """Converts the current covariance matrix P to points representing the boundary of an
        ellipse centered on current position using eigen values for scaling."""
        cov = self.P[:2, :2]  # Position covariance
        vals, vecs = np.linalg.eigh(cov)  # eigen values and vectors for the ellipse

        # 95% confidence interval
        axis1 = 2 * np.sqrt(vals[0])
        axis2 = 2 * np.sqrt(vals[1])

        # Ellipse angle (of large axis relative to x)
        angle = np.arctan2(vecs[1, 0], vecs[0, 0])
        return ellipse_points(center=self.x[:2], axis1=axis1, axis2=axis2, angle=angle)


def ellipse_points(center, axis1, axis2, angle, n=40):
    """Computes ellipse points given its axes, center and an angle."""

    # Parametric approach
    t = np.linspace(0, 2 * np.pi, n)
    ellipse = np.array([axis1 * np.cos(t), axis2 * np.sin(t)])

    # Rotation matrix
    R = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    rotated = R @ ellipse

    # Center
    points = rotated.T + center
    return points
