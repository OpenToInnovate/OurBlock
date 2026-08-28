#!/usr/bin/env node
/**
 * Snapshot MHCLG planning.data.gov.uk entity.geojson for Tower Hamlets LPA entity 626199.
 * Paginate listed-building (~916). Skip tree-preservation-zone and planning-application.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "data", "tower-hamlets-constraints.geojson");
const BASE = "https://www.planning.data.gov.uk/entity.geojson";
const LPA = 626199;

const LAYERS = [
  { dataset: "conservation-area", relation: "intersects", expected: 76 },
  { dataset: "listed-building", relation: "intersects", expected: 916 },
  { dataset: "article-4-direction-area", relation: "intersects", expected: 69 },
  { dataset: "brownfield-land", relation: "within", expected: 27 },
];

async function fetchPage(dataset, relation, offset) {
  const url = `${BASE}?dataset=${dataset}&geometry_entity=${LPA}&geometry_relation=${relation}&limit=100&offset=${offset}`;
  const res = await fetch(url, { headers: { "User-Agent": "planning-desk/1.0 (OGL snapshot)" } });
  if (!res.ok) throw new Error(`${dataset} ${res.status}`);
  return res.json();
}

async function fetchAll(dataset, relation) {
  const features = [];
  const seen = new Set();
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await fetchPage(dataset, relation, offset);
    const feats = page.features || [];
    if (!feats.length) break;
    for (const f of feats) {
      const id = f.properties?.entity;
      if (id != null && seen.has(id)) continue;
      if (id != null) seen.add(id);
      features.push(f);
    }
    console.log(dataset, "offset", offset, "got", feats.length, "unique", features.length);
    if (feats.length < 100) break;
  }
  return features;
}

const all = [];
const counts = {};
for (const layer of LAYERS) {
  const feats = await fetchAll(layer.dataset, layer.relation);
  counts[layer.dataset] = feats.length;
  for (const f of feats) {
    f.properties = {
      ...f.properties,
      layer: layer.dataset,
    };
    all.push(f);
  }
}

const fc = {
  type: "FeatureCollection",
  snapshotDate: "2026-08-28",
  source: "https://www.planning.data.gov.uk/entity.geojson",
  lpaEntity: 626199,
  lpaName: "London Borough of Tower Hamlets",
  counts,
  features: all,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(fc));
console.log("wrote", OUT, "features", all.length, counts);
