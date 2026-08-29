# Our Block

Walk London. Stack social homes. Luxury is the trap.

A civic stacking game on a real London map. Pins are real planning applications. Walk the city, hear a short brief, then stack storeys: brick is homes for the list, glass is the trap.

Vanilla HTML + CSS + ES modules. No bundler. All data is local JSON in `data/`. This is not SimCity, not an official LBTH or GLA product, and not a planning-policy simulator of record. Baselines are snapshotted public statistics (28 August 2026). See [DATA.md](DATA.md).

## Run

Vanilla HTML + CSS + ES modules. No bundler.

```bash
cd planning-desk
python3 -m http.server 8080
```

Open http://localhost:8080/

`file://` will fail: the browser cannot load `./data/*.json` as modules/fetch without HTTP.

## Play

1. **Walk London** on the landing screen.
2. Tap a pin. Green is closer to social / 35% affordable; darker gold is luxury.
3. Read Amira's brief, then **STACK**.
4. Tap or press Space to drop a storey. Land brick (social homes). Glass scores zero. Three misses and the stack falls.

Optional query flags for screenshots: `?scene=walk|talk|stack`, `?kind=luxury|social|mixed`, `?app=<id>`, `?seed=<floors>`, `?play=1`.

## Stack

- `index.html` + `css/council.css` + `css/desk.css` + `src/*.js` ES modules
- Boot: `src/main.js` -> `src/council.js` (landing, walk, talk, stacker)
- Map: MapLibre GL JS (CDN) + OpenFreeMap OSM vector tiles with 3D fill-extrusion; SVG fallback. Drag to look, scroll to zoom, right-drag to orbit.
- Data snapshots in `data/`
- Refresh scripts in `scripts/` (`snapshot-*.mjs`)

No React, Vue, Svelte, or Godot. No Google Maps API key.

## Licence and credits

Code in this repository is offered for reuse. **Data remains under the Open Government Licence v3.0** (and Ordnance Survey where the borough boundaries derive from ONS/OS).

- Borough boundaries: Office for National Statistics, LAD May 2025, via ArcGIS FeatureServer, contains OS data (c) Crown copyright and database right
- Constraints: MHCLG [planning.data.gov.uk](https://www.planning.data.gov.uk/) OGL v3, Tower Hamlets LPA entity 626199
- Applications: GLA Planning London DataStore guest Elasticsearch
- Prices: UK House Price Index (HM Land Registry / ONS / ROS / LPS)
- Rents: ONS Price Index of Private Rents
- Affordable supply and 2018 tenure: Greater London Authority Datastore (DataPress, not CKAN)
- Nurse pay: NHS Employers Agenda for Change 2026/27 Inner London HCAS

Full URLs, dates and counts: [DATA.md](DATA.md).
