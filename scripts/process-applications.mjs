#!/usr/bin/env node
/**
 * Tag PLD applications with constraint flags, unit estimates, and a playable deck.
 */
import fs from "node:fs";

const appsPath = "data/tower-hamlets-applications.json";
const consPath = "data/tower-hamlets-constraints.geojson";

const appsDoc = JSON.parse(fs.readFileSync(appsPath, "utf8"));
const cons = JSON.parse(fs.readFileSync(consPath, "utf8"));

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const denom = yj - yi || 1e-15;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x, y, geom) {
  if (!geom) return false;
  const type = geom.type;
  const coords = geom.coordinates;
  if (type === "Polygon") {
    if (!pointInRing(x, y, coords[0] || [])) return false;
    for (let h = 1; h < coords.length; h++) {
      if (pointInRing(x, y, coords[h])) return false;
    }
    return true;
  }
  if (type === "MultiPolygon") {
    return coords.some((poly) => {
      if (!pointInRing(x, y, poly[0] || [])) return false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(x, y, poly[h])) return false;
      }
      return true;
    });
  }
  return false;
}

function haversineM(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function centroidOf(geom) {
  if (!geom) return null;
  if (geom.type === "Point") return { lon: geom.coordinates[0], lat: geom.coordinates[1] };
  let ring = null;
  if (geom.type === "Polygon") ring = geom.coordinates[0];
  if (geom.type === "MultiPolygon") ring = geom.coordinates[0]?.[0];
  if (!ring || !ring.length) return null;
  let sx = 0, sy = 0, n = 0;
  for (const p of ring) {
    sx += p[0];
    sy += p[1];
    n++;
  }
  return { lon: sx / n, lat: sy / n };
}

const layers = {
  "conservation-area": [],
  "listed-building": [],
  "article-4-direction-area": [],
  "brownfield-land": [],
};
for (const f of cons.features) {
  const layer = f.properties?.layer || f.properties?.dataset;
  if (layers[layer]) layers[layer].push(f);
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
    const s = parseInt(storeys[1], 10);
    if (s >= 4) {
      return { units: Math.min(400, Math.round(s * 6)), unitsSource: "storey-estimate", eiaContext: skip };
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
  const luxuryWords = /luxury|penthouse|private homes|canary wharf|riverside|tower|build to rent/;
  if (luxuryWords.test(t) && (units || 0) >= 20) return true;
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
  if (!/full planning|outline|reserved matters|variation of a condition/.test(type) && type !== "") {
    // still allow Minor dwellings with a description
  }
  const residential =
    /dwelling|residential|flat|home|c3|mixed[- ]use|apartment|hmo/.test(desc) ||
    /dwellings/i.test(app.development_type || "");
  if (!residential) return false;
  if (meta.units == null) return false;
  if (meta.units < 1) return false;
  return true;
}

function tagConstraints(lon, lat) {
  const out = {
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
  for (const f of layers["conservation-area"]) {
    if (pointInPolygon(lon, lat, f.geometry)) {
      out.conservation = true;
      out.conservationName = f.properties?.name || f.properties?.reference || "Conservation area";
      break;
    }
  }
  for (const f of layers["article-4-direction-area"]) {
    if (pointInPolygon(lon, lat, f.geometry)) {
      out.article4 = true;
      out.article4Name = f.properties?.name || f.properties?.reference || "Article 4";
      break;
    }
  }
  let bestL = Infinity;
  for (const f of layers["listed-building"]) {
    const c = f.geometry?.type === "Point"
      ? { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }
      : centroidOf(f.geometry);
    if (!c) continue;
    const d = haversineM(lon, lat, c.lon, c.lat);
    if (d < 60 && d < bestL) {
      bestL = d;
      out.listed = true;
      out.listedName = f.properties?.name || "Listed building";
    }
  }
  let bestB = Infinity;
  for (const f of layers["brownfield-land"]) {
    const c = f.geometry?.type === "Point"
      ? { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }
      : centroidOf(f.geometry);
    if (!c) continue;
    const d = haversineM(lon, lat, c.lon, c.lat);
    if (d < 180 && d < bestB) {
      bestB = d;
      out.brownfield = true;
      out.brownfieldName = f.properties?.["site-address"] || f.properties?.name || "Brownfield site";
      out.brownfieldHectares = f.properties?.hectares != null ? Number(f.properties.hectares) : null;
    }
  }
  return out;
}

let nPlayable = 0;
const playable = [];
for (const app of appsDoc.applications) {
  const lon = app.centroid?.lon ?? app.geometry?.coordinates?.[0];
  const lat = app.centroid?.lat ?? app.geometry?.coordinates?.[1];
  const parsed = parseUnits(app.description);
  const aff = parseAffordable(app.description, parsed.units);
  const constraints = lon != null && lat != null ? tagConstraints(lon, lat) : {};
  const luxury = isLuxury(app, parsed.units);
  const playableFlag = isPlayable(app, parsed);
  app.game = {
    units: parsed.units,
    unitsSource: parsed.unitsSource,
    affordablePct: aff.affordablePct,
    affordableSource: aff.affordableSource,
    luxury,
    playable: playableFlag,
    constraints,
  };
  if (playableFlag) {
    nPlayable++;
    playable.push(app);
  }
}

playable.sort((a, b) => (b.game.units || 0) - (a.game.units || 0));
console.log("playable", nPlayable, "of", appsDoc.applications.length);
console.log("constraint hits among all:");
const hits = { conservation: 0, listed: 0, article4: 0, brownfield: 0 };
for (const a of appsDoc.applications) {
  const c = a.game?.constraints || {};
  for (const k of Object.keys(hits)) if (c[k]) hits[k]++;
}
console.log(hits);
console.log("top playable:");
for (const a of playable.slice(0, 18)) {
  const c = a.game.constraints;
  const flags = [
    c.conservation ? "CA" : "",
    c.listed ? "LB" : "",
    c.article4 ? "A4" : "",
    c.brownfield ? "BF" : "",
    a.game.luxury ? "LUX" : "",
  ].filter(Boolean).join(",");
  console.log(
    a.game.units,
    a.game.affordablePct == null ? "n/s" : Math.round(a.game.affordablePct * 100) + "%",
    a.valid_date,
    a.ward,
    a.lpa_app_no,
    flags,
    (a.description || "").replace(/\n/g, " ").slice(0, 90)
  );
}

appsDoc.processedDate = "2026-08-28";
appsDoc.playableCount = nPlayable;
fs.writeFileSync(appsPath, JSON.stringify(appsDoc, null, 2));
console.log("updated", appsPath);
