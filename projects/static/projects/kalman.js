const csrftoken = getCookie("csrftoken");

const lat = 48.85997;
const lng = 2.34395;
const height = 14;
var totalSimulationTime = 100;
const animationSpeedUpFactor = 10; // Total duration of the animation will be divided by this

const MAP_STYLE_URL = "/tiles/styles/basic-preview/style.json";

function normalizeAbsoluteUrl(url) {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    return new URL(url, window.location.origin).toString();
}

const map = new maplibregl.Map({
    container: "map",
    style: MAP_STYLE_URL,
    transformRequest: (url) => ({
        url: normalizeAbsoluteUrl(url),
    }),
    center: [lng, lat],
    zoom: height,
    minZoom: height - 1,
    maxBounds: [
        [lng - 0.1, lat - 0.1],
        [lng + 0.1, lat + 0.1],
    ],
    attributionControl: true,
});

map.dragRotate.disable();
map.touchZoomRotate.disableRotation();

const PATH_SOURCE_ID = "kalman-path-source";
const PATH_LAYER_ID = "kalman-path-layer";
const POINTS_SOURCE_ID = "kalman-points-source";
const POINTS_LAYER_ID = "kalman-points-layer";
const ELLIPSE_SOURCE_ID = "kalman-ellipse-source";
const ELLIPSE_FILL_LAYER_ID = "kalman-ellipse-fill-layer";
const ELLIPSE_STROKE_LAYER_ID = "kalman-ellipse-stroke-layer";

let mapReadyResolve;
const mapReady = new Promise((resolve) => {
    mapReadyResolve = resolve;
});

map.on("load", () => {
    ensureKalmanLayers();
    addLegendControl();
    mapReadyResolve();
});

const slider = document.getElementById("timeline");

slider.addEventListener("input", () => {
    const value = sliderToTime(Number(slider.value));
    renderCar(value);
});

const speedChartCtx = document.getElementById('speedChart').getContext('2d');
const speedChart = new Chart(speedChartCtx, {
    type: 'line',
    data: {
        datasets: [
            {
                label: 'Ground truth',
                data: [],
                borderColor: 'green',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: 'Kalman',
                data: [],
                borderColor: 'red',
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
            x: { type: 'linear', title: { display: true, text: 'Time (s)' } },
            y: { title: { display: true, text: 'Speed (m/s)' } }
        }
    }
});

const accChartCtx = document.getElementById('accChart').getContext('2d');
const accChart = new Chart(accChartCtx, {
    type: 'line',
    data: {
        datasets: [
            {
                label: 'Ground truth',
                data: [],
                borderColor: 'green',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: 'Measured',
                data: [],
                borderColor: 'orange',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: 'Kalman',
                data: [],
                borderColor: 'red',
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
            x: { type: 'linear', title: { display: true, text: 'Time (s)' } },
            y: { title: { display: true, text: 'Acceleration (m/s²)' }, max: 2 }
        }
    }
});

const errChartCtx = document.getElementById('errChart').getContext('2d');
const errChart = new Chart(errChartCtx, {
    type: 'line',
    data: {
        datasets: [
            {
                label: 'Kalman',
                data: [],
                borderColor: 'red',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: 'GPS',
                data: [],
                borderColor: 'purple',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: 'Dead reckoning',
                data: [],
                borderColor: 'orange',
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
            x: { type: 'linear', title: { display: true, text: 'Time (s)' } },
            y: { title: { display: true, text: 'Estimation error (m)' }, max: 100 }
        }
    }
});

// Blue start marker, red end marker
var startMarker = new maplibregl.Marker({
    element: buildMarkerElement(
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png"
    ),
    anchor: "bottom",
})
    .setLngLat([lng - 0.01, lat - 0.01])
    .addTo(map);

var endMarker = new maplibregl.Marker({
    element: buildMarkerElement(
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png"
    ),
    anchor: "bottom",
})
    .setLngLat([lng + 0.01, lat + 0.01])
    .addTo(map);

var settingStart = false;
var settingEnd = false;

let playing = false;

var simulationData = null;

var ellipsePoints = [];
var carPositions = [];
var deadReckoning = [];
var gpsMeasurements = [];
var gptsTimes = [];
var simulationTimes = [];
var kalmanTimes = [];
var kalmanPositions = [];

startMarker.getElement().addEventListener("click", function (event) {
    event.stopPropagation();
    settingStart = true;
    settingEnd = false;
    // Fade the start marker 50% to indicate it's selected
    startMarker.getElement().style.opacity = "0.5";
});

endMarker.getElement().addEventListener("click", function (event) {
    event.stopPropagation();
    settingStart = false;
    settingEnd = true;
    // Fade the end marker 50% to indicate it's selected
    endMarker.getElement().style.opacity = "0.5";
});

map.on("click",
    function (e) {
        const clickedLat = e.lngLat.lat;
        const clickedLon = e.lngLat.lng;

        if (settingStart) {
            startMarker.setLngLat([clickedLon, clickedLat]);
            // Restore opacity of the start marker
            startMarker.getElement().style.opacity = "1.0";
        } else if (settingEnd) {
            endMarker.setLngLat([clickedLon, clickedLat]);
            // Restore opacity of the end marker
            endMarker.getElement().style.opacity = "1.0";
        }
        settingEnd = false;
        settingStart = false;
        main();
    }
);

const playButton = document.getElementById("play");

playButton.onclick = () => {

    if (playing) {
        playing = false;
        return;
    }

    startPlayback();
};

// Run button
function toXY(data, xKey, yKey) {
    return data.map(d => ({
        x: d[xKey],
        y: d[yKey]
    }));
}

const runButton = document.getElementById("run")

function sortByTime(features) {
    return [...features].sort((a, b) => a.properties.time - b.properties.time);
}

async function main() {
    await mapReady;

    // stop playback if it's running
    playing = false;
    const startLatLng = startMarker.getLngLat();
    const endLatLng = endMarker.getLngLat();

    const response = await fetch("/projects/api/kalman/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken
        },
        body: JSON.stringify({
            start: [startLatLng.lat, startLatLng.lng],
            goal: [endLatLng.lat, endLatLng.lng],
        })
    });

    if (!response.ok) {
        return;
    }

    simulationData = await response.json();

    const groundTruthFeatures = sortByTime(simulationData.ground_truth_points.features);
    const deadReckoningFeatures = sortByTime(simulationData.dead_reckoning_points.features);
    const gpsFeatures = sortByTime(simulationData.gps_points.features);
    const kalmanFeatures = sortByTime(simulationData.kalman_points.features);
    const kalmanEllipseFeatures = sortByTime(simulationData.kalman_ellipses.features);

    simulationData.ground_truth = groundTruthFeatures.map(f => f.properties);
    simulationData.estimators = deadReckoningFeatures.map(f => ({
        time: f.properties.time,
        dead_reckoning_error: f.properties.error,
    }));
    simulationData.gps = gpsFeatures.map(f => ({
        time: f.properties.time,
        error: f.properties.error,
    }));
    simulationData.kalman = kalmanFeatures.map(f => f.properties);

    carPositions = groundTruthFeatures.map(f => f.geometry.coordinates);
    simulationTimes = groundTruthFeatures.map(f => f.properties.time);
    totalSimulationTime = simulationTimes[simulationTimes.length - 1];
    deadReckoning = deadReckoningFeatures.map(f => f.geometry.coordinates);
    gptsTimes = gpsFeatures.map(f => f.properties.time);
    gpsMeasurements = gpsFeatures.map(f => f.geometry.coordinates);
    kalmanPositions = kalmanFeatures.map(f => f.geometry.coordinates);
    kalmanTimes = kalmanFeatures.map(f => f.properties.time);
    ellipsePoints = kalmanEllipseFeatures.map(f => f.geometry.coordinates[0]);

    updateLineSource(PATH_SOURCE_ID, {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: carPositions,
                },
                properties: { series: "ground_truth" },
            },
        ],
    });


    speedChart.options.scales.x.max = totalSimulationTime;
    accChart.options.scales.x.max = totalSimulationTime;
    errChart.options.scales.x.max = totalSimulationTime;
    slider.value = 0;
    startPlayback()
};

runButton.onclick = main;

async function renderCar(time) {
    await mapReady;

    if (!simulationData || simulationTimes.length === 0) {
        return;
    }

    // Convert step to list index
    const positionIndex = getClosestCeil(simulationTimes, time) ?? (simulationTimes.length - 1);
    const gpsIndex = getClosestCeil(gptsTimes, time) ?? (gptsTimes.length - 1);
    const kalmanIndex = getClosestCeil(kalmanTimes, time) ?? (kalmanTimes.length - 1);

    const pos = carPositions[positionIndex];
    const dr = deadReckoning[positionIndex];
    const gps = gpsMeasurements[gpsIndex];
    const kalman = kalmanPositions[kalmanIndex];

    updatePointSource(POINTS_SOURCE_ID, [
        { kind: "ground_truth", coordinates: pos },
        { kind: "dead_reckoning", coordinates: dr },
        { kind: "gps", coordinates: gps },
        { kind: "kalman", coordinates: kalman },
    ]);

    const ellipse = ellipsePoints[kalmanIndex];
    if (ellipse && ellipse.length > 3) {
        updatePolygonSource(ELLIPSE_SOURCE_ID, ellipse);
    } else {
        updateLineSource(ELLIPSE_SOURCE_ID, {
            type: "FeatureCollection",
            features: [],
        });
    }


    speedChart.data.datasets[0].data = toXY(simulationData.ground_truth.slice(0, positionIndex), "time", "speed");
    speedChart.data.datasets[1].data = toXY(simulationData.kalman.slice(0, kalmanIndex), "time", "speed");
    speedChart.update();

    accChart.data.datasets[0].data = toXY(simulationData.ground_truth.slice(0, positionIndex), "time", "acceleration");
    accChart.data.datasets[1].data = toXY(simulationData.acceleration_series.slice(0, positionIndex), "time", "acceleration");
    accChart.data.datasets[2].data = toXY(simulationData.kalman.slice(0, kalmanIndex), "time", "acceleration");
    accChart.update();

    errChart.data.datasets[0].data = toXY(simulationData.kalman.slice(0, kalmanIndex), "time", "error");
    errChart.data.datasets[1].data = toXY(simulationData.gps.slice(0, gpsIndex), "time", "error");
    errChart.data.datasets[2].data = toXY(simulationData.estimators.slice(0, positionIndex), "time", "dead_reckoning_error");
    errChart.update();
}

function getClosestCeil(times, targetTime) {
    let left = 0;
    let right = times.length - 1;
    let result = null;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const time = times[mid];

        if (time >= targetTime) {
            result = mid; // possible answer
            right = mid - 1;       // try to find a closer one
        } else {
            left = mid + 1;
        }
    }

    return result;
}

function sliderToTime(value) {
    const t = value / slider.max;
    return t * totalSimulationTime;
}

async function startPlayback() {

    playing = true;
    var sleepTime = 1000 * totalSimulationTime / animationSpeedUpFactor / Number(slider.max);  // ms by step
    console.warn(sleepTime);
    console.warn(Number(slider.max));
    while (playing && Number(slider.value) < Number(slider.max)) {
        const startTime = performance.now();
        slider.dispatchEvent(new Event("input"));
        const elapsed = performance.now() - startTime;
        if (elapsed < sleepTime)
            await new Promise(r => setTimeout(r, sleepTime - elapsed));

        slider.value = Number(slider.value) + 1;
    }

    playing = false;
}

function buildMarkerElement(iconUrl) {
    const el = document.createElement("img");
    el.src = iconUrl;
    el.style.width = "25px";
    el.style.height = "41px";
    el.style.cursor = "pointer";
    el.style.userSelect = "none";
    return el;
}

function ensureKalmanLayers() {
    if (!map.getSource(PATH_SOURCE_ID)) {
        map.addSource(PATH_SOURCE_ID, {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: [],
            },
        });
    }

    if (!map.getLayer(PATH_LAYER_ID)) {
        map.addLayer({
            id: PATH_LAYER_ID,
            type: "line",
            source: PATH_SOURCE_ID,
            paint: {
                "line-color": "green",
                "line-width": 2,
            },
        });
    }

    if (!map.getSource(POINTS_SOURCE_ID)) {
        map.addSource(POINTS_SOURCE_ID, {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: [],
            },
        });
    }

    if (!map.getLayer(POINTS_LAYER_ID)) {
        map.addLayer({
            id: POINTS_LAYER_ID,
            type: "circle",
            source: POINTS_SOURCE_ID,
            paint: {
                "circle-radius": 6,
                "circle-color": [
                    "match",
                    ["get", "kind"],
                    "ground_truth",
                    "lime",
                    "dead_reckoning",
                    "orange",
                    "gps",
                    "purple",
                    "kalman",
                    "red",
                    "white",
                ],
                "circle-opacity": 1,
            },
        });
    }

    if (!map.getSource(ELLIPSE_SOURCE_ID)) {
        map.addSource(ELLIPSE_SOURCE_ID, {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: [],
            },
        });
    }

    if (!map.getLayer(ELLIPSE_FILL_LAYER_ID)) {
        map.addLayer({
            id: ELLIPSE_FILL_LAYER_ID,
            type: "fill",
            source: ELLIPSE_SOURCE_ID,
            paint: {
                "fill-color": "red",
                "fill-opacity": 0.2,
            },
        });
    }

    if (!map.getLayer(ELLIPSE_STROKE_LAYER_ID)) {
        map.addLayer({
            id: ELLIPSE_STROKE_LAYER_ID,
            type: "line",
            source: ELLIPSE_SOURCE_ID,
            paint: {
                "line-color": "red",
                "line-width": 1,
            },
        });
    }
}

function addLegendControl() {
    const existing = document.getElementById("kalman-legend");
    if (existing) {
        return;
    }

    const container = map.getContainer();
    const div = document.createElement("div");
    div.id = "kalman-legend";
    div.className = "legend";
    div.style.position = "absolute";
    div.style.bottom = "20px";
    div.style.right = "20px";
    div.style.zIndex = "1";

    div.innerHTML = `
        <h4>Legend</h4>
        <div><span class="box visited"></span> Visited </div>
        <div><span class="box frontier"></span> Frontier</div>
        <div><span class="box path"></span> Shortest path</div>
    `;
    container.appendChild(div);
}

function updateLineSource(sourceId, data) {
    const source = map.getSource(sourceId);
    if (!source) {
        return;
    }
    source.setData(data);
}

function updatePointSource(sourceId, points) {
    const features = points
        .filter((point) => Array.isArray(point.coordinates))
        .map((point) => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: point.coordinates,
            },
            properties: {
                kind: point.kind,
            },
        }));

    updateLineSource(sourceId, {
        type: "FeatureCollection",
        features,
    });
}

function updatePolygonSource(sourceId, ring) {
    updateLineSource(sourceId, {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "Polygon",
                    coordinates: [ring],
                },
                properties: {},
            },
        ],
    });
}


function getCookie(name) {
    let cookieValue = null;

    if (document.cookie && document.cookie !== "") {
        const cookies = document.cookie.split(";");

        for (let cookie of cookies) {
            cookie = cookie.trim();

            if (cookie.startsWith(name + "=")) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }

    return cookieValue;
}
