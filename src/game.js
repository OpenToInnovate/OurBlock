import { initialState, applyDecision, residentsFrom, previewDecision, proposalFrom, makeDeal, negotiateYield, TABLE_MS } from "./sim.js";
import { createMap } from "./map.js";
import { createGlobe } from "./globe.js?v=desk4";
import { placeOf, actionFx } from "./liveability.js";
import { distMetres } from "./geo.js";
import * as ui from "./ui.js";
import {
  lookupPostcode,
  streetImpact,
  renderStreetCard,
  fillBoroughSelect,
  loadSavedHome,
  saveHome,
} from "./home.js";

const PREFERRED = [
  "PA/26/00906/A1",
  "PA/26/01071/A1",
  "PA/24/00090/S",
  "PA/26/00589/A1",
  "PA/25/00557/A1",
  "PA/24/01451/A1",
  "PA/24/00368/A2",
  "PA/25/02240/S",
];

function uniqueKey(app) {
  return (app.lpa_app_no || app.id || "").replace(/\/NC$/, "");
}

export function pickDeck(applications, slug = "tower-hamlets") {
  const playable = applications.filter((a) => a.game?.playable && a.centroid);
  const byRef = new Map();
  for (const a of playable) {
    const k = uniqueKey(a);
    if (!byRef.has(k)) byRef.set(k, a);
  }
  const pool = [...byRef.values()];
  const deck = [];
  const used = new Set();
  const preferred = slug === "tower-hamlets" ? PREFERRED : [];
  for (const ref of preferred) {
    const hit = pool.find((a) => (a.lpa_app_no || "") === ref || uniqueKey(a) === ref.replace(/\/NC$/, ""));
    if (hit && !used.has(uniqueKey(hit))) {
      deck.push(hit);
      used.add(uniqueKey(hit));
    }
  }
  const rest = pool.filter((a) => !used.has(uniqueKey(a))).sort((a, b) => (b.game.units || 0) - (a.game.units || 0));
  for (const a of rest) {
    if (deck.length >= 8) break;
    deck.push(a);
    used.add(uniqueKey(a));
  }
  return deck.slice(0, 8);
}

const packCache = new Map();

function schoolsFromPack(pack) {
  return {
    type: "FeatureCollection",
    features: (pack.schools || []).map((s) => ({
      type: "Feature",
      properties: { name: s.name },
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
    })),
  };
}

export async function loadPack(slug) {
  if (packCache.has(slug)) return packCache.get(slug);
  const res = await fetch(`./data/packs/${slug}.json`);
  if (!res.ok) throw new Error(`no pack ${slug}`);
  const pack = await res.json();
  packCache.set(slug, pack);
  return pack;
}

export async function loadData() {
  const soft = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // Slim pack (~40KB) not the 1MB applications + 0.5MB crime cloud.
  const [boroughs, pack, boroughIndex, hospitalsLondon] = await Promise.all([
    fetch("./data/london-boroughs.geojson").then((r) => r.json()),
    fetch("./data/packs/tower-hamlets.json").then((r) => r.json()),
    soft("./data/boroughs.json"),
    soft("./data/hospitals-london.json"),
  ]);
  packCache.set("tower-hamlets", pack);
  const hospitals = (hospitalsLondon?.sites?.length ? hospitalsLondon.sites : pack.hospitals) || [];
  return {
    boroughs,
    boroughIndex,
    constraints: { type: "FeatureCollection", features: [] },
    applications: pack.applications,
    appsDoc: pack,
    baseline: pack.baseline,
    stakes: pack.stakes,
    crime: null,
    schools: schoolsFromPack(pack),
    hospitals,
    pack,
  };
}

function shortPred(p) {
  const extra = p.line.includes("priced out")
    ? " · out"
    : p.line.includes("stress")
      ? " · ↑rent"
      : p.support
        ? ` · ${p.support > 0 ? "+" : ""}${p.support}`
        : "";
  return `${p.homes >= 0 ? "+" : ""}${p.homes} · ${p.affordable} aff${extra}`;
}

function fmtInt(n) {
  return Number(n).toLocaleString("en-GB");
}

export function boot(root, data) {
  let deck = pickDeck(data.applications, data.pack?.slug);
  if (data.baseline.win) data.baseline.win.quarters = Math.max(1, deck.length);
  let state = initialState(data.baseline);
  const amenities = { crime: data.crime, schools: data.schools, hospitals: data.hospitals };
  let sittingSlug = data.pack?.slug || "tower-hamlets";
  let sitBusy = false;
  let taScenario = data.stakes?.ta?.householdsInTa ?? null;
  let taPrev = taScenario;
  const map = createMap(root.querySelector("#map"), data);
  const mapWrap = root.querySelector("#map-wrap");
  const globe = createGlobe(root.querySelector("#gl-map"), data, {
    wrap: mapWrap,
    noteEl: root.querySelector("#massing-note"),
    onStatus: (st) => {
      const btn = root.querySelector("#view-mode");
      if (!btn) return;
      if (!st.ok) {
        btn.hidden = true;
        mapWrap?.classList.add("is-2d");
        mapWrap?.classList.remove("is-3d");
      }
    },
  });
  let lastHud = { affordable: state.affordableCompletions, support: state.publicSupport, quarter: state.quarter };
  let muted = false;
  let audioCtx = null;
  let toastTimer = 0;
  let flyTimer = 0;
  let tableOpen = false;
  let tableStarted = 0;
  let tableRaf = 0;
  let tableKind = "policy35";
  let squeezeLocked = false;
  let eduIndex = 0;
  let lastEduAt = 0;
  let lastStallPaint = -1;
  let lastSecPaint = -1;
  const tableEl = document.querySelector("#table");
  const tableSecs = tableEl?.querySelector("#table-secs");
  const tableRing = tableEl?.querySelector("#table-ring");
  const tableTimer = tableEl?.querySelector("#table-timer");
  const tableCost = tableEl?.querySelector("#table-cost");
  const tableWarn = tableEl?.querySelector("#table-warn");
  const tableEdu = tableEl?.querySelector("#table-edu");
  const tableMinor = tableEl?.querySelector("#table-minor");
  const tableRef = tableEl?.querySelector("#table-title");

  const els = {
    chrome: root.querySelector("#chrome"),
    case: root.querySelector("#case-body") || root.querySelector("#case"),
    residents: root.querySelector("#residents"),
    meters: root.querySelector("#meters"),
    log: root.querySelector("#log"),
    end: document.querySelector("#end"),
    toast: root.querySelector("#toast"),
    pred: root.querySelector("#pred"),
  };

  function current() {
    return deck[state.quarter] || null;
  }

  function blip(kind) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new AudioContext();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.value = kind === "approve" ? 420 : kind === "refuse" ? 160 : 280;
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.08);
    } catch (_) {
      /* no audio context */
    }
  }

  function showToast(text) {
    const t = els.toast;
    if (!t) return;
    t.hidden = false;
    t.classList.remove("out");
    t.textContent = text;
    void t.offsetWidth;
    t.classList.add("in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("in");
      t.classList.add("out");
      setTimeout(() => {
        t.hidden = true;
        t.classList.remove("out");
      }, 280);
    }, 2200);
  }

  function paintPreds() {
    const app = current();
    root.querySelectorAll("[data-pred]").forEach((el) => {
      const kind = el.getAttribute("data-pred");
      if (!app || state.over) {
        el.textContent = "";
        return;
      }
      try {
        if (kind === "negotiate") {
          el.textContent = "15s · s106";
        } else {
          const p = previewDecision(state, app, kind, data.baseline, placeFor(app));
          el.textContent = shortPred(p);
        }
      } catch (err) {
        el.textContent = "preview";
        console.warn(err);
      }
    });
    if (els.pred && !els.pred.dataset.locked) els.pred.textContent = ui.hintFor(data.baseline);
  }

  function placeFor(app) {
    return app ? placeOf(app, amenities) : null;
  }

  function taHud() {
    const stakes = data.stakes;
    if (!stakes && taScenario == null) return "";
    if (taScenario == null) return "";
    const date = stakes?.ta?.asAt ? "31 Mar 2026" : (stakes?.snapshotDate || "");
    const changed = taScenario !== taPrev;
    const flash = taScenario > taPrev ? "tick down" : taScenario < taPrev ? "tick up" : "";
    const num = fmtInt(taScenario);
    const arrow = changed ? `${fmtInt(taPrev)} → ${num}` : date;
    const winN = data.baseline?.win?.affordableCompletions;
    const cap = changed
      ? "scenario, not a forecast"
      : stakes?.register?.households
        ? `Register ${fmtInt(stakes.register.households)}${winN ? ` · win ${winN}` : ""}`
        : "Official snapshot";
    return `<div class="hud-stat hud-ta ${flash}" title="Households in temporary accommodation. Official snapshot, not a forecast.">
        <span class="hud-label">TA</span>
        <span class="hud-num">${num}</span>
        <span class="hud-sub">${arrow}</span>
        <span class="hud-caption">${cap}</span>
      </div>`;
  }

  function warnHud() {
    const w = state.warnings || {};
    const bits = [];
    if (w.support) bits.push("Support low — still playing to Q8");
    if (w.pricedOut) bits.push("Two renters stressed out — warning, not game over");
    if (w.familyOut) bits.push("Family priced out — scores at the end");
    if (!bits.length) return "";
    return `<p class="hud-warn">${bits.join(" · ")}</p>`;
  }

  function paint(opts = {}) {
    const app = current();
    const place = placeFor(app);
    ui.renderChrome(els.chrome, state, data.baseline, lastHud, { taHtml: taHud(), warnHtml: warnHud() });
    ui.renderCase(els.case, app, data.baseline, place);
    const sum = root.querySelector("#case-sum-text");
    if (sum) {
      if (!app) sum.textContent = "No application";
      else {
        const ask = (app.game && app.game.plainAsk ? app.game.plainAsk : "").trim();
        const ref = app.lpa_app_no || app.id || "Case";
        sum.textContent = ask ? ref + " · " + ask : ref;
      }
    }
    ui.renderResidents(els.residents, state, data.baseline);
    ui.renderMeters(els.meters, state, data.baseline);
    ui.renderLog(els.log, state);
    ui.renderEnd(els.end, state);
    lastHud = {
      affordable: state.affordableCompletions,
      support: state.publicSupport,
      quarter: state.quarter,
    };
    map.draw(app?.id || app?.lpa_app_no, { hop: !!opts.hop });
    if (!opts.skipFly && globe.isReady() && globe.getMode() === "3d") {
      globe.flyToApp(app);
    }
    const locked = !!state.over;
    root.querySelectorAll("[data-decision]").forEach((b) => {
      b.disabled = locked || !app || tableOpen;
    });
    paintPreds();
    if (opts.slideCase) {
      const caseEl = root.querySelector("#case");
      if (caseEl) {
        caseEl.classList.remove("slide-in");
        void caseEl.offsetWidth;
        caseEl.classList.add("slide-in");
      }
    }
    const again = root.querySelector("#again");
    if (again) again.addEventListener("click", restart, { once: true });
  }

  function elapsedMs() {
    return Math.max(0, performance.now() - tableStarted);
  }

  function liveLine(app, kind) {
    const deal = makeDeal(kind, elapsedMs(), squeezeLocked);
    const y = negotiateYield(app, deal);
    if (y.collapse) return "0 homes";
    const pct = Math.round(y.affordablePct * 100);
    let extra = "";
    if (deal.stalls >= 2 && !(kind === "squeeze50" && squeezeLocked)) extra = " · viability";
    else if (kind === "squeeze50" && squeezeLocked) extra = " · 50% locked";
    return `${y.delivered} homes · ${pct}%${extra}`;
  }

  function paintTable(forceLives) {
    if (!tableEl || !tableOpen) return;
    const app = current();
    const elapsed = elapsedMs();
    const left = Math.max(0, Math.ceil((TABLE_MS - elapsed) / 1000));
    const tStalls = Math.min(3, Math.floor(elapsed / 5000));
    const costPct = tStalls * 3;
    if (left !== lastSecPaint && tableSecs) {
      lastSecPaint = left;
      tableSecs.textContent = String(left);
    }
    if (tableRing) tableRing.style.setProperty("--t", ((1 - elapsed / TABLE_MS) * 100).toFixed(1));
    if (tableTimer) {
      tableTimer.classList.toggle("hot", left <= 5 || costPct >= 6);
      tableTimer.classList.toggle("pulse", left <= 5);
    }
    if (forceLives || tStalls !== lastStallPaint) {
      lastStallPaint = tStalls;
      if (tableCost) {
        const now = tableCost.querySelector(".cost-now");
        if (now) {
          now.textContent = `+${costPct}%`;
          now.classList.remove("tick");
          void now.offsetWidth;
          now.classList.add("tick");
        }
        tableCost.classList.toggle("hot", costPct >= 6);
      }
      if (tableWarn) tableWarn.hidden = costPct < 6;
      if (app) {
        tableEl.querySelectorAll("[data-live]").forEach((el) => {
          el.textContent = liveLine(app, el.getAttribute("data-live"));
        });
      }
    }
  }

  function pickCard(kind) {
    if (!tableOpen) return;
    tableKind = kind === "squeeze50" || kind === "smaller" ? kind : "policy35";
    if (tableKind === "squeeze50" && Math.floor(elapsedMs() / 5000) < 2) squeezeLocked = true;
    tableEl?.querySelectorAll("[data-deal]").forEach((btn) => {
      const on = btn.getAttribute("data-deal") === tableKind;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-selected", String(on));
    });
    paintTable(true);
  }

  function closeTable() {
    tableOpen = false;
    if (tableRaf) cancelAnimationFrame(tableRaf);
    tableRaf = 0;
    if (tableEl) tableEl.hidden = true;
    document.body.classList.remove("table-open");
  }

  function tickTable(now) {
    if (!tableOpen) return;
    const elapsed = now - tableStarted;
    if (elapsed >= TABLE_MS) {
      closeTable();
      settle("negotiate", makeDeal("collapse", TABLE_MS));
      return;
    }
    if (now - lastEduAt >= 4000 && tableEdu) {
      eduIndex = (eduIndex + 1) % ui.TABLE_EDU.length;
      tableEdu.textContent = ui.TABLE_EDU[eduIndex];
      lastEduAt = now;
    }
    paintTable(false);
    tableRaf = requestAnimationFrame(tickTable);
  }

  function openTable() {
    if (tableOpen || state.over) return;
    const app = current();
    if (!app || !tableEl) return;
    tableOpen = true;
    tableKind = "policy35";
    squeezeLocked = false;
    tableStarted = performance.now();
    lastEduAt = tableStarted;
    eduIndex = 0;
    lastStallPaint = -1;
    lastSecPaint = -1;
    tableEl.hidden = false;
    document.body.classList.add("table-open");
    if (tableRef) tableRef.textContent = app.lpa_app_no || app.id || "Application";
    if (tableEdu) tableEdu.textContent = ui.TABLE_EDU[0];
    const units = app.game?.units || 0;
    if (tableMinor) {
      tableMinor.hidden = units >= 10;
      tableMinor.textContent =
        units < 10
          ? "Under 10 homes: H5 35% often does not bite. You can still extract a wheelchair unit / extra affordable."
          : "";
    }
    pickCard("policy35");
    paintTable(true);
    root.querySelectorAll("[data-decision]").forEach((b) => {
      b.disabled = true;
    });
    tableRaf = requestAnimationFrame(tickTable);
    tableEl.querySelector("#table-shake")?.focus();
  }

  function shakeTable() {
    if (!tableOpen) return;
    const deal = makeDeal(tableKind, elapsedMs(), squeezeLocked);
    closeTable();
    settle("negotiate", deal);
  }

  function walkTable() {
    if (!tableOpen) return;
    const deal = makeDeal("collapse", elapsedMs());
    closeTable();
    settle("negotiate", deal);
  }

  function decide(kind) {
    if (state.over) return;
    const app = current();
    if (!app) return;
    if (tableOpen) return;
    if (kind === "negotiate") {
      const btn = root.querySelector(`[data-decision="negotiate"]`);
      if (btn) {
        btn.classList.remove("pressed");
        void btn.offsetWidth;
        btn.classList.add("pressed");
        setTimeout(() => btn.classList.remove("pressed"), 220);
      }
      blip("negotiate");
      openTable();
      return;
    }
    settle(kind, null);
  }

  function settle(kind, deal) {
    if (state.over) return;
    const app = current();
    if (!app) return;
    const before = JSON.parse(JSON.stringify(state));
    const btn = root.querySelector(`[data-decision="${kind}"]`);
    if (btn && kind !== "negotiate") {
      btn.classList.remove("pressed");
      void btn.offsetWidth;
      btn.classList.add("pressed");
      setTimeout(() => btn.classList.remove("pressed"), 220);
    }
    blip(deal?.kind === "collapse" ? "refuse" : kind);
    const proposal = proposalFrom(app);
    if (kind === "negotiate" && deal && deal.kind !== "collapse") {
      const y = negotiateYield(app, deal);
      proposal.affordablePct = y.affordablePct;
      proposal.luxury = false;
    }
    const place = placeOf(app, amenities);
    taPrev = taScenario;
    const fxKind = kind === "negotiate" && deal?.kind === "collapse" ? "refuse" : kind;
    const fx = actionFx(app, fxKind, proposal, place, taScenario);
    fx.deal = deal;
    taScenario = fx.taTo;
    applyDecision(state, app, kind, data.baseline, place, deal);
    let lead;
    if (kind === "negotiate") {
      const last = state.log[0];
      if (deal?.kind === "collapse") lead = "Talks collapsed. 0 homes.";
      else {
        const pct = Math.round((last?.affordablePct ?? 0) * 100);
        const homes = (last?.affordable || 0) + (last?.market || 0);
        lead = `s106: ${pct}% · delay +${deal?.costPct ?? 0}% cost · ${homes} homes this term`;
      }
    } else {
      lead = ui.toastCopy(before, state, app, kind, data.baseline);
    }
    const toastBits = [lead];
    if (fx.crowd === "in") toastBits.push(`+${fx.crowdCount} moving in.`);
    if (fx.crowd === "out") toastBits.push("households leaving.");
    if (fx.taDelta) {
      toastBits.push(`TA ${fmtInt(fx.taFrom)} → ${fmtInt(fx.taTo)} (scenario, not a forecast).`);
      toastBits.push("No crime sim — TA is the real pressure.");
    }
    if (home?.lat != null && app.centroid) {
      const m = Math.round(distMetres(home.lat, home.lng, app.centroid.lat, app.centroid.lon));
      if (m <= 800) toastBits.push(`That's ${m} m from your door (${home.postcode}).`);
    }
    showToast(toastBits.join(" "));
    if (globe.isReady() && globe.getMode() === "3d") {
      globe.showDecision(app, kind, proposal, fx);
    }
    paint({ slideCase: !state.over, hop: !state.over, skipFly: true });
    const next = current();
    clearTimeout(flyTimer);
    const actionMs = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 400 : 2600;
    flyTimer = setTimeout(() => {
      if (globe.isReady() && globe.getMode() === "3d") globe.flyToApp(next);
      map.draw(next?.id || next?.lpa_app_no, { hop: !state.over });
    }, actionMs);
  }

  function restart() {
    closeTable();
    state = initialState(data.baseline);
    lastHud = { affordable: state.affordableCompletions, support: state.publicSupport, quarter: state.quarter };
    taScenario = data.stakes?.ta?.householdsInTa ?? null;
    taPrev = taScenario;
    ui.resetResidentViews();
    globe.clearMassing?.();
    paint({ slideCase: true, hop: true });
  }

  function applyPack(pack) {
    closeTable();
    data.pack = pack;
    data.applications = pack.applications || [];
    data.appsDoc = pack;
    data.baseline = pack.baseline;
    data.stakes = pack.stakes;
    data.schools = schoolsFromPack(pack);
    amenities.schools = data.schools;
    sittingSlug = pack.slug;
    deck = pickDeck(data.applications, pack.slug);
    if (data.baseline.win) data.baseline.win.quarters = Math.max(1, deck.length);
    state = initialState(data.baseline);
    lastHud = { affordable: state.affordableCompletions, support: state.publicSupport, quarter: state.quarter };
    taScenario = data.stakes?.ta?.householdsInTa ?? null;
    taPrev = taScenario;
    ui.resetResidentViews();
    globe.clearMassing?.();
    map.setApplications?.(data.applications);
    map.setFocus?.(pack.lad, pack.name);
    globe.setApplications?.(data.applications);
    document.title = `Planning Desk · ${pack.name}`;
    const glEl = root.querySelector("#gl-map");
    if (glEl) glEl.setAttribute("aria-label", `${pack.name}, Earth-style 3D map`);
    const svg = root.querySelector("#map");
    if (svg) svg.setAttribute("aria-label", `${pack.name} in Greater London`);
    const walkHint = document.querySelector(".table-walk-hint");
    const taN = data.stakes?.ta?.householdsInTa;
    if (walkHint) {
      walkHint.textContent = taN
        ? `Developer walks. They can appeal. The ${fmtInt(taN)} in TA get 0 this quarter.`
        : "Developer walks. They can appeal. Nobody in TA gets a home this quarter.";
    }
    if (els.pred) {
      els.pred.textContent = ui.hintFor(data.baseline);
      delete els.pred.dataset.kind;
      delete els.pred.dataset.locked;
    }
  }

  async function sitBorough(b, opts = {}) {
    if (!b?.slug) return false;
    if (sittingSlug === b.slug && !opts.force) {
      map.setFocus?.(b.lad, b.name);
      map.draw(current()?.id || current()?.lpa_app_no);
      if (!opts.skipFly && globe.isReady()) {
        const app = current();
        if (app) globe.flyToApp(app);
        else globe.flyToLngLat(b.lon, b.lat, { zoom: 12.3, pitch: 45 });
      }
      return true;
    }
    if (sitBusy) return false;
    sitBusy = true;
    if (hint) hint.textContent = `Sitting ${b.name}…`;
    try {
      const pack = await loadPack(b.slug);
      if (!pack.applications?.length) {
        if (hint) hint.textContent = `${b.name}: no playable stamps in this snapshot. Camera only.`;
        map.setFocus?.(b.lad, b.name);
        if (globe.isReady()) globe.flyToLngLat(b.lon, b.lat, { zoom: 12.3, pitch: 45 });
        return false;
      }
      if (!pack.baseline?.pipr || pack.baseline?.win?.affordableCompletions == null) {
        if (hint) hint.textContent = `${b.name} pack is missing rents or the 2023–24 target. Won't sit a broken desk.`;
        map.setFocus?.(b.lad, b.name);
        if (globe.isReady()) globe.flyToLngLat(b.lon, b.lat, { zoom: 12.3, pitch: 45 });
        return false;
      }
      applyPack(pack);
      paint({ slideCase: true, hop: true, skipFly: true });
      if (!opts.skipFly && globe.isReady()) {
        const app = current();
        if (app) globe.flyToApp(app);
        else globe.flyToLngLat(b.lon, b.lat, { zoom: 12.3, pitch: 45 });
      }
      const n = pack.applications.length;
      const target = pack.baseline?.win?.affordableCompletions;
      if (hint) {
        hint.textContent = n < 8
          ? `Sitting ${b.name}: ${n} real stamps this snapshot (not a fake 8).${target ? ` Win is ${target} affordable.` : ""}`
          : `Sitting ${b.name}. New term.${target ? ` Win is ${target} affordable (2023–24 pace).` : ""}`;
      }
      return true;
    } catch (err) {
      if (hint) hint.textContent = `${b.name} — no committee pack yet. Camera only, no fake deck.`;
      map.setFocus?.(b.lad, b.name);
      map.draw(current()?.id || current()?.lpa_app_no);
      if (globe.isReady()) globe.flyToLngLat(b.lon, b.lat, { zoom: 12.3, pitch: 45 });
      return false;
    } finally {
      sitBusy = false;
    }
  }

  root.querySelectorAll("[data-decision]").forEach((btn) => {
    const kind = btn.getAttribute("data-decision");
    btn.addEventListener("click", () => decide(kind));
    const show = () => {
      const app = current();
      if (!app || state.over || !els.pred || tableOpen) return;
      if (kind === "negotiate") {
        els.pred.textContent = "Open the s106 table · 15 seconds";
        els.pred.dataset.kind = kind;
        els.pred.dataset.locked = "1";
        return;
      }
      const p = previewDecision(state, app, kind, data.baseline, placeFor(app));
      els.pred.textContent = p.line;
      els.pred.dataset.kind = kind;
      els.pred.dataset.locked = "1";
    };
    const hide = () => {
      if (!els.pred) return;
      els.pred.textContent = ui.HINT;
      delete els.pred.dataset.kind;
      delete els.pred.dataset.locked;
    };
    btn.addEventListener("pointerenter", show);
    btn.addEventListener("focus", show);
    btn.addEventListener("pointerleave", hide);
    btn.addEventListener("blur", hide);
  });
  ui.bindKeys((kind) => decide(kind), {
    isOpen: () => tableOpen,
    pick: pickCard,
    shake: shakeTable,
    walk: walkTable,
  });
  tableEl?.querySelectorAll("[data-deal]").forEach((btn) => {
    btn.addEventListener("click", () => pickCard(btn.getAttribute("data-deal")));
  });
  tableEl?.querySelector("#table-shake")?.addEventListener("click", shakeTable);
  tableEl?.querySelector("#table-walk")?.addEventListener("click", walkTable);

  root.querySelectorAll("[data-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-layer");
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("on", on);
      map.setLayer(name, on);
      globe.setLayer(name, on);
      const app = current();
      map.draw(app?.id || app?.lpa_app_no);
    });
  });

  const viewBtn = root.querySelector("#view-mode");
  function setView(mode) {
    const three = mode === "3d" && globe.isReady();
    globe.setMode(three ? "3d" : "2d");
    if (viewBtn) {
      viewBtn.setAttribute("aria-pressed", String(three));
      viewBtn.textContent = three ? "3D" : "2D";
    }
    const app = current();
    if (three) {
      globe.resize();
      globe.flyToApp(app);
    } else {
      map.draw(app?.id || app?.lpa_app_no);
    }
  }
  viewBtn?.addEventListener("click", () => {
    if (!globe.isReady()) return;
    setView(globe.getMode() === "3d" ? "2d" : "3d");
  });

  els.case?.addEventListener("click", (ev) => {
    const more = ev.target.closest(".read-more");
    if (!more) return;
    const desc = els.case.querySelector(".desc");
    if (!desc) return;
    const open = desc.classList.toggle("open");
    more.textContent = open ? "Show less" : "Read more";
  });

  const resetBtn = root.querySelector("#reset-view");
  resetBtn?.addEventListener("click", () => {
    if (globe.isReady() && globe.getMode() === "3d") globe.resetView();
  });

  const muteBtn = root.querySelector("#mute");
  muteBtn?.addEventListener("click", () => {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.textContent = muted ? "Muted" : "Sound";
  });

  window.addEventListener("resize", () => {
    const app = current();
    map.draw(app?.id || app?.lpa_app_no);
    globe.resize();
  });

  const boroughList = data.boroughIndex?.boroughs || [];
  const pick = root.querySelector("#borough-pick");
  fillBoroughSelect(pick, boroughList, "E09000030");
  const hint = root.querySelector("#home-hint");
  const streetEl = root.querySelector("#street-card");
  let home = loadSavedHome();
  if (home?.postcode) {
    const inp = root.querySelector("#postcode");
    if (inp) inp.value = home.postcode;
    if (pick && home.lad) pick.value = home.lad;
  }

  async function applyHome(pc, via) {
    home = pc;
    saveHome(pc);
    const b = boroughList.find((x) => x.lad === pc.lad);
    if (pick && pc.lad) pick.value = pc.lad;
    let playable = sittingSlug === b?.slug;
    if (b && b.slug !== sittingSlug) {
      playable = await sitBorough(b, { skipFly: true, skipPaint: false });
    }
    map.setFocus?.(pc.lad, b?.name || pc.borough);
    map.draw(current()?.id || current()?.lpa_app_no);
    if (globe.isReady()) {
      globe.setHomePin(pc.lng, pc.lat);
      globe.flyToLngLat(pc.lng, pc.lat);
    }
    if (hint && playable) {
      hint.textContent = `Home: ${pc.postcode}. Sitting ${pc.borough}. A stamp near here hits your door.`;
    } else if (hint) {
      hint.textContent = `Home: ${pc.postcode} · ${pc.borough}. You're on your street.`;
    }
    const impact = await streetImpact(pc, {
      schools: data.pack?.schools || [],
      hospitals: data.hospitals || [],
      apps: playable ? data.applications : [],
    });
    renderStreetCard(streetEl, pc, impact, playable);
  }

  root.querySelector("#postcode-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const code = root.querySelector("#postcode")?.value;
    if (hint) hint.textContent = "Looking up your street…";
    try {
      const pc = await lookupPostcode(code);
      if (!pc.inLondon) {
        if (hint) hint.textContent = "That's outside Greater London. Try an inner or outer London postcode.";
        return;
      }
      await applyHome(pc, "postcode");
    } catch (err) {
      if (hint) hint.textContent = err.message || "Could not look up that postcode.";
    }
  });

  pick?.addEventListener("change", () => {
    const b = boroughList.find((x) => x.lad === pick.value);
    if (!b) return;
    sitBorough(b);
  });

  paint({ hop: true, skipFly: true });
  globe.start().then((ok) => {
    if (ok && globe.isReady()) {
      setView("3d");
      const app = current();
      globe.overview();
      if (home?.lng != null) {
        globe.setHomePin(home.lng, home.lat);
        setTimeout(() => applyHome(home, "restore"), reducedDelay());
      } else {
        setTimeout(() => globe.flyToApp(app), reducedDelay());
      }
    } else {
      if (viewBtn) viewBtn.hidden = true;
      mapWrap?.classList.add("is-2d");
      mapWrap?.classList.remove("is-3d");
    }
  });
  const api = { decide, restart, getState: () => state, residents: () => residentsFrom(state, data.baseline), globe };
  window.__pd = api;
  return api;
}

function reducedDelay() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 0 : 700;
}
