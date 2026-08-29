#!/usr/bin/env node
/**
 * Build slim playable packs for Greater London LAs.
 * Does NOT overwrite data/packs/tower-hamlets.json.
 * CORS: PLD is server-side only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLD = "https://planningdata.london.gov.uk/api-guest/applications/_search";
const SNAPSHOT = "2026-08-28";
const CRIME_MONTH = "2026-05";
const INNER = new Set([
  "Camden", "City of London", "Hackney", "Hammersmith and Fulham", "Islington",
  "Kensington and Chelsea", "Lambeth", "Lewisham", "Southwark", "Tower Hamlets",
  "Wandsworth", "Westminster",
]);

const SOURCE_FIELDS = [
  "id", "lpa_name", "lpa_app_no", "borough", "ward", "description",
  "application_type", "application_type_full", "development_type",
  "status", "decision", "decision_date", "valid_date",
  "centroid", "url_planning_app", "uprn", "postcode",
  "site_name", "street_name",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseUnits(desc) {
  const t = desc || "";
  const skip = /scoping opinion|screening opinion|environmental impact assessment \(eia\)/i.test(t);
  const patterns = [
    /comprising\s+([0-9,]{1,6})\s+residential(?:\s+units)?/i,
    /([0-9,]{1,6})\s+residential units/i,
    /provide\s+([0-9,]{1,6})\s+residential/i,
    /comprising\s+([0-9,]{1,6})\s+dwellings/i,
    /([0-9,]{1,6})\s+(?:new\s+)?dwellings/i,
    /create\s+([0-9,]{1,6})\s+flats/i,
    /([0-9,]{1,6})\s+flats\b/i,
    /([0-9,]{1,6})\s+homes\b/i,
    /([0-9,]{1,6})\s+apartments/i,
    /(\d+)\s*no\.?\s*self-contained/i,
    /(\d+)\s*no\.?\s*(?:residential\s+)?(?:flats|dwellings|units)/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0 && n < 5000) {
        return { units: n, unitsSource: "description", eiaContext: skip };
      }
    }
  }
  if (/\b(a|one)\s+self-contained/i.test(t) || /1\s*no\./i.test(t)) {
    return { units: 1, unitsSource: "description-one", eiaContext: skip };
  }
  if (/\btwo\s+(?:additional\s+)?(?:flats|dwellings|homes|units)/i.test(t)) {
    return { units: 2, unitsSource: "description-two", eiaContext: skip };
  }
  const storeys = t.match(/(\d{1,2})-storey/i);
  if (storeys && /residential|dwellings|flats|mixed[- ]use/i.test(t)) {
    const st = parseInt(storeys[1], 10);
    if (st >= 4) {
      return { units: Math.min(400, Math.round(st * 6)), unitsSource: "storey-estimate", eiaContext: skip };
    }
  }
  return { units: null, unitsSource: null, eiaContext: skip };
}

function parseAffordable(desc, units) {
  const t = desc || "";
  const pct = t.match(/(\d{1,2})\s*%\s*affordable/i);
  if (pct) return { affordablePct: Math.min(100, parseInt(pct[1], 10)) / 100, affordableSource: "percent" };
  const n = t.match(/(\d{1,4})\s+affordable(?:\s+homes|\s+units|\s+dwellings)?/i);
  if (n && units) {
    const a = parseInt(n[1], 10);
    if (a <= units) return { affordablePct: a / units, affordableSource: "count" };
  }
  return { affordablePct: null, affordableSource: "not-stated" };
}

function isLuxury(app, units) {
  const t = `${app.description || ""} ${app.ward || ""}`.toLowerCase();
  if (/luxury|penthouse|private homes|riverside|build to rent/.test(t) && (units || 0) >= 20) return true;
  if ((units || 0) >= 150) return true;
  const storey = (app.description || "").match(/(\d{1,2})-storey/i);
  if (storey && parseInt(storey[1], 10) >= 15) return true;
  return false;
}

function isPlayable(app, meta) {
  const type = (app.application_type_full || app.application_type || "").toLowerCase();
  const desc = (app.description || "").toLowerCase();
  if (/householder/.test(type)) return false;
  if (/lawful development|non-material|discharge|approval of details|prior approval|advertisement|scoping|screening/.test(type + desc)) {
    if (/scoping opinion|screening opinion/.test(desc)) return false;
    if (/non-material amendment/.test(desc)) return false;
    if (/lawful development/.test(type)) return false;
  }
  if (meta.eiaContext && /scoping opinion|screening opinion/.test(desc)) return false;
  const residential =
    /dwelling|residential|flat|home|c3|mixed[- ]use|apartment|hmo/.test(desc) ||
    /dwellings/i.test(app.development_type || "");
  if (!residential) return false;
  if (meta.units == null || meta.units < 1) return false;
  return true;
}

function emptyConstraints() {
  return {
    conservation: false,
    conservationName: null,
    listed: false,
    listedName: null,
    article4: false,
    article4Name: null,
    brownfield: false,
    brownfieldName: null,
    brownfieldHectares: null,
  };
}

function plainAsk(app, units) {
  const t = (app.description || "").replace(/\s+/g, " ").trim();
  if (/variation of (a )?condition|already have permission|increase the number of private|reduce the number of affordable/i.test(t)) {
    return `They already have permission. They want to change the deal (${units} homes on the books).`;
  }
  if (/demolition|knock|redevelopment of the site/i.test(t)) {
    return `Knock what's there and put up ${units} home${units === 1 ? "" : "s"}.`;
  }
  if (/conversion|change of use/i.test(t)) {
    return `Convert the building into ${units} home${units === 1 ? "" : "s"}.`;
  }
  return `Build ${units} home${units === 1 ? "" : "s"} here.`;
}

function plainImpact(app, units, affPct, place, completions) {
  const bits = [];
  if (affPct == null) {
    bits.push(`${units} home${units === 1 ? "" : "s"}. The public record does not state a social-housing figure.`);
  } else {
    bits.push(`${units} home${units === 1 ? "" : "s"}, ${Math.round(affPct * 100)}% affordable vs London Plan 35%.`);
    if (units >= 10 && affPct < 0.35) bits.push("This is a major under the usual 35%.");
  }
  if (place?.schoolHalo && place.schoolName) bits.push(`${place.schoolName} is within 400 m (not a legal catchment).`);
  if (place?.hospitalSweet && place.hospitalName) bits.push(`${place.hospitalName} is in the 400–1,200 m sweet spot.`);
  if (place?.hospitalTooClose && place.hospitalName) bits.push(`${place.hospitalName} is very close — ambulances and noise.`);
  if (place?.hospitalFar && place.hospitalName) bits.push(`${place.hospitalName} is a hike.`);
  if (place?.highCrime) bits.push(`Street-crime count in May 2026 is high (${place.crimeCount} within 400 m, locations approximate).`);
  if (completions) bits.push(`This borough's 2023–24 affordable pace was ${completions}.`);
  return bits.join(" ");
}

function plainWho(app, units, affPct, luxury) {
  if (luxury) return "Kit likes the pipeline. Amira and Jordan need the affordable slice to be real. Sam wants a school-run that works.";
  if (affPct == null) return "Amira, Jordan and Sam are watching the affordable slice. Neighbours are watching the massing.";
  if (units >= 10 && affPct < 0.35) return "Jordan wants the extra flats. Amira needs them to be affordable. Neighbours get a bigger building.";
  if (units < 10) return "Jordan wants any extra flat. People waiting for affordable homes get nothing from a scheme this small (it dodges the 35% rule).";
  return "Amira, Jordan and Sam are watching the affordable slice. Neighbours are watching the massing.";
}

async function pldSearch(body) {
  const res = await fetch(PLD, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "planning-desk/1.0 (open data snapshot; OGL)",
      "X-API-AllowRequest": "be2rmRnt&",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PLD ${res.status}: ${t.slice(0, 240)}`);
  }
  return res.json();
}

function pldQuery(lpaName) {
  return {
    bool: {
      must: [
        { match: { lpa_name: lpaName } },
        { exists: { field: "centroid" } },
        {
          bool: {
            should: [
              { match_phrase: { development_type: "Minor dwellings" } },
              { match_phrase: { development_type: "Major dwellings" } },
              { match_phrase: { description: "Use Class C3" } },
              { match_phrase: { description: "residential units" } },
              { match_phrase: { description: "residential development" } },
              { match: { description: "dwellings" } },
              { match: { description: "flats" } },
              { match: { description: "homes" } },
              { match: { description: "apartments" } },
              { match_phrase: { description: "mixed use" } },
              { match_phrase: { description: "mixed-use" } },
              { match: { description: "affordable" } },
            ],
            minimum_should_match: 1,
          },
        },
      ],
      must_not: [
        { match: { application_type: "Householder" } },
        { match_phrase: { development_type: "Other house holder developments" } },
      ],
    },
  };
}

function hitToApp(h, seen) {
  const src = h._source || {};
  const id = src.id || h._id;
  if (!id || seen.has(id)) return null;
  seen.add(id);
  const lat = toNum(src.centroid?.lat);
  const lon = toNum(src.centroid?.lon);
  if (lat == null || lon == null) return null;
  return {
    id,
    lpa_app_no: src.lpa_app_no,
    ward: (src.ward || "").replace(/\s*\(Pre May 2022\)\s*/i, "").trim() || src.ward,
    description: src.description,
    application_type_full: src.application_type_full,
    application_type: src.application_type,
    development_type: src.development_type,
    site_name: src.site_name,
    postcode: src.postcode,
    url_planning_app: src.url_planning_app,
    valid_date: src.valid_date,
    centroid: { lat, lon },
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

async function fetchApps(lpaName) {
  const seen = new Set();
  const apps = [];
  let total = 0;
  const query = pldQuery(lpaName);
  const majorQuery = {
    bool: {
      must: [
        { match: { lpa_name: lpaName } },
        { exists: { field: "centroid" } },
        { match_phrase: { development_type: "Major dwellings" } },
      ],
      must_not: [
        { match: { application_type: "Householder" } },
      ],
    },
  };
  for (const [q, size] of [[query, 100], [majorQuery, 50]]) {
    const page = await pldSearch({
      size,
      from: 0,
      track_total_hits: true,
      query: q,
      sort: [{ valid_date: { order: "desc", unmapped_type: "date" } }],
      _source: SOURCE_FIELDS,
    });
    total = Math.max(total, page.hits?.total?.value ?? 0);
    for (const h of page.hits?.hits ?? []) {
      const app = hitToApp(h, seen);
      if (app) apps.push(app);
    }
    await sleep(180);
  }
  return { total, apps };
}

function pickEight(playable) {
  const sorted = [...playable].sort((a, b) => (b.game.units || 0) - (a.game.units || 0));
  const byWard = new Map();
  for (const a of sorted) {
    const w = a.ward || "_";
    if (!byWard.has(w)) byWard.set(w, []);
    byWard.get(w).push(a);
  }
  const deck = [];
  const used = new Set();
  for (const list of byWard.values()) {
    if (deck.length >= 8) break;
    deck.push(list[0]);
    used.add(list[0].id);
  }
  for (const a of sorted) {
    if (deck.length >= 8) break;
    if (used.has(a.id)) continue;
    deck.push(a);
    used.add(a.id);
  }
  return deck;
}

function nearestHospital(lat, lon, hospitals) {
  let best = null;
  for (const h of hospitals) {
    const m = haversineM(lat, lon, h.lat, h.lng);
    if (!best || m < best.m) best = { name: h.name, m: Math.round(m), lat: h.lat, lng: h.lng };
  }
  return best;
}

function hospBand(m) {
  if (m == null) return { hospitalBand: "unknown", hospitalSweet: false, hospitalTooClose: false, hospitalFar: false };
  if (m < 250) return { hospitalBand: "too-close", hospitalSweet: false, hospitalTooClose: true, hospitalFar: false };
  if (m >= 400 && m <= 1200) return { hospitalBand: "sweet", hospitalSweet: true, hospitalTooClose: false, hospitalFar: false };
  if (m > 2000) return { hospitalBand: "far", hospitalSweet: false, hospitalTooClose: false, hospitalFar: true };
  return { hospitalBand: "ok", hospitalSweet: false, hospitalTooClose: false, hospitalFar: false };
}

async function crimeAt(lat, lon) {
  const url = `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lon}&date=${CRIME_MONTH}`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "planning-desk/1.0" } });
  if (!res.ok) return { crimeCount: null, crimeLocs: null, crimeMonth: CRIME_MONTH, highCrime: false };
  const rows = await res.json();
  const locs = new Set();
  for (const r of rows) {
    const la = r.location?.latitude;
    const lo = r.location?.longitude;
    if (la && lo) locs.add(`${Number(la).toFixed(5)},${Number(lo).toFixed(5)}`);
  }
  const crimeCount = rows.length;
  const crimeLocs = locs.size;
  return { crimeCount, crimeLocs, crimeMonth: CRIME_MONTH, highCrime: crimeCount >= 60 };
}

async function schoolsNear(apps) {
  if (!apps.length) return [];
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const a of apps) {
    minLat = Math.min(minLat, a.centroid.lat);
    maxLat = Math.max(maxLat, a.centroid.lat);
    minLon = Math.min(minLon, a.centroid.lon);
    maxLon = Math.max(maxLon, a.centroid.lon);
  }
  const pad = 0.02;
  const bbox = `${minLat - pad},${minLon - pad},${maxLat + pad},${maxLon + pad}`;
  const q = `[out:json][timeout:25];(node["amenity"="school"](${bbox});way["amenity"="school"](${bbox}););out center 80;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": "planning-desk/1.0" },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) return [];
    const body = await res.json();
    const out = [];
    for (const el of body.elements || []) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      const name = el.tags?.name;
      if (lat == null || lon == null || !name) continue;
      out.push({ name, lat, lng: lon });
    }
    return out;
  } catch {
    return [];
  }
}

function nearestSchool(lat, lon, schools) {
  let best = null;
  for (const s of schools) {
    const m = haversineM(lat, lon, s.lat, s.lng);
    if (!best || m < best.m) best = { name: s.name, m: Math.round(m) };
  }
  return best;
}

async function fetchUkhpi(slug) {
  const tries = [slug];
  if (slug === "hammersmith-and-fulham") tries.push("hammersmith");
  if (slug === "kensington-and-chelsea") tries.push("kensington");
  if (slug.endsWith("-upon-thames")) tries.push(slug.replace("-upon-thames", ""));
  for (const s of tries) {
    const listUrl = `https://landregistry.data.gov.uk/data/ukhpi/region/${s}.json`;
    try {
      const listRes = await fetch(listUrl, { headers: { Accept: "application/json", "User-Agent": "planning-desk/1.0" } });
      if (!listRes.ok) continue;
      const list = await listRes.json();
      const items = list?.result?.items || [];
      const latestUri = String(items[0] || "");
      const month = latestUri.match(/month\/(\d{4}-\d{2})/)?.[1];
      if (!month) continue;
      const monthUrl = `http://landregistry.data.gov.uk/data/ukhpi/region/${s}/month/${month}.json`;
      const monthRes = await fetch(monthUrl, { headers: { Accept: "application/json", "User-Agent": "planning-desk/1.0" } });
      if (!monthRes.ok) continue;
      const body = await monthRes.json();
      const t = body?.result?.primaryTopic || {};
      return {
        month,
        averagePrice: t.averagePrice,
        averagePriceFlatMaisonette: t.averagePriceFlatMaisonette,
        percentageAnnualChange: t.percentageAnnualChange,
        percentageChange: t.percentageChange,
        housePriceIndex: t.housePriceIndex,
        source: monthUrl,
        licence: "OGL v3.0",
        note: `UK House Price Index, ${month}.`,
        slug: s,
      };
    } catch {
      continue;
    }
  }
  return null;
}

const boroughsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "boroughs.json"), "utf8"));
const piprDoc = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pipr-london.json"), "utf8"));
const affDoc = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "affordable-2023-24.json"), "utf8"));
const hospitalsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "hospitals-london.json"), "utf8"));
const thPack = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "packs", "tower-hamlets.json"), "utf8"));
const hospitals = hospitalsDoc.sites || [];
const thBase = thPack.baseline;

const only = process.argv.slice(2);
const targets = boroughsDoc.boroughs.filter((b) => {
  if (b.slug === "tower-hamlets") return false;
  if (only.length && !only.includes(b.slug) && !only.includes(b.name)) return false;
  return true;
});

const summary = [];
fs.mkdirSync(path.join(ROOT, "data", "packs"), { recursive: true });

for (const b of targets) {
  const row = { slug: b.slug, name: b.name, lad: b.lad, n: 0, bytes: 0, error: null };
  try {
    const piprRow = piprDoc.latestByLad[b.lad];
    const affRow = affDoc.byLad[b.lad];
    if (!piprRow?.oneBed || !piprRow?.threeBed) {
      row.error = "no PIPR";
      summary.push(row);
      console.log("skip", b.name, "no PIPR");
      continue;
    }
    if (affRow?.completions == null) {
      row.error = "no affordable completions";
      summary.push(row);
      console.log("skip", b.name, "no completions");
      continue;
    }
    console.log("PLD", b.name);
    const { total, apps } = await fetchApps(b.name);
    row.pldTotal = total;
    row.pldApps = apps.length;
    const playable = [];
    for (const app of apps) {
      const parsed = parseUnits(app.description);
      const aff = parseAffordable(app.description, parsed.units);
      const luxury = isLuxury(app, parsed.units);
      if (!isPlayable(app, parsed)) continue;
      app.game = {
        units: parsed.units,
        unitsSource: parsed.unitsSource,
        affordablePct: aff.affordablePct,
        affordableSource: aff.affordableSource,
        luxury,
        playable: true,
        constraints: emptyConstraints(),
      };
      playable.push(app);
    }
    const deck = pickEight(playable);
    row.playable = playable.length;
    row.n = deck.length;
    const schools = deck.length ? await schoolsNear(deck) : [];
    await sleep(200);
    for (const app of deck) {
      const hosp = nearestHospital(app.centroid.lat, app.centroid.lon, hospitals);
      const band = hospBand(hosp?.m);
      let crime = { crimeCount: null, crimeLocs: null, crimeMonth: CRIME_MONTH, highCrime: false };
      try {
        crime = await crimeAt(app.centroid.lat, app.centroid.lon);
      } catch (_) {}
      await sleep(120);
      const sch = nearestSchool(app.centroid.lat, app.centroid.lon, schools);
      const place = {
        schoolHalo: !!(sch && sch.m <= 400),
        schoolName: sch?.name || null,
        schoolM: sch?.m ?? null,
        hospitalName: hosp?.name || null,
        hospitalM: hosp?.m ?? null,
        ...band,
        ...crime,
      };
      app.game.place = place;
      app.game.plainAsk = plainAsk(app, app.game.units);
      app.game.plainImpact = plainImpact(app, app.game.units, app.game.affordablePct, place, affRow.completions);
      app.game.plainWho = plainWho(app, app.game.units, app.game.affordablePct, app.game.luxury);
      delete app.development_type;
      delete app.valid_date;
    }
    const ukhpi = await fetchUkhpi(b.slug);
    if (!ukhpi?.averagePrice) {
      row.error = "no UKHPI";
      summary.push(row);
      console.log("skip", b.name, "no UKHPI");
      continue;
    }
    const inner = INNER.has(b.name);
    const nearestHospitals = [];
    const seenH = new Set();
    for (const app of deck) {
      const n = app.game.place?.hospitalName;
      if (!n || seenH.has(n)) continue;
      seenH.add(n);
      const h = hospitals.find((x) => x.name === n);
      if (h) nearestHospitals.push({ name: h.name, lat: h.lat, lng: h.lng });
    }
    const pack = {
      slug: b.slug,
      name: b.name,
      lad: b.lad,
      snapshotDate: SNAPSHOT,
      note: deck.length < 8
        ? `${deck.length} playable residential applications in this PLD snapshot — not padded to 8.`
        : undefined,
      applications: deck,
      hospitals: nearestHospitals,
      schools: [],
      baseline: {
        snapshotDate: SNAPSHOT,
        borough: b.name,
        gss: b.lad,
        ukhpi,
        pipr: {
          month: piprRow.month,
          averageRent: piprRow.averageRent,
          annualChangePct: piprRow.annualChangePct != null ? Math.round(piprRow.annualChangePct * 100) / 100 : null,
          monthlyChangePct: piprRow.monthlyChangePct != null ? Math.round(piprRow.monthlyChangePct * 100) / 100 : null,
          oneBed: piprRow.oneBed,
          twoBed: piprRow.twoBed,
          threeBed: piprRow.threeBed,
          fourPlus: piprRow.fourPlus,
          flatMaisonette: piprRow.flatMaisonette,
          sourceWorkbook: "ONS Price Index of Private Rents UK monthly price statistics, 19 August 2026",
          bulletin: piprDoc.bulletin,
          localPage: `https://www.ons.gov.uk/visualisations/housingpriceslocal/${b.lad}/`,
          licence: "OGL v3.0",
        },
        affordableHousingSupply: {
          year: affRow.year,
          completions: affRow.completions,
          code: b.lad,
          source: affDoc.source,
          licence: "OGL v3.0",
          note: "Win condition uses this completions pace, not the London Plan 35% policy target.",
        },
        nursePay: {
          ...thBase.nursePay,
          area: inner ? "Inner London" : "Outer London",
          note: inner
            ? thBase.nursePay.hcas
            : "Outer London HCAS is lower than Inner. Take-home still uses the Inner Band 5 entry figure until we re-derive Outer 2026/27 — not an invented Outer salary.",
        },
        takeHomeAssumptions: thBase.takeHomeAssumptions,
        residents: thBase.residents,
        thresholds: thBase.thresholds,
        londonPlanAffordableTargetPct: 0.35,
        win: {
          affordableCompletions: affRow.completions,
          quarters: 8,
          loseSupport: 0,
          losePricedOutResidents: 2,
        },
      },
      stakes: {
        snapshotDate: SNAPSHOT,
        snapshotNote: "Official snapshot, not live. TA not in this pack unless extracted per borough — do not use Tower Hamlets 3,096 here.",
        borough: b.name,
        gss: b.lad,
      },
      crimeNote: "Street-crime counts are precomputed per application from data.police.uk May 2026. No point cloud shipped.",
    };
    if (!pack.note) delete pack.note;
    const out = path.join(ROOT, "data", "packs", `${b.slug}.json`);
    const json = JSON.stringify(pack);
    fs.writeFileSync(out, json);
    row.bytes = json.length;
    console.log("wrote", b.slug, "n=", deck.length, "bytes", row.bytes);
    await sleep(250);
  } catch (err) {
    row.error = String(err?.message || err);
    console.error("fail", b.name, row.error);
    await sleep(800);
  }
  summary.push(row);
}

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "boroughs.json"), "utf8"));
const playableSlugs = new Set(
  fs.readdirSync(path.join(ROOT, "data", "packs"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
);
for (const b of index.boroughs) {
  const packPath = path.join(ROOT, "data", "packs", `${b.slug}.json`);
  if (!fs.existsSync(packPath)) {
    b.playable = false;
    continue;
  }
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  b.playable = Array.isArray(pack.applications) && pack.applications.length > 0;
}
index.note = "Greater London local authorities (ONS LAD). playable means a slim 8-stamp pack exists at data/packs/{slug}.json and is loaded on borough switch. City of London has no ONS PIPR row so it stays camera-only. Packs are snapshots, not live.";
fs.writeFileSync(path.join(ROOT, "data", "boroughs.json"), JSON.stringify(index, null, 2));
fs.writeFileSync(path.join(ROOT, "data", "pack-build-summary.json"), JSON.stringify({ snapshotDate: SNAPSHOT, summary }, null, 2));
console.log("done", summary.map((s) => `${s.slug}:${s.n}${s.error ? "!" + s.error : ""}`).join(" "));
