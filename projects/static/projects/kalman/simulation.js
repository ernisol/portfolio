function sortByTime(features) {
    return [...features].sort((a, b) => a.properties.time - b.properties.time);
}

async function main() {
    await mapReady;

    // stop playback if it's running
    playing = false;
    setPlayButtonState(false);
    const gpsStd = parseSensorInput(gpsStdInput, DEFAULT_GPS_STD, 0.1, 50);
    const accStd = parseSensorInput(accStdInput, DEFAULT_ACC_STD, 0.01, 1);
    const accDrift = parseSensorInput(accDriftInput, DEFAULT_ACC_DRIFT, 0, 0.1);
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
            gps_std: gpsStd,
            acc_std: accStd,
            acc_drift: accDrift,
        })
    });

    if (!response.ok) {
        setPlayButtonState(false);
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

    updateLineSource(PATH_KALMAN_SOURCE_ID, {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: kalmanPositions,
                },
                properties: { series: "kalman" },
            },
        ],
    });

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

    applyLegendState();

    speedChart.options.scales.x.max = totalSimulationTime;
    accChart.options.scales.x.max = totalSimulationTime;
    errChart.options.scales.x.max = totalSimulationTime;
    slider.value = 0;
    startPlayback();
}

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
            result = mid;
            right = mid - 1;
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
    setPlayButtonState(true);
    var sleepTime = 1000 * totalSimulationTime / animationSpeedUpFactor / Number(slider.max);
    while (playing && Number(slider.value) < Number(slider.max)) {
        const startTime = performance.now();
        slider.dispatchEvent(new Event("input"));
        const elapsed = performance.now() - startTime;
        if (elapsed < sleepTime) {
            await new Promise(r => setTimeout(r, sleepTime - elapsed));
        }

        slider.value = Number(slider.value) + 1;
    }

    playing = false;
    setPlayButtonState(false);
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

    if (!map.getSource(PATH_KALMAN_SOURCE_ID)) {
        map.addSource(PATH_KALMAN_SOURCE_ID, {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: [],
            },
        });
    }

    if (!map.getLayer(PATH_KALMAN_LAYER_ID)) {
        map.addLayer({
            id: PATH_KALMAN_LAYER_ID,
            type: "line",
            source: PATH_KALMAN_SOURCE_ID,
            paint: {
                "line-color": "red",
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
    div.className = "legend kalmanLegend";

    const title = document.createElement("h4");
    title.textContent = "Legend";
    div.appendChild(title);

    for (const item of LEGEND_ITEMS) {
        const row = document.createElement("label");
        row.className = "legendToggle";
        row.dataset.legendKey = item.key;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = legendState[item.key];
        checkbox.dataset.legendKey = item.key;

        checkbox.addEventListener("change", (event) => {
            legendState[item.key] = event.target.checked;
            syncLegendUi(item.key);
            applyLegendState();
        });

        const swatch = document.createElement("span");
        swatch.className = `legendSwatch legendSwatch-${item.kind}`;
        swatch.style.setProperty("--legend-color", item.color);

        const text = document.createElement("span");
        text.className = "legendLabel";
        text.textContent = item.label;

        row.appendChild(checkbox);
        row.appendChild(swatch);
        row.appendChild(text);
        div.appendChild(row);

        syncLegendUi(item.key);
    }

    container.appendChild(div);
}

function syncLegendUi(key) {
    const row = document.querySelector(`[data-legend-key="${key}"]`);
    if (!row) {
        return;
    }
    row.classList.toggle("is-disabled", !legendState[key]);
}

function applyLegendState() {
    applyPointLegendState();

    for (const item of LEGEND_ITEMS) {
        if (!item.layerIds) {
            continue;
        }
        const visibility = legendState[item.key] ? "visible" : "none";
        for (const layerId of item.layerIds) {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(layerId, "visibility", visibility);
            }
        }
    }
}

function applyPointLegendState() {
    if (!map.getLayer(POINTS_LAYER_ID)) {
        return;
    }

    const enabledKinds = LEGEND_ITEMS
        .filter((item) => item.pointKind && legendState[item.key])
        .map((item) => item.pointKind);

    if (enabledKinds.length === 0) {
        map.setFilter(POINTS_LAYER_ID, ["==", ["get", "kind"], HIDDEN_POINT_KIND]);
        return;
    }

    map.setFilter(POINTS_LAYER_ID, ["match", ["get", "kind"], enabledKinds, true, false]);
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
