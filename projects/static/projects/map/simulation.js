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
