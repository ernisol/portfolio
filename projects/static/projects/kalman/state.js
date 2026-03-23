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

let mapReadyResolve;
const mapReady = new Promise((resolve) => {
    mapReadyResolve = resolve;
});

map.on("load", () => {
    ensureKalmanLayers();
    addLegendControl();
    applyLegendState();
    mapReadyResolve();
});

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

var settingStart = false;
var settingEnd = false;

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
