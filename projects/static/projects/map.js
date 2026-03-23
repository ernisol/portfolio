const csrftoken = getCookie("csrftoken");

const lat = 48.85997;
const lng = 2.34395;
const height = 14;
const animationSteps = 100;
const animationDuration = 5000; // Total duration of the animation in milliseconds
const animationSpeed = animationDuration / animationSteps;
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

const OLD_NODES_SOURCE_ID = "pathfinding-old-nodes-source";
const OLD_NODES_LAYER_ID = "pathfinding-old-nodes-layer";
const RECENT_NODES_SOURCE_ID = "pathfinding-recent-nodes-source";
const RECENT_NODES_LAYER_ID = "pathfinding-recent-nodes-layer";
const PATH_SOURCE_ID = "pathfinding-path-source";
const PATH_LAYER_ID = "pathfinding-path-layer";
const HULL_SOURCE_ID = "pathfinding-hull-source";
const HULL_FILL_LAYER_ID = "pathfinding-hull-fill-layer";
const HULL_LINE_LAYER_ID = "pathfinding-hull-line-layer";

const LEGEND_ITEMS = [
    {
        key: "visited",
        label: "Visited",
        kind: "point",
        color: "rgb(189, 241, 0)",
        layerIds: [OLD_NODES_LAYER_ID],
        enabled: true,
    },
    {
        key: "frontier",
        label: "Frontier",
        kind: "point",
        color: "yellow",
        layerIds: [RECENT_NODES_LAYER_ID],
        enabled: true,
    },
    {
        key: "path",
        label: "Shortest path",
        kind: "line",
        color: "purple",
        layerIds: [PATH_LAYER_ID],
        enabled: true,
    },
    {
        key: "hull",
        label: "Convex hull",
        kind: "area",
        color: "rgba(0, 128, 0, 0.2)",
        layerIds: [HULL_FILL_LAYER_ID, HULL_LINE_LAYER_ID],
        enabled: true,
    },
];

const legendState = Object.fromEntries(LEGEND_ITEMS.map((item) => [item.key, item.enabled]));

let mapReadyResolve;
const mapReady = new Promise((resolve) => {
    mapReadyResolve = resolve;
});

map.on("load", () => {
    ensureMapLayers();
    addLegendControl();
    applyLegendState();
    setPlayButtonState(false);
    mapReadyResolve();
});

const slider = document.getElementById("timeline");
slider.max = animationSteps;
slider.addEventListener("input", () => {
    const value = sliderToStep(Number(slider.value));
    render(value);
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

const hullCache = [];

var visitedNodes = [];
var finalPath = [];

function sortedByIndex(features) {
    return [...features].sort((a, b) => a.properties.index - b.properties.index);
}

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
    }
);

const playButton = document.getElementById("play");
const runButton = document.getElementById("run");
const playButtonIcon = playButton.querySelector(".playButtonIcon");
const playButtonLabel = playButton.querySelector(".playButtonLabel");

function setPlayButtonState(isPlaying) {
    playButton.dataset.state = isPlaying ? "playing" : "paused";
    if (playButtonIcon) {
        playButtonIcon.textContent = isPlaying ? "||" : ">";
    }
    if (playButtonLabel) {
        playButtonLabel.textContent = isPlaying ? "Pause" : "Play";
    }
}

playButton.onclick = () => {

    if (playing) {
        playing = false;
        setPlayButtonState(false);
        return;
    }

    startPlayback();
};

// Run button

runButton.onclick = async () => {
    await mapReady;

    // stop playback if it's running
    playing = false;
    setPlayButtonState(false);
    const startLatLng = startMarker.getLngLat();
    const endLatLng = endMarker.getLngLat();

    const response = await fetch("/projects/api/solve/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken
        },
        body: JSON.stringify({
            start: [startLatLng.lat, startLatLng.lng],
            goal: [endLatLng.lat, endLatLng.lng],
            alg: document.getElementById("algorithm").value
        })
    });

    if (!response.ok) {
        setPlayButtonState(false);
        return;
    }

    const data = await response.json();
    const visitedFeatures = sortedByIndex(data.visited_points.features);
    visitedNodes = visitedFeatures.map(feature => feature.geometry.coordinates);

    const pathFeature = data.path_lines.features[0];
    finalPath = pathFeature ? pathFeature.geometry.coordinates : [];

    buildHullCache();
    applyLegendState();
    slider.value = 0;
    slider.dispatchEvent(new Event("input"));
    playButton.click();

};

async function buildHullCache() {
    hullCache.length = 0;
    for (let i = 0; i < animationSteps; i++) {

        const t = i / (animationSteps - 1);
        const numberOfNodes = Math.max(10, Math.ceil(t * t * (3 - 2 * t) * visitedNodes.length)); // Quadratic growth for more nodes in later steps

        const subset = visitedNodes.slice(0, numberOfNodes);
        const hull = computeHull(subset);
        hullCache.push(hull);

        await new Promise(r => setTimeout(r, 10));
    }
}

function computeHull(nodes) {

    if (nodes.length < 3) {
        return null;
    }

    const points = nodes.map((coordinates) =>
        turf.point(coordinates)
    );

    const featureCollection = turf.featureCollection(points);

    let hull = turf.convex(featureCollection);
    return hull;
}

async function render(step) {
    await mapReady;

    if (visitedNodes.length === 0) {
        return;
    }

    const t0 = (step - 4) / (animationSteps - 1);
    const t1 = (step - 2) / (animationSteps - 1);
    const t2 = step / (animationSteps - 1);
    const firstNode = Math.max(0, Math.floor(t0 * t0 * (3 - 2 * t0) * visitedNodes.length));
    const secondNode = Math.max(0, Math.floor(t1 * t1 * (3 - 2 * t1) * visitedNodes.length));
    const lastNode = Math.max(10, Math.ceil(t2 * t2 * (3 - 2 * t2) * visitedNodes.length));
    const oldNodes = visitedNodes.slice(firstNode, secondNode);
    const recentNodes = visitedNodes.slice(secondNode, lastNode);

    updatePointSource(OLD_NODES_SOURCE_ID, oldNodes);
    updatePointSource(RECENT_NODES_SOURCE_ID, recentNodes);

    if (step >= animationSteps - 1) {
        updateLineSource(PATH_SOURCE_ID, finalPath);
    }
    else {
        updateLineSource(PATH_SOURCE_ID, []);
    }

    if (step >= hullCache.length) {
        console.warn("Step", step, "exceeds hull cache length", hullCache.length);
        return;
    }
    const hull = hullCache[step];
    if (!hull) {
        updateHullSource(null);
        return;
    }

    updateHullSource(hull);

}

function sliderToStep(value) {
    const t = value / slider.max;
    return Math.min(Math.ceil(t * animationSteps), animationSteps);

}

async function startPlayback() {

    playing = true;
    setPlayButtonState(true);
    while (playing && Number(slider.value) < Number(slider.max)) {

        // Trigger input event to render the current step synchronously
        const startTime = performance.now();
        slider.dispatchEvent(new Event("input"));
        const elapsed = performance.now() - startTime;
        // Skip animation steps if rendering takes too long
        const skip = 1 + Math.floor(elapsed / animationSpeed);
        // wait if we are ahead of schedule
        if (elapsed < animationSpeed) {
            await new Promise(r => setTimeout(r, animationSpeed - elapsed));
        }

        slider.value = Math.min(Number(slider.value) + skip, Number(slider.max));
    }

    playing = false;
    setPlayButtonState(false);
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

function buildMarkerElement(iconUrl) {
    const el = document.createElement("img");
    el.src = iconUrl;
    el.style.width = "25px";
    el.style.height = "41px";
    el.style.cursor = "pointer";
    el.style.userSelect = "none";
    return el;
}

function ensureMapLayers() {
    ensureGeoJsonSource(OLD_NODES_SOURCE_ID);
    ensureGeoJsonSource(RECENT_NODES_SOURCE_ID);
    ensureGeoJsonSource(PATH_SOURCE_ID);
    ensureGeoJsonSource(HULL_SOURCE_ID);

    if (!map.getLayer(OLD_NODES_LAYER_ID)) {
        map.addLayer({
            id: OLD_NODES_LAYER_ID,
            type: "circle",
            source: OLD_NODES_SOURCE_ID,
            paint: {
                "circle-radius": 1,
                "circle-color": "rgb(189, 241, 0)",
                "circle-opacity": 1,
            },
        });
    }

    if (!map.getLayer(RECENT_NODES_LAYER_ID)) {
        map.addLayer({
            id: RECENT_NODES_LAYER_ID,
            type: "circle",
            source: RECENT_NODES_SOURCE_ID,
            paint: {
                "circle-radius": 4,
                "circle-color": "yellow",
                "circle-opacity": 1,
            },
        });
    }

    if (!map.getLayer(PATH_LAYER_ID)) {
        map.addLayer({
            id: PATH_LAYER_ID,
            type: "line",
            source: PATH_SOURCE_ID,
            paint: {
                "line-color": "purple",
                "line-width": 5,
            },
        });
    }

    if (!map.getLayer(HULL_FILL_LAYER_ID)) {
        map.addLayer({
            id: HULL_FILL_LAYER_ID,
            type: "fill",
            source: HULL_SOURCE_ID,
            paint: {
                "fill-color": "green",
                "fill-opacity": 0.2,
            },
        });
    }

    if (!map.getLayer(HULL_LINE_LAYER_ID)) {
        map.addLayer({
            id: HULL_LINE_LAYER_ID,
            type: "line",
            source: HULL_SOURCE_ID,
            paint: {
                "line-color": "green",
                "line-width": 1,
            },
        });
    }
}

function ensureGeoJsonSource(sourceId) {
    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: [],
            },
        });
    }
}

function addLegendControl() {
    const existing = document.getElementById("map-legend");
    if (existing) {
        return;
    }

    const container = map.getContainer();
    const div = document.createElement("div");
    div.id = "map-legend";
    div.className = "legend mapLegend";

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
    for (const item of LEGEND_ITEMS) {
        const visibility = legendState[item.key] ? "visible" : "none";
        for (const layerId of item.layerIds) {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(layerId, "visibility", visibility);
            }
        }
    }
}

function updatePointSource(sourceId, coordinatesList) {
    const source = map.getSource(sourceId);
    if (!source) {
        return;
    }

    source.setData({
        type: "FeatureCollection",
        features: coordinatesList.map((coordinates) => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates,
            },
            properties: {},
        })),
    });
}

function updateLineSource(sourceId, coordinates) {
    const source = map.getSource(sourceId);
    if (!source) {
        return;
    }

    source.setData({
        type: "FeatureCollection",
        features: coordinates.length > 1 ? [
            {
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates,
                },
                properties: {},
            },
        ] : [],
    });
}

function updateHullSource(hullFeature) {
    const source = map.getSource(HULL_SOURCE_ID);
    if (!source) {
        return;
    }

    source.setData({
        type: "FeatureCollection",
        features: hullFeature ? [hullFeature] : [],
    });
}
