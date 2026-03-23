const playButton = document.getElementById("play");
const runButton = document.getElementById("run");
const playButtonIcon = playButton.querySelector(".playButtonIcon");
const playButtonLabel = playButton.querySelector(".playButtonLabel");

function sortedByIndex(features) {
    return [...features].sort((a, b) => a.properties.index - b.properties.index);
}

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
