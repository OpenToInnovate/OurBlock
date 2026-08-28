/** Equirectangular projection fitted to a GeoJSON bbox. */

export function bboxOf(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (coords) => {
    if (!coords) return;
    if (typeof coords[0] === "number") {
      minX = Math.min(minX, coords[0]);
      maxX = Math.max(maxX, coords[0]);
      minY = Math.min(minY, coords[1]);
      maxY = Math.max(maxY, coords[1]);
      return;
    }
    for (const c of coords) walk(c);
  };
  for (const f of features) walk(f.geometry?.coordinates);
  return [minX, minY, maxX, maxY];
}

export function makeProjector(bbox, width, height, pad = 28) {
  const [minX, minY, maxX, maxY] = bbox;
  const lon0 = (minX + maxX) / 2;
  const lat0 = (minY + maxY) / 2;
  const latScale = Math.cos((lat0 * Math.PI) / 180);
  const dx = (maxX - minX) * latScale;
  const dy = maxY - minY;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / dx, innerH / dy);
  const cx = width / 2;
  const cy = height / 2;
  const project = (lon, lat) => {
    const x = cx + (lon - lon0) * latScale * scale;
    const y = cy - (lat - lat0) * scale;
    return [x, y];
  };
  project.invert = (x, y) => {
    const lon = lon0 + (x - cx) / (latScale * scale);
    const lat = lat0 - (y - cy) / scale;
    return [lon, lat];
  };
  project.scale = scale;
  return project;
}

function ringPath(ring, project, minPx = 0.9) {
  if (!ring?.length) return "";
  let d = "";
  let lastX = Infinity;
  let lastY = Infinity;
  let started = false;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    if (started && Math.hypot(x - lastX, y - lastY) < minPx && i !== ring.length - 1) continue;
    d += (started ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
    lastX = x;
    lastY = y;
    started = true;
  }
  return d + "Z";
}

export function geomPath(geom, project) {
  if (!geom) return "";
  if (geom.type === "Polygon") {
    return (geom.coordinates || []).map((r) => ringPath(r, project)).join("");
  }
  if (geom.type === "MultiPolygon") {
    return (geom.coordinates || [])
      .map((poly) => (poly || []).map((r) => ringPath(r, project)).join(""))
      .join("");
  }
  if (geom.type === "Point") {
    const [x, y] = project(geom.coordinates[0], geom.coordinates[1]);
    return `M${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return "";
}

export function pointOf(feature) {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === "Point") return { lon: g.coordinates[0], lat: g.coordinates[1] };
  const ring =
    g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0]?.[0] : null;
  if (!ring?.length) return null;
  let sx = 0, sy = 0;
  for (const p of ring) {
    sx += p[0];
    sy += p[1];
  }
  return { lon: sx / ring.length, lat: sy / ring.length };
}

/** Great-circle metres. Fine for borough-scale school/hospital/crime checks. */
export function distMetres(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dphi = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function circleRing(lon, lat, radiusM, steps = 32) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}
