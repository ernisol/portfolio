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
