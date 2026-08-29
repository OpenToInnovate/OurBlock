/** Our Block boot: landing → walk pins → talk → stacker. Desk stays dead. */

import { createGlobe } from "./globe.js?v=ob19";
import {
  talkLines,
  challengeSpec,
  factsModel,
  factCopy,
  isLowSocial,
  sharePayload,
  civicLoseLine,
  civicFailRetryLine,
  civicWinLine,
} from "./talk.js?v=ob18";
import { createStacker } from "./stacker.js?v=ob14";
import { loadProgress, saveChallenge, challengeId, recordOf } from "./progress.js?v=ob16";
import { unlockAudio } from "./stack-fx.js?v=ob14";

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
let civicBundle = null;
let civicIgnoreUntil = 0;
let talkIgnoreUntil = 0;
let stackPtrDown = false;
let talkTimer = 0;
let talkFull = "";
let talkTyping = false;

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function loadChallenges() {
  const soft = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [boroughs, th, hospitals, civic] = await Promise.all([
    soft("./data/boroughs.json"),
    fetch("./data/packs/tower-hamlets.json?v=ob15").then((r) => r.json()),
    soft("./data/hospitals-london.json"),
    soft("./data/civic.json"),
  ]);
  civicBundle = civic || { national: {}, councils: {} };
  const slugs = (boroughs?.boroughs || [])
    .filter((b) => b.playable && b.slug !== "tower-hamlets")
    .map((b) => b.slug);
  const packs = await Promise.all(
    slugs.map((s) => soft(`./data/packs/${s}.json?v=ob15`))
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
    civic: civicBundle,
  };
}

function paintScore() {
  const n = $("cb-score-num");
  if (n) n.textContent = String(score);
  const b = $("cb-boro");
  if (b) b.textContent = borough;
}


function stopTalkType() {
  if (talkTimer) clearTimeout(talkTimer);
  talkTimer = 0;
  talkTyping = false;
  $("talk-line")?.classList.remove("is-typing");
}

function finishTalkType() {
  stopTalkType();
  const el = $("talk-line");
  if (el) el.textContent = talkFull;
}

function typeTalkLine(text) {
  stopTalkType();
  talkFull = String(text || "");
  const el = $("talk-line");
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce || !talkFull) {
    el.textContent = talkFull;
    return;
  }
  talkTyping = true;
  el.classList.add("is-typing");
  let i = 0;
  el.textContent = "";
  const tick = () => {
    if (!talkTyping) return;
    i += 1;
    if (i >= talkFull.length) {
      finishTalkType();
      return;
    }
    el.textContent = talkFull.slice(0, i);
    const ms = 20 + Math.floor(Math.random() * 9);
    talkTimer = setTimeout(tick, ms);
  };
  talkTimer = setTimeout(tick, 20 + Math.floor(Math.random() * 9));
}

function paintTalkButtons() {
  const last = lineIdx >= lines.length - 1;
  $("talk-next").hidden = last;
  $("talk-stack").hidden = !last;
  if (last) $("talk-stack")?.focus();
}

function setMode(next, globe) {
  mode = next;
  const wrap = $("map-wrap");
  wrap?.classList.toggle("is-landing", next === "landing");
  wrap?.classList.toggle("is-walk", next === "walk" || next === "talk" || next === "civic");
  wrap?.classList.toggle("is-stack", next === "stack");
  $("landing").hidden = next !== "landing";
  $("walk-hud").hidden = next === "landing" || next === "stack" || next === "civic";
  $("talk").hidden = next !== "talk";
  $("stack").hidden = next !== "stack";
  $("civic").hidden = next !== "civic";
  if (next !== "landing") stopDrift();
  if (next !== "stack") stopStackWander();
  if (next !== "talk") stopTalkType();
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

function scoreLine(app) {
  const rec = recordOf(challengeId(app));
  if (!rec?.done) return "";
  const max = rec.max || 0;
  const pct = max ? Math.round((100 * rec.social) / max) : 0;
  if (max && rec.social >= max) return `Perfect · ${rec.social} / ${max} social homes. Stack again if you like.`;
  return `You stacked ${rec.social} / ${max} social homes (${pct}%). Have another go.`;
}

function fillFacts(app) {
  const el = $("facts");
  if (!el) return;
  if (!app) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  const c = factCopy(app);
  const bits = [];
  if (c.site) bits.push(`<p class="facts-site">${esc(c.site)}</p>`);
  if (c.place) bits.push(`<p class="facts-place">${esc(c.place)}</p>`);

  if (c.ask) {
    bits.push(`<p class="facts-ask"><span class="facts-label">What they want</span>${esc(c.ask)}</p>`);
  }

  if (c.homes.length) {
    const tone = c.low ? " is-low" : c.ok ? " is-ok" : "";
    bits.push(`<p class="facts-row"><span class="facts-label">Homes</span><span class="facts-aff${tone}">${esc(c.homes.join(" "))}</span></p>`);
  }

  bits.push(`<p class="facts-row"><span class="facts-label">London rule</span>${esc(c.london)}</p>`);

  if (c.extras.length) {
    bits.push(`<p class="facts-label">This street</p><ul class="facts-constraints">`);
    for (const extra of c.extras) bits.push(`<li>${esc(extra)}</li>`);
    bits.push(`</ul>`);
  }

  if (c.impact) {
    bits.push(`<p class="facts-impact"><span class="facts-label">What it means</span>${esc(c.impact)}</p>`);
  }
  if (c.stalled) {
    bits.push(`<p class="facts-note">${esc(c.stalled)}</p>`);
  }
  if (c.url) {
    bits.push(`<p class="facts-row"><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.linkLabel)}</a></p>`);
  }
  el.innerHTML = bits.join("");
  el.hidden = false;
}

function showTalk(app) {
  current = app;
  borough = app.borough || "London";
  const spec = challengeSpec(app);
  const talkEl = $("talk");
  const mad = !!(app.game?.luxury || (spec.aff != null && spec.aff < 0.2));
  const chuffed = !mad && spec.aff != null && spec.aff >= 0.35;
  talkEl?.classList.toggle("is-mad", mad);
  talkEl?.classList.toggle("is-chuffed", chuffed);
  stopTalkType();
  lines = talkLines(app).slice(0, 3);
  lineIdx = 0;
  const btn = $("talk-stack");
  if (btn) {
    const rec = recordOf(challengeId(app));
    btn.textContent = rec?.done ? "STACK AGAIN" : "STACK";
  }
  paintTalkButtons();
  typeTalkLine(lines[0] || "");
  fillFacts(app);
  paintScore();
  talkIgnoreUntil = performance.now() + 300;
}

function onTalkNext() {
  if (talkTyping) {
    finishTalkType();
    return;
  }
  advanceTalk();
}

function advanceTalk() {
  if (lineIdx >= lines.length - 1) return;
  lineIdx += 1;
  paintTalkButtons();
  typeTalkLine(lines[lineIdx] || "Let's get it stacked.");
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
    return list.find((a) => a.game?.luxury || (a.game?.affordablePct != null && Number(a.game.affordablePct) < 0.12));
  }
  if (kind === "social") {
    return list.find((a) => !a.game?.luxury && a.game?.affordablePct != null && Number(a.game.affordablePct) >= 0.35);
  }
  if (kind === "mixed") {
    return list.find((a) => {
      const aff = a.game?.affordablePct;
      if (aff == null) return !a.game?.luxury;
      const n = Number(aff);
      return !a.game?.luxury && n >= 0.12 && n < 0.35;
    });
  }
  return list.find((a) => a.boroughSlug === "tower-hamlets") || list[0];
}

function restartDrop(el) {
  if (!el) return;
  el.hidden = false;
  el.classList.remove("is-in");
  void el.offsetWidth;
  el.classList.add("is-in");
}

function showCivic(app, globe, opts = {}) {
  const won = opts.won !== false;
  current = app;
  borough = app.borough || "London";
  const low = isLowSocial(app);
  const civicEl = $("civic");
  const drop = $("civic-drop");
  const title = $("civic-title");
  const line = $("civic-line");
  const share = $("civic-share");
  const appBtn = $("civic-app");

  civicEl?.classList.toggle("is-fail", !won);
  civicEl?.classList.toggle("is-win-lose", !!(won && low));
  civicEl?.classList.toggle("is-fail-retry", !!(!won && !low));

  if (!won) {
    if (drop) {
      drop.hidden = false;
      drop.textContent = "You Failed.";
      restartDrop(drop);
    }
  } else if (drop) {
    drop.hidden = true;
    drop.classList.remove("is-in");
  }

  if (title) {
    if (won && low) {
      title.textContent = "You won. Our Block lost.";
      title.hidden = false;
    } else if (won && !low) {
      title.textContent = "You won. Our Block won.";
      title.hidden = false;
    } else if (!won && low) {
      title.textContent = "Our Block lost.";
      title.hidden = false;
    } else {
      title.textContent = "You Failed.";
      title.hidden = false;
    }
  }

  if (line) {
    if (won && !low) line.textContent = civicWinLine();
    else if (low) line.textContent = civicLoseLine();
    else line.textContent = civicFailRetryLine();
  }

  if (share) share.hidden = false;
  if (appBtn) appBtn.hidden = !app?.url_planning_app;
  const st = $("civic-share-status");
  if (st) {
    st.hidden = true;
    st.textContent = "";
  }
  paintScore();
  civicIgnoreUntil = performance.now() + 900;
  setMode("civic", globe);
}

function showCivicLose(app, globe) {
  showCivic(app, globe, { won: true });
}

async function postStance(app) {
  const payload = sharePayload(app, civicBundle);
  const st = $("civic-share-status");
  const setStatus = (msg) => {
    if (!st) return;
    st.hidden = false;
    st.textContent = msg;
  };
  if (navigator.share) {
    try {
      await navigator.share({ title: payload.title, text: payload.text, url: payload.url });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  const blob = `${payload.text}`;
  try {
    await navigator.clipboard.writeText(blob);
    setStatus("Copied");
    return;
  } catch (_) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = blob;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    setStatus("Copied");
  } catch (_) {
    setStatus("Copy the text above.");
  }
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
    const id = challengeId(current);
    if (id) {
      const all = saveChallenge(id, {
        social: result.social || 0,
        max: result.max || 0,
        rubble: result.rubble || 0,
        done: true,
      });
      globe.setProgress?.(all);
    }
    showCivic(current, globe, { won: !!result.won });
  });
  stacker.start();
  const q = new URLSearchParams(location.search);
  const seed = Number(q.get("seed") || 0);
  if (seed) stacker.seedFloors(seed);
  if (q.get("play") === "1") stacker.freezePlay();
  if (q.get("chop") === "1") setTimeout(() => stacker.debugChopDrop?.(), 360);
  if (q.get("win") === "1") stacker.seedFloors(stacker.spec.floors);
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
  $("talk-next")?.addEventListener("click", onTalkNext);
  $("talk-stack")?.addEventListener("click", () => {
    unlockAudio();
    openStack(globe);
  });
  $("civic-share")?.addEventListener("click", () => {
    if (current) postStance(current);
  });
  $("civic-app")?.addEventListener("click", () => {
    const url = current?.url_planning_app;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  });
  $("talk")?.addEventListener("click", (ev) => {
    if (ev.target.closest(".talk-facts")) return;
    if (ev.target.closest("#talk-next") || ev.target.closest("#talk-stack")) return;
    if (ev.target.closest(".talk-andy") || ev.target.closest("#talk-line")) {
      if (talkTyping) finishTalkType();
      return;
    }
    if (performance.now() < talkIgnoreUntil) return;
    setMode("walk", globe);
  });
  document.addEventListener("pointerdown", (ev) => {
    stackPtrDown = !!(ev.target && ev.target.closest && ev.target.closest("#stack"));
  }, true);
  $("civic")?.addEventListener("pointerup", (ev) => {
    if (stackPtrDown) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);
  $("civic")?.addEventListener("click", (ev) => {
    if (ev.target.closest(".civic-card")) return;
    if (stackPtrDown) return;
    if (performance.now() < civicIgnoreUntil) return;
    setMode("walk", globe);
    globe.overview?.();
  });

  paintScore();
  const bootScene = new URLSearchParams(location.search).get("scene");
  setMode(bootScene === "stack" || bootScene === "walk" || bootScene === "talk" || bootScene === "civic" ? "walk" : "landing", globe);

  globe.start().then((ok) => {
    if (ok && globe.isReady()) {
      globe.setMode("3d");
      globe.setApplications(data.challenges || data.applications);
      globe.setProgress?.(loadProgress());
      globe.flyToLngLat(LONDON.lng, LONDON.lat, { zoom: 11.2, pitch: 0, bearing: -12, duration: 0 });
    }
    const st = $("boot-status");
    if (st) st.hidden = true;
    const scene = new URLSearchParams(location.search).get("scene");
    if (scene === "walk" || scene === "talk" || scene === "stack" || scene === "civic") {
      setMode("walk", globe);
      const app = pickSceneApp(data);
      if ((scene === "talk" || scene === "stack" || scene === "civic") && app) {
        current = app;
        showTalk(app);
        setMode("talk", globe);
        if (ok) globe.flyToStreet(app, { jump: true, zoom: 17.7, pitch: 58 });
      }
      if (scene === "stack") openStack(globe);
      if (scene === "civic" && app) {
        const fail = new URLSearchParams(location.search).get("fail") === "1";
        showCivic(app, globe, { won: !fail });
      }
    } else if (ok) {
      startDrift(globe);
    }
  });

  window.addEventListener("resize", () => globe.resize());
  window.visualViewport?.addEventListener("resize", () => globe.resize());
  window.__cb = {
    globe,
    score: () => score,
    mode: () => mode,
    challenges: () => data.challenges,
    civic: () => civicBundle,
    current: () => current,
    facts: (app) => factsModel(app || current),
    copy: (app) => factCopy(app || current),
    share: (app) => sharePayload(app || current, civicBundle),
    open: (id) => {
      const app = byId.get(id) || data.challenges[0];
      if (!app) return;
      showTalk(app);
      setMode("talk", globe);
    },
    stackNow: () => openStack(globe),
    stacker: () => stacker,
    progress: () => loadProgress(),
    showCivic: (id, won = true) => {
      const app = (typeof id === "string" && byId.get(id)) || current || data.challenges[0];
      if (app) showCivic(app, globe, { won: won !== false });
    },
  };
  return window.__cb;
}
