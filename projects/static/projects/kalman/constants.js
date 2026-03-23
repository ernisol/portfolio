const csrftoken = getCookie("csrftoken");

const lat = 48.85997;
const lng = 2.34395;
const height = 14;
var totalSimulationTime = 100;
const animationSpeedUpFactor = 10; // Total duration of the animation will be divided by this

const MAP_STYLE_URL = "/tiles/styles/basic-preview/style.json";

const PATH_SOURCE_ID = "kalman-path-source";
const PATH_KALMAN_SOURCE_ID = "kalman-kalman-source";
const PATH_KALMAN_LAYER_ID = "kalman-kalman-layer";
const PATH_LAYER_ID = "kalman-path-layer";
const POINTS_SOURCE_ID = "kalman-points-source";
const POINTS_LAYER_ID = "kalman-points-layer";
const ELLIPSE_SOURCE_ID = "kalman-ellipse-source";
const ELLIPSE_FILL_LAYER_ID = "kalman-ellipse-fill-layer";
const ELLIPSE_STROKE_LAYER_ID = "kalman-ellipse-stroke-layer";
const HIDDEN_POINT_KIND = "__hidden__";

const LEGEND_ITEMS = [
    {
        key: "ground_truth_path",
        label: "Ground truth path",
        kind: "line",
        color: "green",
        layerIds: [PATH_LAYER_ID],
        enabled: true,
    },
    {
        key: "kalman_path",
        label: "Kalman path",
        kind: "line",
        color: "red",
        layerIds: [PATH_KALMAN_LAYER_ID],
        enabled: true,
    },
    {
        key: "ground_truth_point",
        label: "Ground truth point",
        kind: "point",
        color: "lime",
        pointKind: "ground_truth",
        enabled: true,
    },
    {
        key: "dead_reckoning_point",
        label: "Dead reckoning",
        kind: "point",
        color: "orange",
        pointKind: "dead_reckoning",
        enabled: true,
    },
    {
        key: "gps_point",
        label: "GPS measurement",
        kind: "point",
        color: "purple",
        pointKind: "gps",
        enabled: true,
    },
    {
        key: "kalman_point",
        label: "Kalman estimate",
        kind: "point",
        color: "red",
        pointKind: "kalman",
        enabled: true,
    },
    {
        key: "ellipse",
        label: "Uncertainty ellipse",
        kind: "ellipse",
        color: "rgba(255, 0, 0, 0.25)",
        layerIds: [ELLIPSE_FILL_LAYER_ID, ELLIPSE_STROKE_LAYER_ID],
        enabled: true,
    },
];

const legendState = Object.fromEntries(LEGEND_ITEMS.map((item) => [item.key, item.enabled]));
