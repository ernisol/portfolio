"""Class to simulate a car."""

from typing import Any

import numpy as np

from algorithms.simulation.utils import (
    compute_curvature,
    evaluate_spline,
    path_to_spline,
    xy_to_latlon,
)


class Car:
    """Class to simulate a car driving along a path."""

    def __init__(
        self,
        path: list[tuple[float, float]],
        dt: float = 0.1,
        gps_std: float = 25.0,
        accelerometer_std: float = 0.1,
        acc_drift: float = 0.01,
        gps_frequency: float = 1.0,
        **kwargs: float,
    ):

        self.dt = dt
        self.gps_std, self.accelerometer_std, self.acc_drift, self.gps_frequency = (
            gps_std,
            accelerometer_std,
            acc_drift,
            gps_frequency,
        )

        self.x_spline, self.y_spline, self.s, self.lat0, self.lon0 = path_to_spline(path)

        self.positions: list[list[float]] = []
        self.positions_as_latlon: list[tuple[float, float]] = []
        self.velocities: list[np.ndarray] = []
        self.accelerations: list[np.ndarray] = []
        self.time: list[float] = []

        self.gps_measurements: list[dict[str, Any]] = []
        self.acc_measurements: list[Any] = []

        # Extra simulation parameters from kwargs
        self.a_max = kwargs.pop("a_max", 2.0)  # m/s² acceleration
        self.b_max = kwargs.pop("b_max", 2.0)  # m/s² braking
        self.v_max_global = kwargs.pop("v_max", 30.0) / 3.6  # m/s
        self.v_turn = kwargs.pop("v_turn", 8.0) / 3.6  # max target speed over a threshold curvature

    def simulate(self) -> None:
        """Run the simulation step by step"""

        acc_drift_direction = np.random.rand(2) - 0.5
        acc_drift_direction = acc_drift_direction / np.linalg.norm(acc_drift_direction)

        # Parameters

        # Initial state
        t = 0.0
        s = 0.0
        v = 0.0
        previous_acc = 0.0

        total_length = self.s[-1]

        gps_dt = 1.0 / self.gps_frequency
        next_gps_time = 0.0

        # Increment s until it reaches the maximum abscissa
        while s < total_length:

            # Evaluate spline position, speed and acceleration
            x, y, dx, dy, ddx, ddy = evaluate_spline(self.x_spline, self.y_spline, np.array([s]))

            # Convert arrays to scalars
            x, y = x[0], y[0]
            dx, dy = dx[0], dy[0]
            ddx, ddy = ddx[0], ddy[0]

            # Curvature
            kappa = compute_curvature(dx=dx, dy=dy, ddx=ddx, ddy=ddy)

            # Speed limit from curvature when it is over a threshold
            v_target = self.v_max_global
            if abs(kappa) > 0.01:
                v_target = self.v_turn

            # Longitudinal control
            if v < v_target:
                a = self.a_max * (v_target - v) / v_target
            else:
                a = -self.b_max * (v - v_target) / v_target

            # Enforce max jerk
            jerk = abs(a - previous_acc) / self.dt
            if jerk > 1.0:  # 1 m/s³ is very comfortable
                a = previous_acc + np.sign(a - previous_acc) * 1.0 * self.dt

            # Integrate motion along the spline
            v = max(0.0, v + a * self.dt)  # Prevent negative (Always go forward)
            s = s + v * self.dt  # Advancement on the spline
            t += self.dt
            previous_acc = a

            # Tangent and normal unit vector
            tangent = np.array([dx, dy])
            tangent /= np.linalg.norm(tangent)
            normal = np.array([-tangent[1], tangent[0]])

            # Lateral acceleration (higher with curvature)
            a_lat = v**2 * kappa

            # Acceleration vector from tangent and normal accelerations
            acc_vector = a * tangent + a_lat * normal

            # Velocity vector is tangent
            vel_vector = v * tangent

            # Store ground truth
            self.positions.append([x, y])
            self.positions_as_latlon.append(xy_to_latlon(x, y, self.lat0, self.lon0))
            self.velocities.append(vel_vector)
            self.accelerations.append(acc_vector)
            self.time.append(t)

            # Accelerometer measurement
            acc_error = (
                np.random.normal(0, self.accelerometer_std) + self.acc_drift * acc_drift_direction
            )
            acc_meas = acc_vector + acc_error
            self.acc_measurements.append((t, acc_meas))

            # GPS measurement
            if t >= next_gps_time:
                gps_dx = np.random.normal(0, self.gps_std)
                gps_dy = np.random.normal(0, self.gps_std)
                gps_x = x + gps_dx
                gps_y = y + gps_dy
                gps_lat, gps_lon = xy_to_latlon(gps_x, gps_y, self.lat0, self.lon0)
                gps_err = np.linalg.norm([gps_dy, gps_dy])

                self.gps_measurements.append(
                    {"time": t, "position": (gps_lat, gps_lon), "error": gps_err}
                )

                next_gps_time += gps_dt
