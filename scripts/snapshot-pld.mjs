#!/usr/bin/env node
/**
 * Snapshot GLA Planning London DataStore (PLD) guest Elasticsearch.
 * CORS: browsers cannot call this endpoint; this script is the refresh path.
 *
 * POST https://planningdata.london.gov.uk/api-guest/applications/_search
 * Optional header X-API-AllowRequest: be2rmRnt&
 * Match on lpa_name (text), not lpa_name.keyword.
 */
const FS = await import("node:fs");
const PATH = await import("node:path");

const ENDPOINT = "https://planningdata.london.gov.uk/api-guest/applications/_search";
const OUT = PATH.join(PATH.dirname(new URL(import.meta.url).pathname), "..", "data", "tower-hamlets-applications.json");
const SOURCE_FIELDS = [
  "id", "lpa_name", "lpa_app_no", "borough", "ward", "description",
  "application_type", "application_type_full", "development_type",
  "status", "decision", "decision_date", "valid_date",
  "centroid", "wgs84_polygon", "url_planning_app", "uprn", "postcode",
  "site_name", "street_name",
];

function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

async function search(body) {
  const res = await fetch(ENDPOINT, {
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
    throw new Error(`PLD ${res.status}: ${t.slice(0, 400)}`);
  }
  return res.json();
}

const query = {
  bool: {
    must: [
      { match: { lpa_name: "Tower Hamlets" } },
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

const PAGE = 100;
const TARGET = 360;
const apps = [];
const seen = new Set();

const first = await search({
  size: 0,
  track_total_hits: true,
  query,
});
const total = first.hits?.total?.value ?? 0;
console.log("PLD TH residential-ish total", total);

for (let from = 0; from < TARGET && from < Math.max(total, TARGET); from += PAGE) {
  const page = await search({
    size: PAGE,
    from,
    track_total_hits: true,
    query,
    sort: [{ valid_date: { order: "desc", unmapped_type: "date" } }],
    _source: SOURCE_FIELDS,
  });
  const hits = page.hits?.hits ?? [];
  if (!hits.length) break;
  for (const h of hits) {
    const s = h._source || {};
    const id = s.id || h._id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const lat = toNum(s.centroid?.lat);
    const lon = toNum(s.centroid?.lon);
    if (lat == null || lon == null) continue;
    apps.push({
      id,
      lpa_name: s.lpa_name,
      lpa_app_no: s.lpa_app_no,
      borough: s.borough,
      ward: s.ward,
      description: s.description,
      application_type: s.application_type,
      application_type_full: s.application_type_full,
      development_type: s.development_type,
      status: s.status,
      decision: s.decision,
      decision_date: s.decision_date,
      valid_date: s.valid_date,
      centroid: { lat, lon },
      geometry: { type: "Point", coordinates: [lon, lat] },
      wgs84_polygon: s.wgs84_polygon ?? null,
      url_planning_app: s.url_planning_app,
      uprn: s.uprn,
      postcode: s.postcode,
      site_name: s.site_name,
      street_name: s.street_name,
    });
  }
  console.log("page from", from, "collected", apps.length);
  if (hits.length < PAGE) break;
}

const payload = {
  snapshotDate: "2026-08-28",
  source: ENDPOINT,
  queryNote: "lpa_name match Tower Hamlets; residential/major-ish descriptions; centroid required; householder excluded",
  totalHitsReported: total,
  count: apps.length,
  applications: apps,
};

FS.mkdirSync(PATH.dirname(OUT), { recursive: true });
FS.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log("wrote", OUT, "n=", apps.length);
