/** Our Block boot: landing → walk pins → talk → stacker. Desk stays dead. */

import { createGlobe } from "./globe.js?v=ob3";
import { talkLines } from "./talk.js?v=ob3";
import { createStacker } from "./stacker.js?v=ob3";

const LONDON = { lng: -0.1, lat: 51.51, zoom: 11.15, pitch: 0, bearing: -12 };

const byId = new Map();
let score = 0;
let borough = "London";
let mode = "landing";
let lineIdx = 0;
let lines = [];
let current = null;
let stacker = null;
let driftTimer = 0;
let driftDir = 1;
let stackWanderTimer = 0;

function $(id) {
  return document.getElementById(id);
}

export async function loadChallenges() {
  const soft = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [boroughs, th, hospitals] = await Promise.all([
    soft("./data/boroughs.json"),
    fetch("./data/packs/tower-hamlets.json").then((r) => r.json()),
    soft("./data/hospitals-london.json"),
  ]);
  const slugs = (boroughs?.boroughs || [])
    .filter((b) => b.playable && b.slug !== "tower-hamlets")
    .map((b) => b.slug);
  const packs = await Promise.all(
    slugs.map((s) => soft(`./data/packs/${s}.json`))
  );
  const all = [th, ...packs.filter(Boolean)];
  const challenges = [];
  for (const pack of all) {
    for (const app of pack.applications || []) {
      if (!app.centroid || app.game?.playable === false) continue;
      const row = { ...app, borough: pack.name, boroughSlug: pack.slug };
      const id = row.id || row.lpa_app_no;
      if (!id || byId.has(id)) continue;
      byId.set(id, row);
      challenges.push(row);
    }
  }
  return {
    boroughs: { type: "FeatureCollection", features: [] },
    boroughIndex: boroughs,
    applications: challenges,
    hospitals: hospitals?.sites || th.hospitals || [],
    pack: th,
    challenges,
  };
}

function paintScore() {
  const n = $("cb-score-num");
  if (n) n.textContent = String(score);
  const b = $("cb-boro");
  if (b) b.textContent = borough;
}

function setMode(next, globe) {
  mode = next;
  const wrap = $("map-wrap");
  wrap?.classList.toggle("is-landing", next === "landing");
  wrap?.classList.toggle("is-walk", next === "walk" || next === "talk");
  wrap?.classList.toggle("is-stack", next === "stack");
  $("landing").hidden = next !== "landing";
  $("walk-hud").hidden = next === "landing" || next === "stack";
  $("talk").hidden = next !== "talk";
  $("stack").hidden = next !== "stack";
  if (next !== "landing") stopDrift();
  if (next !== "stack") stopStackWander();
  globe?.resize?.();
}

function stopDrift() {
  clearTimeout(driftTimer);
  driftTimer = 0;
}

function startDrift(globe) {
  stopDrift();
  const tick = () => {
    if (mode !== "landing" || !globe.isReady()) return;
    const cam = globe.getCamera() || LONDON;
    globe.flyToLngLat(cam.lng + driftDir * 0.018, cam.lat + driftDir * 0.002, {
      zoom: 11.2,
      pitch: 0,
      bearing: (cam.bearing || 0) + driftDir * 6,
      duration: 9000,
    });
    driftDir *= -1;
    driftTimer = setTimeout(tick, 9200);
  };
  tick();
}
function stopStackWander() {
  clearTimeout(stackWanderTimer);
  stackWanderTimer = 0;
}

function startStackWander(globe, app) {
  stopStackWander();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  const origin = app?.centroid;
  if (!origin || origin.lon == null || origin.lat == null) return;
  const tick = () => {
    if (mode !== "stack" || !globe.isReady()) return;
    const cam = globe.getCamera() || {};
    const bearing = -28 + (Math.random() < 0.5 ? 1 : -1) * (20 + Math.random() * 5);
    const pitch = 52 + Math.random() * 12;
    const lng = origin.lon + (Math.random() * 2 - 1) * 0.0002;
    const lat = origin.lat + (Math.random() * 2 - 1) * 0.0002;
    const duration = 7000 + Math.random() * 1000;
    globe.flyToLngLat(lng, lat, {
      zoom: cam.zoom || 17.7,
      pitch,
      bearing,
      duration,
    });
    stackWanderTimer = setTimeout(tick, duration + 200);
  };
  tick();
}

function showTalk(app) {
  current = app;
  borough = app.borough || "London";
  lines = talkLines(app);
  lineIdx = 0;
  $("talk-line").textContent = lines[0] || "";
  $("talk-next").hidden = lines.length <= 1;
  $("talk-stack").hidden = lines.length > 1;
  paintScore();
}

function advanceTalk() {
  lineIdx += 1;
  if (lineIdx >= lines.length - 1) {
    $("talk-line").textContent = lines[lines.length - 1] || "Stack it.";
    $("talk-next").hidden = true;
    $("talk-stack").hidden = false;
    $("talk-stack").focus();
    return;
  }
  $("talk-line").textContent = lines[lineIdx];
}

function pickSceneApp(data) {
  const q = new URLSearchParams(location.search);
  const id = q.get("app");
  const list = data.challenges || [];
  if (id) {
    return byId.get(id) || list.find((a) => (a.id || a.lpa_app_no || "").includes(id));
  }
  const kind = q.get("kind");
  if (kind === "luxury") {
    return list.find((a) => a.game?.luxury || (Number(a.game?.affordablePct) || 0) < 0.12);
  }
  if (kind === "social") {
    return list.find((a) => !a.game?.luxury && (Number(a.game?.affordablePct) || 0) >= 0.35);
  }
  if (kind === "mixed") {
    return list.find((a) => {
      const aff = Number(a.game?.affordablePct) || 0;
      return !a.game?.luxury && aff >= 0.12 && aff < 0.35;
    });
  }
  return list.find((a) => a.boroughSlug === "tower-hamlets") || list[0];
}

function openStack(globe) {
  if (!current) return;
  setMode("stack", globe);
  globe.setMode?.("3d");
  globe.flyToStreet?.(current, { jump: true, zoom: 17.7, pitch: 58 });
  globe.resize?.();
  setTimeout(() => startStackWander(globe, current), 1000);
  setTimeout(() => {
    globe.setMode?.("3d");
    globe.flyToStreet?.(current, { jump: true, zoom: 17.7, pitch: 58 });
    globe.resize?.();
  }, 900);
  const canvas = $("stack-canvas");
  stacker?.stop?.();
  stacker = createStacker(canvas, current, (result) => {
    score += result.social || 0;
    paintScore();
    setMode("walk", globe);
    globe.overview?.();
  });
  stacker.start();
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get("seed") || 0);
  if (seed) stacker.seedFloors(seed);
  if (q.get("play") === "1") stacker.freezePlay();
  window.__cb && (window.__cb.stacker = stacker);
}

export function boot(root, data) {
  const wrap = root.querySelector("#map-wrap");
  const globe = createGlobe(root.querySelector("#gl-map"), data, {
    wrap,
    onChallenge: (id) => {
      if (mode !== "walk") return;
      const app = byId.get(id);
      if (!app) return;
      current = app;
      borough = app.borough || "London";
      paintScore();
      globe.flyToApp(app);
      showTalk(app);
      setMode("talk", globe);
    },
    onStatus: () => {},
  });

  $("walk-london")?.addEventListener("click", () => {
    setMode("walk", globe);
    if (globe.isReady()) {
      globe.flyToLngLat(LONDON.lng, LONDON.lat, { zoom: 11.6, pitch: 18, bearing: -14, duration: 1200 });
    }
  });
  $("talk-next")?.addEventListener("click", advanceTalk);
  $("talk-stack")?.addEventListener("click", () => openStack(globe));

  paintScore();
  const bootScene = new URLSearchParams(location.search).get("scene");
  setMode(bootScene === "stack" || bootScene === "walk" || bootScene === "talk" ? "walk" : "landing", globe);

  globe.start().then((ok) => {
    if (ok && globe.isReady()) {
      globe.setMode("3d");
      globe.setApplications(data.challenges || data.applications);
      globe.flyToLngLat(LONDON.lng, LONDON.lat, { zoom: 11.2, pitch: 0, bearing: -12, duration: 0 });
    }
    const st = $("boot-status");
    if (st) st.hidden = true;
    const scene = new URLSearchParams(location.search).get("scene");
    if (scene === "walk" || scene === "talk" || scene === "stack") {
      setMode("walk", globe);
      const app = pickSceneApp(data);
      if ((scene === "talk" || scene === "stack") && app) {
        current = app;
        showTalk(app);
        setMode("talk", globe);
        if (ok) globe.flyToStreet(app, { jump: true, zoom: 17.7, pitch: 58 });
      }
      if (scene === "stack") openStack(globe);
    } else if (ok) {
      startDrift(globe);
    }
  });

  window.addEventListener("resize", () => globe.resize());
  window.__cb = {
    globe,
    score: () => score,
    mode: () => mode,
    challenges: () => data.challenges,
    open: (id) => {
      const app = byId.get(id) || data.challenges[0];
      if (!app) return;
      showTalk(app);
      setMode("talk", globe);
    },
    stackNow: () => openStack(globe),
    stacker: () => stacker,
  };
  return window.__cb;
}
