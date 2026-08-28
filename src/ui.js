import { proposalFrom, residentsFrom } from "./sim.js";

const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function fmtGBP(n) {
  return gbp0.format(Math.round(n));
}

function meter(value, max, cls) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return `<div class="meter ${cls}" role="meter" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="${max}"><span style="width:${pct}%"></span></div>`;
}

const TIPS = {
  article4: "In these streets, converting a house to flats needs planning permission — permitted development is off.",
  londonPlan: "Policy target for major schemes. The win is 432 affordable homes, not this percentage.",
  pipr: "Rent vs take-home. Stressed over 40%, priced out over 55%. Win: borough 2023–24 affordable pace, a family still in, support above 20.",
  hpi: "UK House Price Index for Tower Hamlets. Luxury schemes push sale prices up.",
  conservation: "A designated conservation area. Big schemes here can cost you support.",
  listed: "Near a listed building. Harm to its setting costs support.",
  brownfield: "Previously developed land. Easier civic case, slightly less rent pressure.",
  luxury: "High-end pipeline. Pushes rents and sale prices; residents notice.",
};

let lastMoods = {};

export function resetResidentViews() {
  lastMoods = {};
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chip(on, label, tip, extra = "") {
  const title = tip ? ` title="${esc(tip)}"` : "";
  const more = extra ? ` ${extra}` : "";
  return `<span class="chip ${on ? "on" : "off"}${more}"${title}>${esc(label)}</span>`;
}

function fallbackAsk(app, units) {
  const words = (app.description || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 12).join(" ");
  const n = Number(units);
  const u = Number.isFinite(n) ? ` ${n} home${n === 1 ? "" : "s"} on the card.` : "";
  return words ? `${words}.${u}` : `A scheme.${u}`;
}

export const HINT = "35% is policy · 432 is the win";

export function hintFor(baseline) {
  const n = baseline?.win?.affordableCompletions ?? 432;
  return `35% is policy · ${n} is the win`;
}

export const TABLE_EDU = [
  "s106 is a legal deal bolted onto the permission. Without it, the stamp is empty.",
  "London Plan H5: 35% affordable is the opening bid, not a favour.",
  "Every extra month of talks, the contractor's price goes up. Then they ask to cut homes you can afford.",
  "Walk away and they can appeal. Sit too long and the 3,096 still waiting get nothing this quarter.",
];

export function renderChrome(el, state, baseline, prev = {}, extra = {}) {
  const q = Math.min(state.quarter + 1, state.quartersTotal);
  const target = baseline.win.affordableCompletions;
  const affFlash =
    prev.affordable != null && prev.affordable !== state.affordableCompletions
      ? state.affordableCompletions > prev.affordable
        ? "tick up"
        : "tick down"
      : "";
  const supFlash =
    prev.support != null && prev.support !== state.publicSupport
      ? state.publicSupport > prev.support
        ? "tick up"
        : "tick down"
      : "";
  const pips = Array.from(
    { length: state.quartersTotal },
    (_, i) =>
      `<i class="${i < q ? "on" : ""} ${i === q - 1 && !state.over ? "now" : ""}"></i>`
  ).join("");
  const fromQ = Math.min((prev.quarter ?? state.quarter) + 1, state.quartersTotal);
  el.innerHTML = `
    <div class="mast">
      <p class="kicker">Your term · ${esc(baseline.borough || "London")}</p>
      <h1>Planning Desk</h1>
    </div>
    <div class="hud">
      <div class="hud-term" title="One real application each quarter. Term length is the stamps we actually have.">
        <span class="hud-label">Term</span>
        <div class="term-bar" role="meter" aria-valuenow="${q}" aria-valuemin="1" aria-valuemax="${state.quartersTotal}" aria-label="Quarter ${q} of ${state.quartersTotal}">
          <span class="term-fill"></span>
          <div class="pips">${pips}</div>
        </div>
        <span class="hud-readout">${q}/${state.quartersTotal}</span>
      </div>
      <div class="hud-stat ${affFlash}">
        <span class="hud-label" title="Policy target for major schemes. The win is ${target} affordable homes (2023–24 pace), not the 35%.">Affordable</span>
        <span class="hud-num">${state.affordableCompletions}</span>
        <span class="hud-sub">/ ${target}</span>
      </div>
      <div class="hud-stat ${supFlash}">
        <span class="hud-label">Support</span>
        <span class="hud-num">${state.publicSupport}</span>
        <span class="hud-sub">/ 100</span>
      </div>
      <div class="hud-stat hud-hpi">
        <span class="hud-label" title="UK House Price Index for ${esc(baseline.borough || "this borough")}. Luxury schemes push sale prices up.">HPI</span>
        <span class="hud-num hud-num-sm">${fmtGBP(baseline.ukhpi.averagePrice * state.priceIndex)}</span>
      </div>
      ${extra.taHtml || ""}
    </div>
    ${extra.warnHtml || ""}
  `;
  const fill = el.querySelector(".term-fill");
  if (fill) {
    const from = (fromQ / state.quartersTotal) * 100;
    const to = (q / state.quartersTotal) * 100;
    fill.style.width = `${from}%`;
    requestAnimationFrame(() => {
      fill.style.width = `${to}%`;
    });
  }
}

export function renderCase(el, app, baseline, place = null) {
  if (!app) {
    el.innerHTML = `<article class="case-card"><p class="empty">No application on the desk.</p></article>`;
    return;
  }
  const p = proposalFrom(app);
  const g = app.game || {};
  const c = p.constraints;
  const legal = (app.description || "").replace(/\s+/g, " ").trim();
  const ask = (g.plainAsk || "").trim() || fallbackAsk(app, p.units);
  const impact = (g.plainImpact || "").trim();
  const affPct = Math.round(p.affordablePct * 100);
  const net = g.unitsNet;
  const homesN = net != null ? net : p.units;
  const homesLabel = net != null ? "net homes" : "homes";
  const type =
    (app.application_type_full || app.application_type || "Application").replace(/application/i, "").trim() ||
    "Application";
  const liveChips = (place?.chips || [])
    .map((ch) => chip(!!ch.on, ch.label, ch.tip, ch.warn ? "warn" : ""))
    .join("");
  el.innerHTML = `
    <article class="case-card">
      <header class="case-head">
        <p class="ref">${esc(app.lpa_app_no || app.id)}</p>
        <p class="meta">${esc(app.ward || baseline.borough || "London")} · ${esc(type)}</p>
      </header>
      <p class="plain-ask">${esc(ask)}</p>
      ${impact ? `<p class="plain-impact">${esc(impact)}</p>` : ""}
      <div class="proposal">
        <div><span class="n${net != null && net < 0 ? " lose" : ""}">${homesN}</span><label>${homesLabel}</label></div>
        <div><span class="n">${affPct}%</span><label>affordable</label></div>
        <div title="${TIPS.londonPlan}"><span class="n policy-n">35%</span><label>London Plan</label></div>
      </div>
      <div class="chips" aria-label="Constraints">
        ${chip(c.conservation, c.conservationName ? `CA · ${c.conservationName}` : "Conservation", TIPS.conservation)}
        ${chip(c.listed, c.listedName ? `Listed · ${c.listedName}` : "Listed", TIPS.listed)}
        ${chip(c.article4, "Article 4", TIPS.article4)}
        ${chip(c.brownfield, c.brownfield ? `Brownfield${c.brownfieldHectares ? " · " + c.brownfieldHectares + " ha" : ""}` : "Brownfield", TIPS.brownfield)}
        ${chip(p.luxury, "Luxury", TIPS.luxury)}
        ${liveChips}
      </div>
      ${(place?.streetLine || place?.samLine) ? `<p class="liveline" title="Street liveability — school halo is not a catchment; hospital distance from named sites; crime locations are approximate.">${esc(place.streetLine || place.samLine)}</p>` : ""}
      <details class="official">
        <summary>Official wording</summary>
        <p class="desc legal">${esc(legal)}</p>
        ${app.url_planning_app ? `<p class="link"><a href="${esc(app.url_planning_app)}" target="_blank" rel="noopener">Borough register ↗</a></p>` : ""}
      </details>
    </article>
  `;
}

export function renderResidents(el, state, baseline) {
  const people = residentsFrom(state, baseline);
  const family = people.find((r) => r.id === "family");
  const priced = people.filter((r) => r.pricedOut);
  const stressed = people.filter((r) => r.stressed);
  const worst = people.reduce((a, b) => (a.ratio >= b.ratio ? a : b), people[0]);
  const typical = family || worst;
  const rentPct = typical.ratio * 100;
  const helped = people.some((r) => lastMoods[r.id] && r.ratio < lastMoods[r.id].ratio);
  let mood = "holding";
  let label = "Residents holding";
  let line = "Households are still covering rent at these prices.";
  if (priced.length) {
    mood = "hurt";
    label = "Residents hurt";
    if (priced.some((r) => r.id === "family")) {
      line = "A family is priced out. Rent is eating more than half of take-home.";
    } else if (priced.some((r) => r.id === "nurse")) {
      line = "A nurse is priced out. Rent is eating more than half of take-home.";
    } else {
      line = "A private renter is priced out. Rent is eating more than half of take-home.";
    }
  } else if (stressed.length >= 2) {
    mood = "hurt";
    label = "Residents stretched";
    line = "Two or more households are stretched by rent.";
  } else if (helped) {
    mood = "helped";
    label = "Residents helped";
    line = "Rent as a share of take-home eased on the street.";
  }
  const meterCls = priced.length ? "bad" : mood === "hurt" ? "warn" : "ok";
  const changed = !!(lastMoods.mood && lastMoods.mood !== mood);
  const react = changed ? " react" : "";
  el.innerHTML =
    "<article class=\"resident-impact " + mood + react + "\" data-mood=\"" + mood + "\">" +
    "<div class=\"who\"><h3>" + esc(label) + "</h3><p class=\"impact-line\">" + esc(line) + "</p></div>" +
    "<span class=\"pay\" title=\"Typical rent as a share of take-home\">" + rentPct.toFixed(0) + "%</span>" +
    meter(rentPct, 80, meterCls) +
    "</article>";
  if (changed) {
    const node = el.querySelector(".resident-impact.react");
    if (node) window.setTimeout(() => node.classList.remove("react"), 320);
  }
  lastMoods = { mood };
  for (const r of people) lastMoods[r.id] = { ratio: r.ratio };
}

export function renderMeters(el, state, baseline) {
  const t = baseline.thresholds;
  el.innerHTML = `
    <details class="how">
      <summary>How this works</summary>
      <p>Rent vs take-home. Stressed over ${(t.stressRentToTakeHome * 100).toFixed(0)}%, priced out over ${(t.pricedOutRentToTakeHome * 100).toFixed(0)}%. Win: borough 2023–24 affordable pace, a family still in, support above 20.</p>
      <p><span title="${TIPS.londonPlan}">London Plan 35%</span> is policy. Win at ${baseline.win?.affordableCompletions ?? 432} affordable homes (2023–24 pace) with a family still in and support above 20.</p>
      <p><span title="${TIPS.pipr}">PIPR</span> is the official private rent. <span title="${TIPS.hpi}">HPI</span> is the house-price index. Negotiate opens the s106 table: 15 seconds to shake on 35%, 50%, or a smaller building. Delay is a labelled cost scenario, not a forecast.</p>
    </details>
  `;
}

export function renderLog(el, state) {
  const last = state.log[0];
  if (!last) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `<p class="ticker"><strong>${last.decision}</strong> ${last.ref}</p>`;
}

export function renderEnd(el, state) {
  if (!el) return;
  if (!state.over) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  const win = state.over.win;
  el.innerHTML = `
    <div class="end-card ${win ? "win" : "lose"}">
      <p class="kicker">${win ? "Term held" : "Term lost"}</p>
      <h2>${win ? "You kept the borough." : "Cleared off the desk."}</h2>
      <p class="reason">${state.over.reason}</p>
      <ul class="end-stats">
        <li><b>${state.affordableCompletions}</b> affordable</li>
        <li><b>${state.totalHomes}</b> homes</li>
        <li><b>${state.publicSupport}</b> support</li>
      </ul>
      <button type="button" id="again" class="btn again">${win ? "Run it back" : "Sit another term"}</button>
    </div>
  `;
}

export function toastCopy(before, after, app, decision, baseline) {
  const p = proposalFrom(app);
  const bits = [];
  if (p.constraints.article4) bits.push("Article 4: conversions need permission.");
  else if (decision === "negotiate") {
    const d = after.log[0]?.deal;
    if (d?.kind === "collapse") bits.push("Talks collapsed. 0 homes.");
    else bits.push(`s106 deal. Delay +${d?.costPct ?? 0}% labelled cost.`);
  }
  else if (p.affordablePct >= 0.35 && decision === "approve") bits.push("London Plan 35% met — policy, not the 432 win line.");
  else if (p.units >= 10 && p.affordablePct < 0.35 && decision === "approve") bits.push("Below London Plan 35%.");
  else if (decision === "refuse" && p.luxury) bits.push("Luxury refused. Residents cheer; stock still tight.");
  else if (p.constraints.conservation && decision === "approve" && p.units >= 15) bits.push("Conservation area: big schemes cost support.");
  const rb = residentsFrom(before, baseline)[0];
  const ra = residentsFrom(after, baseline)[0];
  const dRent = Math.round(ra.rent - rb.rent);
  if (dRent) bits.push(`Rent ${dRent > 0 ? "+" : "\u2212"}\u00a3${Math.abs(dRent)}.`);
  const dAff = after.affordableCompletions - before.affordableCompletions;
  const offered = Math.round(p.affordablePct * 100);
  if (decision === "refuse") bits.push(`+0 affordable (they offered ${offered}%).`);
  else bits.push(`+${dAff} affordable (they offered ${offered}%).`);
  return bits.join(" ");
}

export function bindKeys(onDecision, table = null) {
  window.addEventListener("keydown", (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const tag = ev.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || ev.target?.isContentEditable) return;
    const k = ev.key.toLowerCase();
    if (table?.isOpen?.()) {
      if (k === "escape" || k === "n") {
        ev.preventDefault();
        return;
      }
      if (k === "a" || k === "r") return;
      if (k === "1") table.pick?.("policy35");
      else if (k === "2") table.pick?.("squeeze50");
      else if (k === "3") table.pick?.("smaller");
      else if (k === "enter" || k === "s") {
        ev.preventDefault();
        table.shake?.();
      } else if (k === "w") table.walk?.();
      return;
    }
    if (k === "a") onDecision("approve");
    else if (k === "r") onDecision("refuse");
    else if (k === "n") onDecision("negotiate");
  });
}
