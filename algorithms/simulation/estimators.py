import numpy as np

from algorithms.simulation.utils import xy_to_latlon


def dead_reckoning(acc_measurements: list[tuple[float, tuple[float, float]]], lat0: float, lon0: float) -> list[tuple[float, float]]:
    """Estimate positions using dead reckoning. Position is integrated from acceleration using:
    dp = v*dt + 0.5*a*dt2
    
    Parameters
    ----------
    acc_measurements: list[tuple[float, tuple[float, float]]]
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

        # integrate motion
        delta = velocity * dt + 0.5 * acc * dt**2
        position = position + delta

        velocity = velocity + acc * dt

        lat, lon = xy_to_latlon(position[0], position[1], lat0, lon0)

        estimates.append((lat, lon))

    return estimates



class KalmanCarFilter:

    def __init__(self, gps_std=5.0, acc_std=0.5, process_std=0.1):

        self.x = np.zeros(6)  # states x, y, vx, vy, ax, ay
        
        self.process_std = process_std

        # Initial covariance
        self.P = np.diag(
            [
                100, 100,  # position
                25, 25,  # velocity
                4, 4,  # acceleration
            ]
        )

        self.last_time = None
        self.last_innovation_norm = 1

        # measurement noise
        self.R_gps = np.eye(2) * gps_std**2
        self.R_acc = np.eye(2) * acc_std**2

        # measurement matrices
        self.H_gps = np.zeros((2, 6))
        self.H_gps[0, 0] = 1  # 
        self.H_gps[1, 1] = 1  # 

        self.H_acc = np.zeros((2, 6))
        self.H_acc[0, 4] = 1  # acc x = acc x
        self.H_acc[1, 5] = 1  # acc

        # history for visualization
        self.history = []

    def build_Q(self, dt):
        dt2 = dt**2
        dt3 = dt**3
        dt4 = dt**4

        q = self.process_std**2

        Q = np.array([
            [dt4/4, 0,      dt3/2, 0,      dt2/2, 0],
            [0,      dt4/4, 0,      dt3/2, 0,      dt2/2],
            [dt3/2, 0,      dt2,   0,      dt,     0],
            [0,      dt3/2, 0,      dt2,   0,      dt],
            [dt2/2, 0,      dt,    0,      1,      0],
            [0,      dt2/2, 0,      dt,    0,      1]
        ]) * q

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
        
        # Surprise
        y = z - H @ self.x

        # Gain - how much we trust
        S = H @ self.P @ H.T + R
        K = self.P @ H.T @ np.linalg.inv(S)

        # Linear compromise
        self.x = self.x + K @ y

        # Update covariance
        I = np.eye(len(self.x))
        self.P = (I - K @ H) @ self.P

        return y, K

    def process_event(self, time, sensor_type, measurement):

        if self.last_time is None:
            self.last_time = time
            return

        dt = time - self.last_time
        self.last_time = time

        self.predict(dt)

        if sensor_type == "gps":
            y, K = self.update(measurement, self.H_gps, self.R_gps)

        elif sensor_type == "acc":
            y, K = self.update(measurement, self.H_acc, self.R_acc)

        else:
            raise ValueError("Unknown sensor")
        
        # Add ellipse points to represent covariance
        
        self.history.append({
            "time": time,
            "state": self.x.copy(),
            "cov": self.P.copy(),
            "innovation": y,
            "sensor": sensor_type,
            "ellipse": self.covariance_to_ellipse_points(innovation=y)
        })

    def covariance_to_ellipse_points(self, innovation):
        cov = self.P[:2, :2]  # Position covariance
        vals, vecs = np.linalg.eigh(cov)  # eigen values and vectors for the ellipse
        
        # 95% confidence interval
        axis1 = 2 * np.sqrt(vals[0])
        axis2 = 2 * np.sqrt(vals[1])

        # Ellipse angle (of large axis relative to x)
        angle = np.arctan2(vecs[1, 0], vecs[0, 0])
        return ellipse_points(center=self.x[:2], axis1=axis1, axis2=axis2, angle=angle)


def ellipse_points(center, axis1, axis2, angle, n=40):
    t = np.linspace(0, 2*np.pi, n)
    ellipse = np.array([axis1 * np.cos(t), axis2 * np.sin(t)])

    R = np.array([
        [np.cos(angle), -np.sin(angle)],
        [np.sin(angle),  np.cos(angle)]
    ])

    rotated = R @ ellipse

    points = rotated.T + center  # shape (n, 2)
    return points