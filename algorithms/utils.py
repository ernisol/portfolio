"""Utils to convert records to geojson."""


def point_feature(lon, lat, properties=None):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": properties or {},
    }


def line_feature(coords, properties=None):
    # coords is list of (lon, lat)
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords},
        "properties": properties or {},
    }


def polygon_feature(coords, properties=None):
    # coords is list of rings (each ring is list of (lon, lat))
    return {
        "type": "Feature",
        "geometry": {"type": "Polygon", "coordinates": coords},
        "properties": properties or {},
    }


def feature_collection(features):
    return {"type": "FeatureCollection", "features": features}
