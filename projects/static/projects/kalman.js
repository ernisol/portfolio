const csrftoken = getCookie("csrftoken");

const lat = 48.85997;
const lng = 2.34395;
const height = 14;
var totalSimulationTime = 100
const animationSpeedUpFactor = 10; // Total duration of the animation will be divided by this


const map = L.map('map').setView([lat, lng], height);
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
            x: { type: 'linear', title: { display: true, text: 'Time (s)' }},
            y: { title: { display: true, text: 'Speed (m/s)' }}
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
            x: { type: 'linear', title: { display: true, text: 'Time (s)' }},
            y: { title: { display: true, text: 'Acceleration (m/s²)' }, max: 2}
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
            x: { type: 'linear', title: { display: true, text: 'Time (s)' }},
            y: { title: { display: true, text: 'Estimation error (m)' }, max: 100}
        }
    }
});

// Blue start marker, red end marker
var startMarker = L.marker([lat-0.01, lng-0.01]).addTo(map).setIcon(L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',  iconSize: [25, 41], iconAnchor: [12, 41]}));
var endMarker = L.marker([lat + 0.01, lng + 0.01]).addTo(map).setIcon(L.icon({iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png', iconSize: [25, 41], iconAnchor: [12, 41]}));
var settingStart = false;
var settingEnd = false;

let playing = false;
let newData = true;

var simulationData = null;

var previousPathLayer=L.layerGroup().addTo(map);
let previousPath = false;
var ellipsePoints = [];
var carPositions = [];
var deadReckoning = [];
var gpsMeasurements = [];
var gptsTimes = [];
var simulationTimes=[];
var kalmanTimes = [];
var kalmanPositions = [];
const carLayer = L.layerGroup().addTo(map);

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
        main();
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
function toXY(data, xKey, yKey) {
  return data.map(d => ({
    x: d[xKey],
    y: d[yKey]
  }));
}

const runButton = document.getElementById("run")
async function main() {
    // stop playback if it's running
    playing = false;
    const startLatLng = startMarker.getLatLng();
    const endLatLng = endMarker.getLatLng();

    const response = await fetch("/projects/api/kalman/",{
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            "X-CSRFToken": csrftoken
        },
        body:JSON.stringify({
            start:[startLatLng.lat, startLatLng.lng],
            goal:[endLatLng.lat, endLatLng.lng],
        })
    });
    simulationData = await response.json();
    previousPathLayer.clearLayers();
    previousPath = true;
    newData = true;
    carPositions = simulationData.ground_truth.map(d => d.position);
    simulationTimes = simulationData.ground_truth.map(d => d.time);
    totalSimulationTime = simulationData.ground_truth[simulationData.ground_truth.length-1].time
    deadReckoning = simulationData.estimators.map(d => d.dead_reckoning);
    gptsTimes = simulationData.gps.map(d => d.time);
    gpsMeasurements = simulationData.gps.map(d => d.position);
    kalmanPositions = simulationData.kalman.map(d => d.position);
    kalmanTimes = simulationData.kalman.map(d => d.time);
    ellipsePoints = simulationData.kalman.map(d => d.ellipse);


    speedChart.options.scales.x.max = totalSimulationTime;
    accChart.options.scales.x.max = totalSimulationTime;
    errChart.options.scales.x.max = totalSimulationTime;
    slider.value=0;
    startPlayback()
};

runButton.onclick = main;

async function renderCar(time) {

    if (previousPath)
        L.polyline(carPositions, {color: "green", weight: 2}).addTo(previousPathLayer);
    // Convert step to list index
    positionIndex = getClosestCeil(simulationTimes, time)
    gpsIndex = getClosestCeil(gptsTimes, time)
    if (!gpsIndex)
        gpsIndex = gpsMeasurements.length-1
    kalmanIndex = getClosestCeil(kalmanTimes, time)
    
    // Clear previous marker (we only want one at a time)
    carLayer.clearLayers();

    const pos = carPositions[positionIndex];
    const dr = deadReckoning[positionIndex];
    const gps = gpsMeasurements[gpsIndex];
    const kalman = kalmanPositions[kalmanIndex];

    L.circleMarker([pos[0], pos[1]], {
        radius: 6,
        color: "lime",
        fillOpacity: 1,
    }).addTo(carLayer);

    L.circleMarker([dr[0], dr[1]], {
        radius: 6,
        color: "orange",
        fillOpacity: 1,
    }).addTo(carLayer);


    L.circleMarker([gps[0], gps[1]], {
        radius: 6,
        color: "purple",
        fillOpacity: 1,
    }).addTo(carLayer);


    L.circleMarker([kalman[0], kalman[1]], {
        radius: 6,
        color: "red",
        fillOpacity: 1,
    }).addTo(carLayer);

    L.polygon(ellipsePoints[kalmanIndex], {
        color: 'red',
        weight: 1,
        fillOpacity: 0.2
    }).addTo(carLayer);


    speedChart.data.datasets[0].data = toXY(simulationData.ground_truth.slice(0, positionIndex), "time", "speed");
    speedChart.data.datasets[1].data = toXY(simulationData.kalman.slice(0, kalmanIndex), "time", "speed");
    speedChart.update();

    accChart.data.datasets[0].data = toXY(simulationData.ground_truth.slice(0, positionIndex), "time", "acceleration");
    accChart.data.datasets[1].data = toXY(simulationData.acceleration.slice(0, positionIndex), "time", "acceleration");
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
    var sleepTime = 1000*totalSimulationTime / animationSpeedUpFactor / Number(slider.max);  // ms by step
    console.warn(sleepTime);
    console.warn(Number(slider.max));
    while (playing && Number(slider.value) < Number(slider.max)) {
        const startTime = performance.now();
        slider.dispatchEvent(new Event("input"));
        const elapsed = performance.now() - startTime;
        if (elapsed<sleepTime)
            await new Promise(r => setTimeout(r, sleepTime-elapsed));

        slider.value = Number(slider.value) + 1;
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
