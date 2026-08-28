/** MapLibre + OpenFreeMap 3D view. Falls back silently if WebGL or tiles fail. */

const DESK_MAX_PITCH = 70;

const STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js";
const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css";
const ESRI_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const TH_OVERVIEW = {
  center: [-0.03, 51.515],
  zoom: 12.05,
  pitch: 45,
  bearing: -18,
};

const SCAFFOLD = "#C4A574";
const LIME = "#C8F542";
const GOLD = "#F5C518";
const SODIUM = "#FF8A3D";
const CORAL = "#FF4D6D";

function reducedMotion() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function ensureCss() {
  if (document.querySelector("link[data-maplibre]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS;
  link.setAttribute("data-maplibre", "1");
  document.head.appendChild(link);
}

function loadScript(src, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.maplibregl) return resolve(window.maplibregl);
    const existing = document.querySelector("script[data-maplibre]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.maplibregl), { once: true });
      existing.addEventListener("error", () => reject(new Error("maplibre script")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.setAttribute("data-maplibre", "1");
    const t = setTimeout(() => reject(new Error("maplibre timeout")), timeoutMs);
    s.onload = () => {
      clearTimeout(t);
      if (window.maplibregl) resolve(window.maplibregl);
      else reject(new Error("maplibre missing"));
    };
    s.onerror = () => {
      clearTimeout(t);
      reject(new Error("maplibre script"));
    };
    document.head.appendChild(s);
  });
}

function footprintOf(app) {
  const poly = app?.wgs84_polygon;
  if (poly?.type === "Polygon" && poly.coordinates?.[0]?.length >= 4) return poly.coordinates;
  if (poly?.type === "MultiPolygon" && poly.coordinates?.[0]?.[0]?.length >= 4) return poly.coordinates[0];
  const lon = app?.centroid?.lon;
  const lat = app?.centroid?.lat;
  if (lon == null || lat == null) return null;
  const units = app.game?.units || 12;
  const side = Math.max(18, Math.min(80, Math.sqrt(units * 28)));
  const dLat = side / 2 / 111320;
  const dLon = side / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return [
    [
      [lon - dLon, lat - dLat],
      [lon + dLon, lat - dLat],
      [lon + dLon, lat + dLat],
      [lon - dLon, lat + dLat],
      [lon - dLon, lat - dLat],
    ],
  ];
}

function massingStats(app, decision, deal) {
  const units = Math.max(1, app.game?.units || 1);
  const storeysRaw = Math.max(2, Math.ceil(units / 4));
  const storeysVis = Math.min(storeysRaw, 72);
  let height = storeysVis * 3.2;
  if (decision === "negotiate") height *= 0.62;
  if (deal?.kind === "smaller") height *= 0.7;
  return { units, storeysRaw, storeysVis, height };
}

function firstLabelLayerId(map) {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    if (layer.type === "symbol" && layer.layout?.["text-field"]) return layer.id;
  }
  return undefined;
}

function firstPlaceLabelId(map) {
  const layers = map.getStyle()?.layers || [];
  const roadish = /highway|road_|railway|oneway|path|pier|aeroway/i;
  for (const layer of layers) {
    if (layer.type === "symbol" && layer.layout?.["text-field"] && !roadish.test(layer.id)) {
      return layer.id;
    }
  }
  return firstLabelLayerId(map);
}

const GROUND_LINE = /highway|road_|railway|aeroway|path|pier|waterway|boundary/;
const KEEP_ABOVE = /^(3d-buildings|massing-extrude|refuse-ring|crowd|dust|ta-pressure|apps-dots|hospitals-dots)$/;

/** Roads/rails/paths must sit under fill-extrusions or they paint on facades. */
function tuckGroundUnderBuildings(map) {
  if (!map.getLayer("3d-buildings")) return;
  const layers = map.getStyle()?.layers || [];
  const bIdx = layers.findIndex((l) => l.id === "3d-buildings");
  if (bIdx < 0) return;
  for (const layer of layers.slice(bIdx + 1)) {
    if (KEEP_ABOVE.test(layer.id)) continue;
    const road = GROUND_LINE.test(layer.id) || layer.id === "building" || layer.id === "building-top";
    if (!road) continue;
    if (layer.type === "symbol" && !/highway|road_|oneway/i.test(layer.id)) continue;
    try {
      map.moveLayer(layer.id, "3d-buildings");
    } catch (_) {}
  }
}

function appsFeatureCollection(list) {
  return {
    type: "FeatureCollection",
    features: (list || [])
      .filter((a) => a.centroid?.lon != null && a.game?.playable !== false)
      .map((a) => ({
        type: "Feature",
        properties: { id: a.id || a.lpa_app_no, playable: !!a.game?.playable },
        geometry: { type: "Point", coordinates: [a.centroid.lon, a.centroid.lat] },
      })),
  };
}

function emptyFc() {
  return { type: "FeatureCollection", features: [] };
}

function londonBuildingColor() {
  // Solid shades, SimCity-massing energy: London stock, stucco, mansion grey, glass towers.
  const h = ["coalesce", ["get", "render_height"], ["get", "height"], 10];
  return [
    "case",
    [">=", h, 45],
    [
      "match",
      ["%", ["round", ["*", h, 0.37]], 3],
      0,
      "#6D7C88",
      1,
      "#5E656C",
      "#8A9AA4",
    ],
    [
      "match",
      ["%", ["round", ["*", h, 1.7]], 8],
      0,
      "#C17F59",
      1,
      "#8F5A3E",
      2,
      "#D4C4B0",
      3,
      "#C9A46A",
      4,
      "#9A958C",
      5,
      "#E4DED4",
      6,
      "#A65D42",
      "#C9A992",
    ],
  ];
}

function flattenBuildingPaint(map) {
  // Kill remaining fake shadows: 2D roof offset, hillshade, extrusion gradient.
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    const id = layer.id || "";
    if (layer.type === "hillshade" || /hillshade|ne2_shaded|building-top|building-shadow/i.test(id)) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch (_) {}
    }
    if (layer.type === "fill-extrusion") {
      try { map.setPaintProperty(id, "fill-extrusion-vertical-gradient", false); } catch (_) {}
      try { map.setPaintProperty(id, "fill-extrusion-ambient-occlusion-intensity", 0); } catch (_) {}
    }
    if (layer.type === "raster" && /hillshade|shaded|relief/i.test(id)) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch (_) {}
    }
  }
  for (const id of ["building", "building-top"]) {
    if (map.getLayer(id)) {
      try { map.setLayoutProperty(id, "visibility", "none"); } catch (_) {}
    }
  }
}

function add3dBuildings(map, satellite) {
  // Opacity must be 1: translucent extrusions skip the depth buffer, so roads
  // behind a block still paint across its face.
  const opacity = 1;
  flattenBuildingPaint(map);
  if (map.getLayer("3d-buildings")) {
    try {
      map.setPaintProperty("3d-buildings", "fill-extrusion-opacity", opacity);
      map.setPaintProperty("3d-buildings", "fill-extrusion-color", londonBuildingColor());
      map.setPaintProperty("3d-buildings", "fill-extrusion-vertical-gradient", false);
      try { map.setLayoutProperty("3d-buildings", "visibility", "visible"); } catch (_) {}
    } catch (_) {}
    tuckGroundUnderBuildings(map);
    return;
  }
  if (map.getLayer("building")) {
    try {
      map.setLayoutProperty("building", "visibility", "none");
    } catch (_) {}
  }
  if (map.getLayer("building-top")) {
    try {
      map.setLayoutProperty("building-top", "visibility", "none");
    } catch (_) {}
  }
  const before = firstPlaceLabelId(map);
  const layer = {
    id: "3d-buildings",
    source: "openmaptiles",
    "source-layer": "building",
    type: "fill-extrusion",
    minzoom: 14,
    filter: ["!=", ["get", "hide_3d"], true],
    paint: {
      "fill-extrusion-color": londonBuildingColor(),
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        14,
        0,
        16,
        ["coalesce", ["get", "render_height"], ["get", "height"], 10],
      ],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
      "fill-extrusion-opacity": opacity,
      "fill-extrusion-vertical-gradient": false,
    },
  };
  if (before) map.addLayer(layer, before);
  else map.addLayer(layer);
  tuckGroundUnderBuildings(map);
}

function thickenRoads(map) {
  for (const id of ["highway_major_casing", "highway_motorway_casing", "highway_minor"]) {
    if (!map.getLayer(id)) continue;
    try {
      const cur = map.getPaintProperty(id, "line-width");
      if (typeof cur === "number") map.setPaintProperty(id, "line-width", cur * 1.55);
      else map.setPaintProperty(id, "line-width", ["*", 1.45, ["coalesce", cur, 1.2]]);
    } catch (_) {}
  }
}

function punchLandForSatellite(map) {
  const fade = {
    background: ["background-opacity", 0.18],
    landuse_residential: ["fill-opacity", 0.08],
    landcover_wood: ["fill-opacity", 0.1],
    landuse_park: ["fill-opacity", 0.1],
    water: ["fill-opacity", 0.28],
  };
  for (const [id, [prop, val]] of Object.entries(fade)) {
    if (!map.getLayer(id)) continue;
    try {
      map.setPaintProperty(id, prop, val);
    } catch (_) {}
  }
}

export function createGlobe(container, data, opts = {}) {
  const wrap = opts.wrap || container?.parentElement;
  const noteEl = opts.noteEl || wrap?.querySelector("#massing-note");
  const onStatus = opts.onStatus || (() => {});

  let map = null;
  let marker = null;
  let homeMarker = null;
  let ready = false;
  let failed = false;
  let mode = "2d";
  let fadeTimer = 0;
  let tilesOk = false;
  let imageryOk = false;
  let lastApp = null;
  const rafs = new Set();
  const layers = { conservation: true, listed: true, article4: true, brownfield: true, apps: true };
  let keyHandler = null;

  function trackRaf(id) {
    rafs.add(id);
    return id;
  }
  function cancelAnims() {
    for (const id of rafs) cancelAnimationFrame(id);
    rafs.clear();
    clearTimeout(fadeTimer);
  }

  function setNote(text) {
    if (!noteEl) return;
    if (!text) {
      noteEl.hidden = true;
      noteEl.textContent = "";
      return;
    }
    noteEl.hidden = false;
    noteEl.textContent = text;
  }

  function clearParticles() {
    if (!map || !ready) return;
    try {
      if (map.getSource("crowd")) map.getSource("crowd").setData(emptyFc());
      if (map.getSource("dust")) map.getSource("dust").setData(emptyFc());
    } catch (_) {}
  }

  function clearMassing() {
    if (!map || !ready) return;
    cancelAnims();
    try {
      if (map.getSource("massing")) map.getSource("massing").setData(emptyFc());
      if (map.getSource("refuse-ring")) map.getSource("refuse-ring").setData(emptyFc());
      clearParticles();
    } catch (_) {}
    setNote("");
  }

  function siteLonLat(app) {
    return [app?.centroid?.lon, app?.centroid?.lat];
  }

  function ensureSources() {
    if (!map.getSource("massing")) {
      map.addSource("massing", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "massing-extrude",
        type: "fill-extrusion",
        source: "massing",
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-opacity": 0.86,
          "fill-extrusion-vertical-gradient": false,
        },
      });
    }
    if (!map.getSource("refuse-ring")) {
      map.addSource("refuse-ring", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "refuse-ring",
        type: "line",
        source: "refuse-ring",
        paint: {
          "line-color": CORAL,
          "line-width": 4,
          "line-opacity": 0.95,
          "line-blur": 0.4,
        },
      });
    }
    if (!map.getSource("crowd")) {
      map.addSource("crowd", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "crowd",
        type: "circle",
        source: "crowd",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.4, 17, 4.4],
          "circle-color": ["get", "color"],
          "circle-opacity": ["get", "opacity"],
          "circle-stroke-width": 0,
        },
      });
    }
    if (!map.getSource("dust")) {
      map.addSource("dust", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "dust",
        type: "circle",
        source: "dust",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "r"], 0, 1.2, 1, 3.2],
          "circle-color": "#E8D5A8",
          "circle-opacity": ["get", "opacity"],
          "circle-blur": 0.4,
        },
      });
    }
    if (!map.getSource("ta-pressure")) {
      map.addSource("ta-pressure", { type: "geojson", data: emptyFc() });
      map.addLayer({
        id: "ta-pressure",
        type: "circle",
        source: "ta-pressure",
        paint: {
          "circle-radius": 3.6,
          "circle-color": ["get", "color"],
          "circle-opacity": ["get", "opacity"],
          "circle-stroke-width": 0,
        },
      });
    }
    if (!map.getSource("apps-dots")) {
      map.addSource("apps-dots", { type: "geojson", data: appsFeatureCollection(data.applications) });
      map.addLayer({
        id: "apps-dots",
        type: "circle",
        source: "apps-dots",
        paint: {
          "circle-radius": ["case", ["get", "playable"], 3.2, 1.8],
          "circle-color": ["case", ["get", "playable"], "#8a8a98", "#3a3a46"],
          "circle-opacity": ["case", ["get", "playable"], 0.7, 0.35],
        },
        layout: { visibility: layers.apps ? "visible" : "none" },
      });
    }
    ensureAmenityLayers();
  }

  function killCrimeDots() {
    for (const id of ["crime-dots", "crime", "crime-heat", "crime-halo"]) {
      try { if (map.getLayer(id)) map.removeLayer(id); } catch (_) {}
      try { if (map.getSource(id)) map.removeSource(id); } catch (_) {}
    }
    const layers = map.getStyle()?.layers || [];
    for (const layer of layers) {
      if (!/crime/i.test(layer.id)) continue;
      try { map.removeLayer(layer.id); } catch (_) {}
    }
    for (const [sid] of Object.entries(map.getStyle()?.sources || {})) {
      if (!/crime/i.test(sid)) continue;
      try { map.removeSource(sid); } catch (_) {}
    }
  }

  function ensureAmenityLayers() {
    killCrimeDots();
    // Crime stays off the map (point clouds lag). Counts live on the case chip.
    // School 400m rings stay off the map (they covered the borough in yellow).
    // Proximity still scores on the case chip via liveability.js.
    const hospitals = Array.isArray(data.hospitals) ? data.hospitals : data.hospitals?.sites || [];
    if (hospitals.length && !map.getSource("hospitals")) {
      map.addSource("hospitals", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: hospitals.map((h) => ({
            type: "Feature",
            properties: { name: h.name },
            geometry: { type: "Point", coordinates: [h.lng, h.lat] },
          })),
        },
      });
      map.addLayer({
        id: "hospitals-dots",
        type: "circle",
        source: "hospitals",
        paint: {
          "circle-radius": 6,
          "circle-color": "#E21887",
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
    }
  }

  async function addImagery() {
    // SimCity daytime: OpenFreeMap bright, no Esri satellite punch.
    imageryOk = false;
    add3dBuildings(map, imageryOk);
    flattenBuildingPaint(map);
    try {
      const { attachLandmarks } = await import('./landmarks.js?v=desk4');
      await attachLandmarks(map, window.maplibregl);
    } catch (_) {}
    thickenRoads(map);
    tuckGroundUnderBuildings(map);
    flattenBuildingPaint(map);
  }

  function flyToLngLat(lng, lat, opts = {}) {
    if (!map || !ready || lng == null || lat == null) return;
    const dur = reducedMotion() ? 0 : opts.duration ?? 1400;
    map.flyTo({
      center: [lng, lat],
      zoom: opts.zoom ?? 16.5,
      pitch: opts.pitch ?? 55,
      bearing: opts.bearing ?? -18,
      duration: dur,
      essential: true,
    });
  }

  function setHomePin(lng, lat) {
    if (!map || !ready || !window.maplibregl || lng == null) return;
    if (homeMarker) homeMarker.remove();
    const el = document.createElement("div");
    el.className = "home-marker";
    el.title = "Your street";
    homeMarker = new window.maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map);
  }

  function pulseMarker(app) {
    if (!map || !ready || !window.maplibregl) return;
    const lon = app?.centroid?.lon;
    const lat = app?.centroid?.lat;
    if (lon == null || lat == null) return;
    if (marker) marker.remove();
    const el = document.createElement("div");
    el.className = "site-marker";
    el.setAttribute("aria-hidden", "true");
    marker = new window.maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([lon, lat]).addTo(map);
  }

  function flyToApp(app) {
    if (!map || !ready || mode !== "3d" || !app?.centroid) return;
    lastApp = app;
    const dur = reducedMotion() ? 0 : 1600;
    map.flyTo({
      center: [app.centroid.lon, app.centroid.lat],
      zoom: 16.8,
      pitch: 60,
      bearing: -18,
      duration: dur,
      essential: true,
    });
    pulseMarker(app);
  }

  function overview() {
    if (!map || !ready) return;
    const dur = reducedMotion() ? 0 : 900;
    map.easeTo({ ...TH_OVERVIEW, duration: dur, essential: true });
  }

  function resetView() {
    if (lastApp) flyToApp(lastApp);
    else overview();
  }

  function setMassingData(coords, height, color, extra = []) {
    const features = [
      {
        type: "Feature",
        properties: { height, base: 0, color },
        geometry: { type: "Polygon", coordinates: coords },
      },
      ...extra,
    ];
    map.getSource("massing").setData({ type: "FeatureCollection", features });
  }

  function tweenMassing(coords, targetH, settleColor, decision) {
    if (reducedMotion()) {
      if (decision === "negotiate") {
        map.getSource("massing").setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { height: targetH * 0.55, base: 0, color: GOLD },
              geometry: { type: "Polygon", coordinates: coords },
            },
            {
              type: "Feature",
              properties: { height: targetH, base: targetH * 0.55, color: LIME },
              geometry: { type: "Polygon", coordinates: coords },
            },
          ],
        });
      } else {
        setMassingData(coords, targetH, settleColor);
      }
      return;
    }
    const start = performance.now();
    const dur = 1800;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - t) ** 3;
      const h = targetH * eased;
      const color = t < 0.72 ? SCAFFOLD : settleColor;
      if (decision === "negotiate") {
        map.getSource("massing")?.setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { height: h * 0.55, base: 0, color: t < 0.72 ? SCAFFOLD : GOLD },
              geometry: { type: "Polygon", coordinates: coords },
            },
            {
              type: "Feature",
              properties: { height: h, base: h * 0.55, color: t < 0.72 ? SCAFFOLD : LIME },
              geometry: { type: "Polygon", coordinates: coords },
            },
          ],
        });
      } else {
        setMassingData(coords, h, color);
      }
      if (t < 1) trackRaf(requestAnimationFrame(step));
      else cinematicOrbit();
    };
    trackRaf(requestAnimationFrame(step));
  }

  function cinematicOrbit() {
    if (!map || reducedMotion()) return;
    try {
      map.easeTo({ bearing: map.getBearing() + 20, duration: 800, essential: false });
    } catch (_) {}
  }

  function burstDust(lon, lat) {
    if (reducedMotion() || !map.getSource("dust")) return;
    const n = 22;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      parts.push({ a, d: 0.00018 + Math.random() * 0.00055, r: Math.random() });
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1200);
      const features = parts.map((p) => ({
        type: "Feature",
        properties: { opacity: 0.7 * (1 - t), r: p.r },
        geometry: {
          type: "Point",
          coordinates: [lon + Math.cos(p.a) * p.d * (0.25 + t), lat + Math.sin(p.a) * p.d * (0.25 + t)],
        },
      }));
      map.getSource("dust")?.setData({ type: "FeatureCollection", features });
      if (t < 1) trackRaf(requestAnimationFrame(step));
      else map.getSource("dust")?.setData(emptyFc());
    };
    trackRaf(requestAnimationFrame(step));
  }

  function animateCrowd(lon, lat, dir, count) {
    if (reducedMotion() || !map.getSource("crowd")) return;
    const n = Math.max(8, Math.min(20, count || 12));
    const people = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = 0.0007 + Math.random() * 0.0011;
      const far = [lon + Math.cos(a) * d, lat + Math.sin(a) * d * 0.7];
      const site = [lon + (Math.random() - 0.5) * 0.00012, lat + (Math.random() - 0.5) * 0.00008];
      people.push({
        from: dir === "in" ? far : site,
        to: dir === "in" ? site : far,
      });
    }
    const color = dir === "in" ? SODIUM : CORAL;
    const start = performance.now();
    const dur = 1600;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = t < 0.7 ? t / 0.7 : 1;
      const fade = t < 0.75 ? 0.95 : 0.95 * (1 - (t - 0.75) / 0.25);
      const features = people.map((p) => ({
        type: "Feature",
        properties: { color, opacity: fade },
        geometry: {
          type: "Point",
          coordinates: [p.from[0] + (p.to[0] - p.from[0]) * eased, p.from[1] + (p.to[1] - p.from[1]) * eased],
        },
      }));
      map.getSource("crowd")?.setData({ type: "FeatureCollection", features });
      if (t < 1) trackRaf(requestAnimationFrame(step));
      else map.getSource("crowd")?.setData(emptyFc());
    };
    trackRaf(requestAnimationFrame(step));
  }

  function updateTaFigures(lon, lat, delta) {
    if (!map.getSource("ta-pressure")) return;
    if (reducedMotion()) {
      if (delta > 0) {
        map.getSource("ta-pressure").setData({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { color: "#c07a84", opacity: 0.7 },
              geometry: { type: "Point", coordinates: [lon + 0.00045, lat] },
            },
          ],
        });
      } else if (delta < 0) {
        map.getSource("ta-pressure").setData(emptyFc());
      }
      return;
    }
    if (delta > 0) {
      const n = Math.max(3, Math.min(7, Math.round(delta / 2)));
      const features = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        features.push({
          type: "Feature",
          properties: { color: "#b08088", opacity: 0.62 },
          geometry: {
            type: "Point",
            coordinates: [lon + Math.cos(a) * 0.00048, lat + Math.sin(a) * 0.00034],
          },
        });
      }
      map.getSource("ta-pressure").setData({ type: "FeatureCollection", features });
    } else if (delta < 0) {
      const src = map.getSource("ta-pressure");
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / 900);
        try {
          map.setPaintProperty("ta-pressure", "circle-opacity", 0.62 * (1 - t));
        } catch (_) {
          return;
        }
        if (t < 1) trackRaf(requestAnimationFrame(step));
        else {
          src?.setData(emptyFc());
          try {
            map.setPaintProperty("ta-pressure", "circle-opacity", ["get", "opacity"]);
          } catch (_) {}
        }
      };
      trackRaf(requestAnimationFrame(step));
    }
  }

  function showDecision(app, decision, proposal, fx = {}) {
    if (!map || !ready || mode !== "3d" || !app) return;
    ensureSources();
    cancelAnims();
    lastApp = app;
    const coords = footprintOf(app);
    const [lon, lat] = siteLonLat(app);
    const deal = fx.deal || null;
    const collapse = decision === "negotiate" && deal?.kind === "collapse";
    const crowdDir = fx.crowd || (decision === "refuse" || collapse ? "out" : "in");
    const crowdCount = fx.crowdCount || 12;
    const taDelta = fx.taDelta || 0;

    if (lon != null && lat != null) {
      animateCrowd(lon, lat, crowdDir, crowdCount);
      updateTaFigures(lon, lat, taDelta);
    }

    if (!coords) return;
    const stats = massingStats(app, decision, deal);
    const aff = proposal?.affordablePct ?? app.game?.affordablePct ?? 0;
    const luxury = !!(proposal?.luxury ?? app.game?.luxury);

    if (decision === "refuse" || collapse) {
      if (map.getSource("massing")) map.getSource("massing").setData(emptyFc());
      const ring = coords[0];
      map.getSource("refuse-ring").setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: ring } }],
      });
      try {
        map.setPaintProperty("refuse-ring", "line-opacity", 0.95);
      } catch (_) {}
      setNote("indicative massing, not a real elevation");
      if (!reducedMotion()) {
        const start = performance.now();
        const fade = (now) => {
          if (!map.getLayer("refuse-ring")) return;
          const k = 1 - (now - start) / 1600;
          if (k <= 0) {
            map.getSource("refuse-ring")?.setData(emptyFc());
            setNote("");
            return;
          }
          try {
            map.setPaintProperty("refuse-ring", "line-opacity", k);
          } catch (_) {
            return;
          }
          fadeTimer = requestAnimationFrame(fade);
        };
        fadeTimer = requestAnimationFrame(fade);
      }
      return;
    }

    if (map.getSource("refuse-ring")) map.getSource("refuse-ring").setData(emptyFc());
    const settle = aff >= 0.35 ? LIME : luxury || aff < 0.35 ? GOLD : SODIUM;
    tweenMassing(coords, stats.height, settle, decision);
    if (lon != null && lat != null) burstDust(lon, lat);
    setNote(
      `indicative massing, not a real elevation · ~${stats.storeysRaw} storeys from unit count (ceil(units/4) × 3.2 m)`
    );
  }

  function setLayer(name, on) {
    layers[name] = on;
    if (!map || !ready) return;
    if (name === "apps" && map.getLayer("apps-dots")) {
      map.setLayoutProperty("apps-dots", "visibility", on ? "visible" : "none");
    }
  }

  function setMode(next) {
    mode = next;
    if (wrap) {
      wrap.classList.toggle("is-3d", mode === "3d");
      wrap.classList.toggle("is-2d", mode === "2d");
    }
    if (mode === "3d" && map) {
      requestAnimationFrame(() => {
        try {
          map.resize();
        } catch (_) {}
      });
    }
    if (mode === "2d") clearMassing();
  }

  function resize() {
    if (map && mode === "3d") {
      try {
        map.resize();
      } catch (_) {}
    }
  }

  function fallback(reason) {
    failed = true;
    ready = false;
    mode = "2d";
    if (wrap) {
      wrap.classList.add("is-2d");
      wrap.classList.remove("is-3d");
    }
    onStatus({ ok: false, reason: reason || "fallback", imagery: false });
  }

  function bindKeys() {
    if (keyHandler) return;
    keyHandler = (ev) => {
      if (!map || !ready || mode !== "3d") return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const tag = ev.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ev.target?.isContentEditable) return;
      const k = ev.key;
      if (k === "a" || k === "A" || k === "n" || k === "N" || k === "r" || k === "R") return;
      const pan = 90;
      if (k === "ArrowLeft") {
        ev.preventDefault();
        map.panBy([-pan, 0], { duration: 160 });
      } else if (k === "ArrowRight" || k === "d" || k === "D") {
        ev.preventDefault();
        map.panBy([pan, 0], { duration: 160 });
      } else if (k === "ArrowUp" || k === "w" || k === "W") {
        ev.preventDefault();
        map.panBy([0, -pan], { duration: 160 });
      } else if (k === "ArrowDown" || k === "s" || k === "S") {
        ev.preventDefault();
        map.panBy([0, pan], { duration: 160 });
      } else if (k === "q" || k === "Q") {
        map.easeTo({ bearing: map.getBearing() - 14, duration: 180 });
      } else if (k === "e" || k === "E") {
        map.easeTo({ bearing: map.getBearing() + 14, duration: 180 });
      } else if (k === "Home" || k === "0") {
        ev.preventDefault();
        resetView();
      }
    };
    window.addEventListener("keydown", keyHandler);
  }

  async function start() {
    if (failed) return false;
    if (!container) {
      fallback("no container");
      return false;
    }
    if (!webglOk()) {
      fallback("no webgl");
      return false;
    }
    ensureCss();
    let maplibregl;
    try {
      maplibregl = await loadScript(MAPLIBRE_JS);
    } catch (err) {
      fallback(String(err?.message || err));
      return false;
    }
    if (!maplibregl) {
      fallback("maplibre missing");
      return false;
    }
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URL,
        center: TH_OVERVIEW.center,
        zoom: TH_OVERVIEW.zoom,
        pitch: TH_OVERVIEW.pitch,
        bearing: TH_OVERVIEW.bearing,
        maxPitch: DESK_MAX_PITCH,
        minZoom: 11,
        maxZoom: 18.5,
        antialias: true,
        attributionControl: true,
        dragRotate: true,
        touchPitch: true,
        touchZoomRotate: true,
        cooperativeGestures: false,
        pitchWithRotate: true,
        canvasContextAttributes: { antialias: true },
        fadeDuration: reducedMotion() ? 0 : 300,
      });
    } catch (err) {
      fallback(String(err?.message || err));
      return false;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), "top-left");
    map.on("webglcontextlost", () => fallback("webglcontextlost"));
    map.on("error", (e) => {
      const sid = e?.sourceId || e?.source?.id || "";
      if (String(sid).includes("esri")) imageryOk = false;
    });

    const loaded = await new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      const bootTimeout = setTimeout(() => {
        if (!ready) {
          fallback("style timeout");
          done(false);
        }
      }, 12000);
      map.once("load", async () => {
        clearTimeout(bootTimeout);
        try {
          await addImagery();
          killCrimeDots();
          ensureSources();
          killCrimeDots();
          flattenBuildingPaint(map);
          tuckGroundUnderBuildings(map);
          map.on("styledata", () => {
            if (!map.isStyleLoaded()) return;
            flattenBuildingPaint(map);
          });
          bindKeys();
          ready = true;
          tilesOk = true;
          mode = "3d";
          if (wrap) {
            wrap.classList.add("is-3d");
            wrap.classList.remove("is-2d");
          }
          onStatus({ ok: true, tiles: true, style: STYLE_URL, imagery: imageryOk });
          done(true);
        } catch (err) {
          fallback(String(err?.message || err));
          done(false);
        }
      });
    });
    return loaded && ready && !failed;
  }

  function isReady() {
    return ready && !failed;
  }

  function setApplications(list) {
    data.applications = list || [];
    if (!map || !ready) return;
    const src = map.getSource("apps-dots");
    if (src) src.setData(appsFeatureCollection(data.applications));
  }

  return {
    start,
    flyToApp,
    flyToLngLat,
    setHomePin,
    overview,
    resetView,
    showDecision,
    setMode,
    setLayer,
    resize,
    clearMassing,
    setApplications,
    isReady,
    getCamera: () => {
      if (!map || !ready) return null;
      const c = map.getCenter();
      return { lng: c.lng, lat: c.lat, pitch: map.getPitch(), zoom: map.getZoom(), bearing: map.getBearing() };
    },
    getLayerVis: (id) => {
      if (!map || !ready || !map.getLayer(id)) return null;
      try { return map.getLayoutProperty(id, "visibility") || "visible"; } catch (_) { return "unknown"; }
    },
    getMode: () => mode,
    tilesLoaded: () => tilesOk,
    imageryLoaded: () => imageryOk,
    failed: () => failed,
  };
}
