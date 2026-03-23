function normalizeAbsoluteUrl(url) {
    if (/^https?:\/\//i.test(url)) {
        return url;
    }
    return new URL(url, window.location.origin).toString();
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
