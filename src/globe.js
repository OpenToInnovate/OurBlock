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
        properties: {
          id: a.id || a.lpa_app_no,
          playable: !!a.game?.playable,
          luxury: !!a.game?.luxury,
          aff: Number(a.game?.affordablePct) || 0,
        },
        geometry: { type: "Point", coordinates: [a.centroid.lon, a.centroid.lat] },
      })),
  };
}

const VOXEL_PALETTE = [
  "#C6A15B", "#8B8B8B", "#C45C32", "#E3C78A",
  "#E8E8E8", "#6B5335", "#4F7F7A", "#B4846C",
];

function voxelColorExpr() {
  const n = VOXEL_PALETTE.length;
  const hash = ["%", ["abs", ["+", ["to-number", ["coalesce", ["id"], 0]], ["*", ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"], 0]], 7]]], n];
  const expr = ["match", hash];
  for (let i = 0; i < n; i++) expr.push(i, VOXEL_PALETTE[i]);
  expr.push(VOXEL_PALETTE[0]);
  return expr;
}

function voxelHeightExpr() {
  const raw = ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"], 10]];
  return ["*", 4, ["max", 1, ["round", ["/", raw, 4]]]];
}

function voxelBaseExpr() {
  const raw = ["to-number", ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0]];
  return ["*", 4, ["max", 0, ["round", ["/", raw, 4]]]];
}

const LOD_Z = 15;
const STOCK_BUILDING_FILL = "#d4d1ca";
const GM_LAND = "#efece6";
const GM_PARK = "#c6d9b5";
const GM_WOOD = "#b4c9a0";
const GM_WATER = "#b8cfdc";
const GM_MAJOR = "#f2e39a";
const GM_MOTOR = "#efd36a";
const GM_MINOR = "#ffffff";
const GM_CASE = "#c5c3bd";
const GM_PATH = "#c4c2bb";

const OVERVIEW_PAINT = [
  ["background", "background-color", GM_LAND],
  ["park", "fill-color", GM_PARK],
  ["park", "fill-opacity", 0.92],
  ["landcover-grass", "fill-color", GM_PARK],
  ["landcover-grass", "fill-opacity", 1],
  ["landcover-grass-park", "fill-color", GM_PARK],
  ["landcover-grass-park", "fill-opacity", 0.95],
  ["landcover-wood", "fill-color", GM_WOOD],
  ["landcover-wood", "fill-opacity", 0.85],
  ["landuse-cemetery", "fill-color", "#c8d4b6"],
  ["landuse-residential", "fill-color", GM_LAND],
  ["landuse-commercial", "fill-color", GM_LAND],
  ["landuse-industrial", "fill-color", GM_LAND],
  ["landuse-hospital", "fill-color", GM_LAND],
  ["landuse-school", "fill-color", GM_LAND],
  ["landuse-railway", "fill-color", GM_LAND],
  ["water", "fill-color", GM_WATER],
  ["water-intermittent", "fill-color", GM_WATER],
  ["waterway-river", "line-color", GM_WATER],
  ["waterway-stream-canal", "line-color", GM_WATER],
  ["waterway-other", "line-color", GM_WATER],
  ["highway-area", "fill-color", "#e6e4de"],
  ["highway-path", "line-color", GM_PATH],
  ["bridge-path", "line-color", GM_PATH],
  ["highway-minor", "line-color", GM_MINOR],
  ["highway-secondary-tertiary", "line-color", GM_MAJOR],
  ["highway-primary", "line-color", GM_MAJOR],
  ["highway-trunk", "line-color", GM_MAJOR],
  ["highway-motorway", "line-color", GM_MOTOR],
  ["highway-link", "line-color", GM_MAJOR],
  ["highway-motorway-link", "line-color", GM_MOTOR],
  ["highway-minor-casing", "line-color", GM_CASE],
  ["highway-secondary-tertiary-casing", "line-color", GM_CASE],
  ["highway-primary-casing", "line-color", GM_CASE],
  ["highway-trunk-casing", "line-color", GM_CASE],
  ["highway-motorway-casing", "line-color", GM_CASE],
  ["highway-link-casing", "line-color", GM_CASE],
  ["highway-motorway-link-casing", "line-color", GM_CASE],
  ["bridge-minor", "line-color", GM_MINOR],
  ["bridge-secondary-tertiary", "line-color", GM_MAJOR],
  ["bridge-trunk-primary", "line-color", GM_MAJOR],
  ["bridge-motorway", "line-color", GM_MOTOR],
  ["bridge-link", "line-color", GM_MAJOR],
  ["bridge-motorway-link", "line-color", GM_MOTOR],
  ["bridge-minor-casing", "line-color", GM_CASE],
  ["bridge-secondary-tertiary-casing", "line-color", GM_CASE],
  ["bridge-trunk-primary-casing", "line-color", GM_CASE],
  ["bridge-motorway-casing", "line-color", GM_CASE],
  ["bridge-link-casing", "line-color", GM_CASE],
  ["bridge-motorway-link-casing", "line-color", GM_CASE],
  ["tunnel-minor", "line-color", GM_MINOR],
  ["tunnel-secondary-tertiary", "line-color", GM_MAJOR],
  ["tunnel-trunk-primary", "line-color", GM_MAJOR],
  ["tunnel-motorway", "line-color", GM_MOTOR],
  ["tunnel-link", "line-color", GM_MAJOR],
  ["tunnel-motorway-link", "line-color", GM_MOTOR],
  ["tunnel-service-track", "line-color", GM_MINOR],
];

function paintLegoGround(map) {
  if (map._pdGroundRestored) return;
  map._pdGroundRestored = true;
  for (const [id, prop, val] of OVERVIEW_PAINT) {
    if (!map.getLayer(id)) continue;
    try { map.setPaintProperty(id, prop, val); } catch (_) {}
  }
  for (const id of ["poi_r20", "poi_r7", "poi_r1"]) {
    if (!map.getLayer(id)) continue;
    try { map.setLayoutProperty(id, "visibility", "none"); } catch (_) {}
  }
}

function flattenBuildingPaint(map) {
  if (map._pdBuildingsLod) return;
  map._pdBuildingsLod = true;
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    const id = layer.id || "";
    if (id === "3d-buildings") {
      try { map.setPaintProperty(id, "fill-extrusion-vertical-gradient", false); } catch (_) {}
      try { map.setPaintProperty(id, "fill-extrusion-ambient-occlusion-intensity", 0); } catch (_) {}
      continue;
    }
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
  if (map.getLayer("building-top")) {
    try { map.setLayoutProperty("building-top", "visibility", "none"); } catch (_) {}
  }
  if (map.getLayer("building")) {
    try { map.setLayoutProperty("building", "visibility", "visible"); } catch (_) {}
    try { map.setPaintProperty("building", "fill-color", STOCK_BUILDING_FILL); } catch (_) {}
    try { map.setPaintProperty("building", "fill-outline-color", "#c6c3bb"); } catch (_) {}
    try { map.setPaintProperty("building", "fill-opacity", 1); } catch (_) {}
    try { map.setPaintProperty("building", "fill-antialias", true); } catch (_) {}
    try { map.setLayerZoomRange("building", 0, LOD_Z); } catch (_) {}
  }
}

function add3dBuildings(map, satellite) {
  const opacity = 1;
  flattenBuildingPaint(map);
  if (map.getLayer("3d-buildings")) {
    try {
      map.setLayoutProperty("3d-buildings", "visibility", "visible");
      map.setPaintProperty("3d-buildings", "fill-extrusion-opacity", opacity);
      map.setPaintProperty("3d-buildings", "fill-extrusion-color", voxelColorExpr());
      map.setPaintProperty("3d-buildings", "fill-extrusion-height", voxelHeightExpr());
      map.setPaintProperty("3d-buildings", "fill-extrusion-base", voxelBaseExpr());
      map.setPaintProperty("3d-buildings", "fill-extrusion-vertical-gradient", false);
      map.setLayerZoomRange("3d-buildings", LOD_Z, 24);
    } catch (_) {}
    tuckGroundUnderBuildings(map);
    return;
  }
  if (map.getLayer("building-top")) {
    try { map.setLayoutProperty("building-top", "visibility", "none"); } catch (_) {}
  }
  if (map.getLayer("building")) {
    try { map.setLayoutProperty("building", "visibility", "visible"); } catch (_) {}
    try { map.setPaintProperty("building", "fill-color", STOCK_BUILDING_FILL); } catch (_) {}
    try { map.setLayerZoomRange("building", 0, LOD_Z); } catch (_) {}
  }
  const before = firstPlaceLabelId(map);
  const layer = {
    id: "3d-buildings",
    source: "openmaptiles",
    "source-layer": "building",
    type: "fill-extrusion",
    minzoom: LOD_Z,
    layout: { visibility: "visible" },
    filter: ["!=", ["get", "hide_3d"], true],
    paint: {
      "fill-extrusion-color": voxelColorExpr(),
      "fill-extrusion-height": voxelHeightExpr(),
      "fill-extrusion-base": voxelBaseExpr(),
      "fill-extrusion-opacity": opacity,
      "fill-extrusion-vertical-gradient": false,
    },
  };
  if (before) map.addLayer(layer, before);
  else map.addLayer(layer);
  tuckGroundUnderBuildings(map);
}

export function createGlobe(container, data, opts = {}) {
  const wrap = opts.wrap || container?.parentElement;
  const onStatus = opts.onStatus || (() => {});
  let map = null;
  let marker = null;
  let ready = false;
  let failed = false;
  let mode = "2d";
  let tilesOk = false;
  let imageryOk = false;
  let lastApp = null;
  let styleReady = false;
  let lodPitched3d = null;
  let lodTimer = 0;
  const layers = { apps: true };

  function computePitched3d() {
    if (mode !== "3d") return false;
    if (wrap && wrap.classList.contains("is-2d")) return false;
    if (!map) return false;
    return map.getPitch() > 0.5;
  }

  function applyLod() {
    if (!map || !styleReady) return;
    const pitched3d = computePitched3d();
    if (pitched3d === lodPitched3d) return;
    lodPitched3d = pitched3d;
    if (map.getLayer("3d-buildings")) {
      try { map.setLayoutProperty("3d-buildings", "visibility", pitched3d ? "visible" : "none"); } catch (_) {}
    }
    if (map.getLayer("building")) {
      try { map.setLayoutProperty("building", "visibility", "visible"); } catch (_) {}
      try { map.setLayerZoomRange("building", 0, pitched3d ? LOD_Z : 24); } catch (_) {}
    }
  }

  function scheduleLod() {
    clearTimeout(lodTimer);
    lodTimer = setTimeout(applyLod, 140);
  }

  function ensureSources() {
    if (!map.getSource("apps-dots")) {
      map.addSource("apps-dots", { type: "geojson", data: appsFeatureCollection(data.applications) });
      map.addLayer({
        id: "apps-dots",
        type: "circle",
        source: "apps-dots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5.2, 12, 7.4, 16, 11],
          "circle-color": [
            "case",
            [">=", ["get", "aff"], 0.35], "#4CAF50",
            ["get", "luxury"], "#8a6a14",
            "#2e8b6b",
          ],
          "circle-opacity": 0.92,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f4ffe8",
        },
        layout: { visibility: layers.apps ? "visible" : "none" },
      });
    }
  }

  async function addImagery() {
    imageryOk = false;
    paintLegoGround(map);
    add3dBuildings(map, imageryOk);
    try {
      const { attachLandmarks } = await import("./landmarks.js?v=ob2");
      await attachLandmarks(map, window.maplibregl);
    } catch (_) {}
    tuckGroundUnderBuildings(map);
  }

  function flyToLngLat(lng, lat, fly = {}) {
    if (!map || !ready || lng == null || lat == null) return;
    const dur = reducedMotion() ? 0 : fly.duration ?? 1400;
    map.flyTo({
      center: [lng, lat],
      zoom: fly.zoom ?? 16.5,
      pitch: fly.pitch ?? 55,
      bearing: fly.bearing ?? -18,
      duration: dur,
      essential: true,
    });
  }

  function bindChallenges() {
    if (!map || map._cbBound) return;
    map._cbBound = true;
    const fire = (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id && typeof opts.onChallenge === "function") opts.onChallenge(id);
    };
    map.on("click", "apps-dots", fire);
    map.on("mouseenter", "apps-dots", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "apps-dots", () => { map.getCanvas().style.cursor = ""; });
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

  function flyToStreet(app, fly = {}) {
    if (!map || !ready || !app?.centroid) return;
    lastApp = app;
    const cam = {
      center: [app.centroid.lon, app.centroid.lat - (fly.latNudge ?? 0.00032)],
      zoom: fly.zoom ?? 17.7,
      pitch: fly.pitch ?? 58,
      bearing: fly.bearing ?? -28,
      essential: true,
    };
    if (fly.jump || reducedMotion()) map.jumpTo(cam);
    else map.easeTo({ ...cam, duration: fly.duration ?? 800 });
    pulseMarker(app);
    try { map.resize(); } catch (_) {}
    scheduleLod();
    map.once("idle", () => {
      try { map.resize(); } catch (_) {}
      scheduleLod();
    });
  }

  function overview() {
    if (!map || !ready) return;
    const dur = reducedMotion() ? 0 : 900;
    map.easeTo({ ...TH_OVERVIEW, duration: dur, essential: true });
  }

  function setMode(next) {
    mode = next;
    if (wrap) {
      wrap.classList.toggle("is-3d", mode === "3d");
      wrap.classList.toggle("is-2d", mode === "2d");
    }
    if (mode === "3d" && map) {
      requestAnimationFrame(() => { try { map.resize(); } catch (_) {} });
    }
    applyLod();
  }

  function resize() {
    if (map && mode === "3d") {
      try { map.resize(); } catch (_) {}
    }
  }

  function fallback(reason) {
    try { window.__pdGlobeFail = String(reason || "fallback"); } catch (_) {}
    failed = true;
    ready = false;
    mode = "2d";
    if (wrap) {
      wrap.classList.add("is-2d");
      wrap.classList.remove("is-3d");
    }
    onStatus({ ok: false, reason: reason || "fallback", imagery: false });
  }

  async function start() {
    if (failed) return false;
    if (!container) { fallback("no container"); return false; }
    if (!webglOk()) { fallback("no webgl"); return false; }
    if (wrap) {
      wrap.classList.add("is-3d");
      wrap.classList.remove("is-2d");
    }
    ensureCss();
    let maplibregl;
    try { maplibregl = await loadScript(MAPLIBRE_JS); }
    catch (err) { fallback(String(err?.message || err)); return false; }
    if (!maplibregl) { fallback("maplibre missing"); return false; }
    try {
      map = new maplibregl.Map({
        container,
        style: STYLE_URL,
        center: TH_OVERVIEW.center,
        zoom: TH_OVERVIEW.zoom,
        pitch: TH_OVERVIEW.pitch,
        bearing: TH_OVERVIEW.bearing,
        maxPitch: DESK_MAX_PITCH,
        minZoom: 9,
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
    const loaded = await new Promise((resolve) => {
      let settled = false;
      const done = (ok) => { if (settled) return; settled = true; resolve(ok); };
      const bootTimeout = setTimeout(() => {
        if (!ready) { fallback("style timeout"); done(false); }
      }, 20000);
      map.once("load", async () => {
        clearTimeout(bootTimeout);
        try {
          await addImagery();
          ensureSources();
          bindChallenges();
          tuckGroundUnderBuildings(map);
          ready = true;
          tilesOk = true;
          mode = "3d";
          if (wrap) {
            wrap.classList.add("is-3d");
            wrap.classList.remove("is-2d");
          }
          styleReady = true;
          applyLod();
          map.on("pitchend", scheduleLod);
          try { window.__pdMap = map; } catch (_) {}
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

  function setApplications(list) {
    data.applications = list || [];
    if (!map || !ready) return;
    const src = map.getSource("apps-dots");
    if (src) src.setData(appsFeatureCollection(data.applications));
  }

  return {
    start,
    flyToApp,
    flyToStreet,
    flyToLngLat,
    overview,
    setMode,
    resize,
    setApplications,
    isReady: () => ready && !failed,
    getCamera: () => {
      if (!map || !ready) return null;
      const c = map.getCenter();
      return { lng: c.lng, lat: c.lat, pitch: map.getPitch(), zoom: map.getZoom(), bearing: map.getBearing() };
    },
    getMode: () => mode,
    tilesLoaded: () => tilesOk,
    imageryLoaded: () => imageryOk,
    failed: () => failed,
  };
}
