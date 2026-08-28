import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("data/tower-hamlets-applications.json", "utf8"));
const apps = d.applications;
console.log("count", d.count, apps.length);
const dev = {};
const full = {};
for (const a of apps) {
  const dt = a.development_type || "none";
  const af = a.application_type_full || "none";
  dev[dt] = (dev[dt] || 0) + 1;
  full[af] = (full[af] || 0) + 1;
}
console.log("DEV", Object.entries(dev).sort((a, b) => b[1] - a[1]).slice(0, 12));
console.log("FULL", Object.entries(full).sort((a, b) => b[1] - a[1]).slice(0, 8));
const re = /(\d+)\s*(?:residential\s+)?(?:units|dwellings|homes|flats|apartments)/i;
let n = 0;
const big = [];
for (const a of apps) {
  const m = (a.description || "").match(re);
  if (m) {
    n++;
    const u = +m[1];
    if (u >= 20) {
      big.push([u, a.valid_date, a.ward, a.lpa_app_no, (a.description || "").replace(/\n/g, " ").slice(0, 140)]);
    }
  }
}
console.log("with units", n, "big", big.length);
big.sort((a, b) => b[0] - a[0]);
for (const row of big.slice(0, 24)) console.log(JSON.stringify(row));
