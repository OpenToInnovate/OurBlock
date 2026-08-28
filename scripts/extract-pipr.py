#!/usr/bin/env python3
"""Extract Tower Hamlets (E09000030) rows from the ONS PIPR monthly workbook."""
import datetime, json, os, sys
try:
    import openpyxl
except ImportError:
    sys.stderr.write("openpyxl required: python3 -m venv .venv && .venv/bin/pip install openpyxl\n")
    sys.exit(1)

root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src = os.path.join(root, "data", "pipr-source.xlsx")
if not os.path.exists(src):
    src = "/tmp/pipr.xlsx"
wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
ws = wb["Table 1"]
rows = []
headers = None
for i, row in enumerate(ws.iter_rows(min_row=3, max_col=40, values_only=True), 3):
    if i == 3:
        headers = list(row)
        continue
    if row[1] != "E09000030":
        continue
    d = dict(zip(headers, row))
    period = d["Time period"]
    if isinstance(period, datetime.datetime):
        period = period.strftime("%Y-%m")
    def num(v):
        return None if isinstance(v, str) or v is None else v
    rows.append({
        "month": period,
        "areaCode": d["Area code"],
        "areaName": d["Area name"],
        "index": num(d["Index"]),
        "monthlyChangePct": num(d["Monthly change"]),
        "annualChangePct": num(d["Annual change"]),
        "averageRent": num(d["Rental price"]),
        "oneBed": num(d["Rental price one bed"]),
        "twoBed": num(d["Rental price two bed"]),
        "threeBed": num(d["Rental price three bed"]),
        "fourPlus": num(d["Rental price four or more bed"]),
        "flatMaisonette": num(d["Rental price flat maisonette"]),
        "terraced": num(d["Rental price terraced"]),
        "semiDetached": num(d["Rental price semidetached"]),
        "detached": num(d["Rental price detached"]),
    })
wb.close()
payload = {
    "snapshotDate": "2026-08-28",
    "sourceFile": os.path.basename(src),
    "sourceUrl": "https://www.ons.gov.uk/file?uri=/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/19august2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx",
    "bulletin": "https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/august2026",
    "localPage": "https://www.ons.gov.uk/visualisations/housingpriceslocal/E09000030/",
    "licence": "Open Government Licence v3.0",
    "count": len(rows),
    "latest": rows[-1] if rows else None,
    "series": rows,
}
out = os.path.join(root, "data", "pipr-tower-hamlets.json")
with open(out, "w") as f:
    json.dump(payload, f, indent=2)
print("wrote", out, "n", len(rows), "latest", rows[-1]["month"] if rows else None)
