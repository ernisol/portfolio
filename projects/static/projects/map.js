const csrftoken = getCookie("csrftoken");

const lat = 48.85997;
const lng = 2.34395;
const height = 14;
const animationSteps = 100;
const animationDuration = 5000; // Total duration of the animation in milliseconds
const animationSpeed = animationDuration / animationSteps;


const map = L.map('map').setView([lat, lng], height);
const slider = document.getElementById("timeline");
slider.max = animationSteps;
slider.addEventListener("input", () => {
    const value = sliderToStep(Number(slider.value));
    render(value);
});
// Blue start marker, red end marker
var startMarker = L.marker([lat-0.01, lng-0.01]).addTo(map).setIcon(L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',  iconSize: [25, 41], iconAnchor: [12, 41]}));
var endMarker = L.marker([lat + 0.01, lng + 0.01]).addTo(map).setIcon(L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', iconSize: [25, 41], iconAnchor: [12, 41]}));
var settingStart = false;
var settingEnd = false;

let playing = false;

var previousHull = null;
var previousPath = null;
const hullCache = [];

var visitedNodes = [];
var finalPath = [];

startMarker.on('click', function() {
    settingStart = true;
    settingEnd = false;
    // Fade the start marker 50% to indicate it's selected
    startMarker.setOpacity(0.5);
});

endMarker.on('click', function() {
    settingStart = false;
    settingEnd = true;
    // Fade the end marker 50% to indicate it's selected
    endMarker.setOpacity(0.5);
});

map.on('click', 
    function(e) {
        const lat = e.latlng.lat;
        const lon = e.latlng.lng;

        if (settingStart) {
            startMarker.setLatLng([lat, lon]);
            // Restore opacity of the start marker
            startMarker.setOpacity(1.0);
        } else if (settingEnd) {
            endMarker.setLatLng([lat, lon]);
            // Restore opacity of the end marker
            endMarker.setOpacity(1.0);
        }
        settingEnd = false;
        settingStart = false;
    }
);

const bounds = [
    [lat - 0.1, lng - 0.1],
    [lat + 0.1, lng + 0.1]
];
map.setMaxBounds(bounds);



L.tileLayer('/projects/api/tiles/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; MapTiler',
    style: 'dark',
    maxBounds: bounds,  // Limit panning around the center of Paris
    maxBoundsViscosity: 1.0,
    minZoom: height - 1, // Allow zooming out one level to see the context
    zoomControl: true,
    dragging: true,
    boxZoom: false,
    keyboard: false,
}).addTo(map);

const nodeLayer = L.layerGroup().addTo(map);

const legend = L.control({ position: "bottomright" });

legend.onAdd = function(map) {

    const div = L.DomUtil.create("div", "legend");

    div.innerHTML = `
        <h4>Legend</h4>
        <div><span class="box visited"></span> Visited </div>
        <div><span class="box frontier"></span> Frontier</div>
        <div><span class="box path"></span> Shortest path</div>
    `;

    return div;
};

legend.addTo(map);

const playButton = document.getElementById("play");

playButton.onclick = () => {

    if (playing) {
        playing = false;
        return;
    }

    startPlayback();
};

// Run button

document.getElementById("run").onclick = async () => {
    // stop playback if it's running
    playing = false;
    const startLatLng = startMarker.getLatLng();
    const endLatLng = endMarker.getLatLng();

    const response = await fetch("/projects/api/solve/",{
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            "X-CSRFToken": csrftoken
        },
        body:JSON.stringify({
            start:[startLatLng.lat, startLatLng.lng],
            goal:[endLatLng.lat, endLatLng.lng],
            alg: document.getElementById("algorithm").value
        })
    });
    const data = await response.json();
    visitedNodes = data.visited;
    finalPath = data.path;

    buildHullCache()
    slider.value = 0;
    slider.dispatchEvent(new Event("input"));
    playButton.click();
    
};

async function buildHullCache(){
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
    
    const points = nodes.map(([lat, lon]) =>
        turf.point([lon, lat])
    );

    const featureCollection = turf.featureCollection(points);

    let hull = turf.convex(featureCollection);
    return hull;
}

async function render(step) {
    

    const t0 = (step - 4) / (animationSteps - 1);
    const t1 = (step - 2) / (animationSteps - 1);
    const t2 = step / (animationSteps - 1);
    const firstNode = Math.max(0, Math.floor(t0* t0 * (3 - 2 * t0) * visitedNodes.length));
    const secondNode = Math.max(0, Math.floor(t1* t1 * (3 - 2 * t1) * visitedNodes.length));
    const lastNode = Math.max(10, Math.ceil(t2* t2 * (3 - 2 * t2) * visitedNodes.length));
    const oldNodes = visitedNodes.slice(firstNode, secondNode);
    const recentNodes = visitedNodes.slice(secondNode, lastNode);

    nodeLayer.clearLayers();
    oldNodes.forEach(([lat, lon]) => {
        L.circleMarker([lat, lon], {
            radius: 1,
            color: 'rgb(189, 241, 0)',
            fillOpacity: 1
        }).addTo(nodeLayer);
    });
    recentNodes.forEach(([lat, lon]) => {
        L.circleMarker([lat, lon], {
            radius: 4,
            color: 'yellow',
            fillOpacity: 1
        }).addTo(nodeLayer);
    });

    if (step >= animationSteps-1) {
        if (previousPath) {
            map.removeLayer(previousPath);
        }
        const pathCoords = finalPath.map(([lat, lon]) => [lat, lon]);
        previousPath = L.polyline(pathCoords, {color: "purple", weight: 5}).addTo(map);
    }
    else if (previousPath) {
        map.removeLayer(previousPath);
        previousPath = null;
    }

    if (step >= hullCache.length) {
        console.warn("Step", step, "exceeds hull cache length", hullCache.length);
        return;
    }
    const hull = hullCache[step];
    if (!hull) console.warn("No hull for step", step);
    console.log("Rendering step", step, "with", hullCache[step].geometry.coordinates[0].length, "hull points");
    const hullCoords = hull.geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);

    if (!previousHull) {

        previousHull = L.polygon(hullCoords, {
            color: "green",
            fillOpacity: 0.2
        }).addTo(map);
        
    } else {

        previousHull.setLatLngs(hullCoords);

    }

}

function sliderToStep(value) {
    const t = value / slider.max;
    return Math.min(Math.ceil(t * animationSteps), animationSteps);

}

async function startPlayback() {

    playing = true;
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
