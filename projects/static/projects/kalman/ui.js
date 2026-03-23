const slider = document.getElementById("timeline");
const gpsStdInput = document.getElementById("gpsStd");
const accStdInput = document.getElementById("accStd");
const accDriftInput = document.getElementById("accDrift");
const gpsStdValue = document.getElementById("gpsStdValue");
const accStdValue = document.getElementById("accStdValue");
const accDriftValue = document.getElementById("accDriftValue");
const playButton = document.getElementById("play");
const runButton = document.getElementById("run");
const playButtonIcon = playButton.querySelector(".playButtonIcon");
const playButtonLabel = playButton.querySelector(".playButtonLabel");

const DEFAULT_GPS_STD = 5;
const DEFAULT_ACC_STD = 0.1;
const DEFAULT_ACC_DRIFT = 0.01;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function parseSensorInput(input, fallback, min, max) {
    const parsed = Number.parseFloat(input.value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return clamp(parsed, min, max);
}

function updateSensorLabels() {
    gpsStdValue.textContent = parseSensorInput(gpsStdInput, DEFAULT_GPS_STD, 0.1, 50).toFixed(1);
    accStdValue.textContent = parseSensorInput(accStdInput, DEFAULT_ACC_STD, 0.01, 1).toFixed(2);
    accDriftValue.textContent = parseSensorInput(accDriftInput, DEFAULT_ACC_DRIFT, 0, 0.1).toFixed(3);
}

gpsStdInput.addEventListener("input", updateSensorLabels);
accStdInput.addEventListener("input", updateSensorLabels);
accDriftInput.addEventListener("input", updateSensorLabels);
updateSensorLabels();

function setPlayButtonState(isPlaying) {
    playButton.dataset.state = isPlaying ? "playing" : "paused";
    if (playButtonIcon) {
        playButtonIcon.textContent = isPlaying ? "||" : ">";
    }
    if (playButtonLabel) {
        playButtonLabel.textContent = isPlaying ? "Pause" : "Play";
    }
}

setPlayButtonState(false);

slider.addEventListener("input", () => {
    const value = sliderToTime(Number(slider.value));
    renderCar(value);
});

playButton.onclick = () => {

    if (playing) {
        playing = false;
        setPlayButtonState(false);
        return;
    }

    startPlayback();
};

runButton.onclick = main;

function toXY(data, xKey, yKey) {
    return data.map(d => ({
        x: d[xKey],
        y: d[yKey]
    }));
}

const speedChartCtx = document.getElementById("speedChart").getContext("2d");
const speedChart = new Chart(speedChartCtx, {
    type: "line",
    data: {
        datasets: [
            {
                label: "Ground truth",
                data: [],
                borderColor: "green",
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: "Kalman",
                data: [],
                borderColor: "red",
                borderWidth: 2,
                pointRadius: 0
            }
        ]
    },
    options: {
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        scales: {
            x: { type: "linear", title: { display: true, text: "Time (s)" } },
            y: { title: { display: true, text: "Speed (m/s)" } }
        }
    }
});

const accChartCtx = document.getElementById("accChart").getContext("2d");
const accChart = new Chart(accChartCtx, {
    type: "line",
    data: {
        datasets: [
            {
                label: "Ground truth",
                data: [],
                borderColor: "green",
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: "Measured",
                data: [],
                borderColor: "orange",
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: "Kalman",
                data: [],
                borderColor: "red",
                borderWidth: 2,
                pointRadius: 0
            }
        ]
    },
    options: {
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        scales: {
            x: { type: "linear", title: { display: true, text: "Time (s)" } },
            y: { title: { display: true, text: "Acceleration (m/s²)" }, max: 2 }
        }
    }
});

const errChartCtx = document.getElementById("errChart").getContext("2d");
const errChart = new Chart(errChartCtx, {
    type: "line",
    data: {
        datasets: [
            {
                label: "Kalman",
                data: [],
                borderColor: "red",
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: "GPS",
                data: [],
                borderColor: "purple",
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: "Dead reckoning",
                data: [],
                borderColor: "orange",
                borderWidth: 2,
                pointRadius: 0
            }
        ]
    },
    options: {
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        scales: {
            x: { type: "linear", title: { display: true, text: "Time (s)" } },
            y: { title: { display: true, text: "Estimation error (m)" }, max: 100 }
        }
    }
});
