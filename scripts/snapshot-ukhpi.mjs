#!/usr/bin/env node
/**
 * UKHPI latest month for Tower Hamlets.
 * List endpoint: https://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets.json
 * Month: http://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets/month/YYYY-MM.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const listRes = await fetch("https://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets.json", {
  headers: { Accept: "application/json", "User-Agent": "planning-desk/1.0" },
});
if (!listRes.ok) throw new Error("UKHPI list " + listRes.status);
const list = await listRes.json();
const items = list?.result?.items || [];
const latestUri = items[0];
const month = String(latestUri).match(/month\/(\d{4}-\d{2})/)?.[1];
if (!month) throw new Error("no month in " + latestUri);
const monthUrl = `http://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets/month/${month}.json`;
const monthRes = await fetch(monthUrl, {
  headers: { Accept: "application/json", "User-Agent": "planning-desk/1.0" },
});
if (!monthRes.ok) throw new Error("UKHPI month " + monthRes.status);
const body = await monthRes.json();
const out = path.join(ROOT, "data", `ukhpi-tower-hamlets-${month}.json`);
fs.writeFileSync(out, JSON.stringify(body, null, 2));
fs.writeFileSync(path.join(ROOT, "data", "ukhpi-tower-hamlets.json"), JSON.stringify(body, null, 2));
console.log("wrote", out, "averagePrice", body?.result?.primaryTopic?.averagePrice);
