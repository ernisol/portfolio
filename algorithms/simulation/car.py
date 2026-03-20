import numpy as np

from algorithms.simulation.utils import (
    compute_curvature,
    evaluate_spline,
    path_to_spline,
    xy_to_latlon,
)


class Car:

    def __init__(self, path, dt=0.1, gps_std=25, accelerometer_std=0.1, acc_drift=0.01, gps_frequency=1):

        self.dt = dt
        self.gps_std, self.accelerometer_std, self.acc_drift, self.gps_frequency = gps_std, accelerometer_std, acc_drift, gps_frequency

        self.x_spline, self.y_spline, self.s, self.lat0, self.lon0 = path_to_spline(path)

        self.positions = []
        self.positions_as_latlon = []
        self.velocities = []
        self.accelerations = []
        self.time = []

        self.gps_measurements = []
        self.acc_measurements = []

    def simulate(self) -> None:
        
        acc_drift_direction = np.random.rand(2) - 0.5
        acc_drift_direction = acc_drift_direction / np.linalg.norm(acc_drift_direction)

        # Parameters 
        a_max = 2  # m/s² acceleration
        b_max = 2  # m/s² braking
        v_max_global = 30 / 3.6
        v_turn = 8 / 3.6

        # Initial state 
        t = 0.0
        s = 0.0
        v = 0.0

        total_length = self.s[-1]

        gps_dt = 1.0 / self.gps_frequency
        next_gps_time = 0.0

        while s < total_length:

            # Evaluate spline 
            x, y, dx, dy, ddx, ddy = evaluate_spline(
                self.x_spline, self.y_spline, np.array([s])
            )

            x, y = x[0], y[0]
            dx, dy = dx[0], dy[0]
            ddx, ddy = ddx[0], ddy[0]

            # Curvature 
            kappa = compute_curvature(dx=dx, dy=dy, ddx=ddx, ddy=ddy)

            # Speed limit from curvature 
            if abs(kappa) > 0.05:
                v_curve = v_turn
            else:
                v_curve = v_max_global

            v_target = min(v_curve, v_max_global)

            # Longitudinal control
            if v < v_target:
                a = a_max * (v_target - v) / v_target
            else:
                a = -b_max * (v - v_target) / v_target

            # Integrate motion along the spline
            v = max(0.0, v + a * self.dt)  # Prevent negative (Always go forward)
            s = s + v * self.dt  # Advancement on the spline
            t += self.dt


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
            self.positions_as_latlon.append(
                xy_to_latlon(x, y, self.lat0, self.lon0)
            )
            self.velocities.append(vel_vector)
            self.accelerations.append(acc_vector)
            self.time.append(t)

            # Accelerometer measurement
            acc_meas = acc_vector + np.random.normal(0, self.accelerometer_std) + self.acc_drift * acc_drift_direction
            self.acc_measurements.append((t, acc_meas))

            # GPS measurement 
            if t >= next_gps_time:
                gps_x = x + np.random.normal(0, self.gps_std)
                gps_y = y + np.random.normal(0, self.gps_std)

                self.gps_measurements.append(
                    (t, xy_to_latlon(gps_x, gps_y, self.lat0, self.lon0))
                )

                next_gps_time += gps_dt
