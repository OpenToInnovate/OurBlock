# Planning Desk

A playable civic game. You sit on the London Borough of Tower Hamlets planning committee. Each turn is one quarter. A real planning application lands on a real borough map. Approve, refuse, or negotiate for more affordable housing.

**Live:** [https://supple-island-3ck2.here.now/](https://supple-island-3ck2.here.now/) — London planning committee game. No Google Drive; all data is local JSON in `data/`.

Eight quarters. Win if you match the borough’s **2023–24 affordable completions pace (432 homes)** without pricing residents out and without public support collapsing. Lose if support hits 0, or if two of Amira, Jordan and Sam are priced out (Kit is a fourth face, not in that set).

This is not SimCity, not an official LBTH or GLA product, and not a planning-policy simulator of record. Baselines are snapshotted public statistics (28 August 2026). See [DATA.md](DATA.md).

## Run

Vanilla HTML + CSS + ES modules. No bundler.

```bash
cd planning-desk
python3 -m http.server 8080
```

Open http://localhost:8080/

`file://` will fail: the browser cannot load `./data/*.json` as modules/fetch without HTTP.

## Play

| Key | Decision |
| --- | --- |
| **A** | Approve as submitted |
| **R** | Refuse |
| **N** | Negotiate — opens the s106 table (15s). Shake on 35%, 50%, or a smaller building. Timeout / Walks = 0 homes. |

Conservation areas, listed buildings and Article 4 directions make schemes harder. Brownfield is easier. Luxury and under-35% majors push rents and strain the renters:

1. **Amira** — Band 5 Inner London nurse, houseshare (existing pay math).
2. **Jordan** — private renter, 1-bed sitting tenancy against PIPR.
3. **Sam & kid** — family of four, 3-bed sitting tenancy, two Band 5 Inner salaries.
4. **Kit** — Canary Wharf worker. No salary. Tracks 2-bed PIPR × HPI; mood goes up when luxury / 0% affordable is approved and flat when you negotiate, refuse luxury, or hit 432.

Faces are illustrated characters (`assets/faces/`), not photos. Case copy prefers `app.game.plainAsk` when present (a 13-year-old translation of the legal description).

London Plan **35% affordable** is shown as policy. The **win line is 432 affordable completions**, from DLUHC/GLA 2023–24 supply.

## Stack

- `index.html` + `css/desk.css` + `src/*.js` ES modules
- Map: MapLibre GL JS (CDN) + OpenFreeMap OSM vector tiles with 3D fill-extrusion and Esri World Imagery underlay; SVG fallback (2D/3D toggle). Drag to look, scroll to zoom, right-drag to orbit. A/R/N stay decisions.
- Data snapshots in `data/`
- Refresh scripts in `scripts/` (`snapshot-*.mjs`)

No React, Vue, Svelte, or Godot. No Google Maps API key.

## Licence and credits

Code in this repository is offered for reuse. **Data remains under the Open Government Licence v3.0** (and Ordnance Survey where the borough boundaries derive from ONS/OS).

- Borough boundaries: Office for National Statistics, LAD May 2025, via ArcGIS FeatureServer, contains OS data © Crown copyright and database right
- Constraints: MHCLG [planning.data.gov.uk](https://www.planning.data.gov.uk/) OGL v3, Tower Hamlets LPA entity 626199
- Applications: GLA Planning London DataStore guest Elasticsearch
- Prices: UK House Price Index (HM Land Registry / ONS / ROS / LPS)
- Rents: ONS Price Index of Private Rents
- Affordable supply and 2018 tenure: Greater London Authority Datastore (DataPress, not CKAN)
- Nurse pay: NHS Employers Agenda for Change 2026/27 Inner London HCAS

Full URLs, dates and counts: [DATA.md](DATA.md).
