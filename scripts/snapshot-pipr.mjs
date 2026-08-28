#!/usr/bin/env node
/**
 * ONS PIPR workbook has no CORS. Download the xlsx then extract Tower Hamlets.
 * Extraction uses Python + openpyxl when available; otherwise keep pipr-tower-hamlets.json.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const url =
  "https://www.ons.gov.uk/file?uri=/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/19august2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx";
const xlsxPath = path.join(ROOT, "data", "pipr-source.xlsx");
console.log("GET", url);
const res = await fetch(url, { headers: { "User-Agent": "planning-desk/1.0" } });
if (!res.ok) throw new Error("PIPR download " + res.status);
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(xlsxPath, buf);
console.log("wrote", xlsxPath, "bytes", buf.length);
console.log("Extract Tower Hamlets with: python3 scripts/extract-pipr.py (needs openpyxl)");
const py = path.join(ROOT, "scripts", "extract-pipr.py");
if (fs.existsSync(py)) {
  const r = spawnSync("python3", [py], { stdio: "inherit" });
  if (r.status !== 0) console.warn("extract-pipr.py exited", r.status);
}
