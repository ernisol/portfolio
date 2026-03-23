const csrftoken = getCookie("csrftoken");

const lat = 48.85997;
const lng = 2.34395;
const height = 14;
const animationSteps = 100;
const animationDuration = 5000; // Total duration of the animation in milliseconds
const animationSpeed = animationDuration / animationSteps;
const MAP_STYLE_URL = "/tiles/styles/basic-preview/style.json";

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
