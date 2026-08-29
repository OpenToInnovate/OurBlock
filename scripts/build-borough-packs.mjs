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
