# Data provenance

Snapshot date: **28 August 2026**. Re-fetched; numbers below are what the endpoints returned, not invented APIs.

Datastore is **DataPress**, not CKAN. There is **no GLA API Gateway** in this project. VOA private rents stop in 2019; this game uses **ONS PIPR**. Datastore borough house prices stop in 2017; this game uses **UK HPI**.

## CORS

Browser **can** fetch: planning.data.gov.uk entity.geojson, UKHPI JSON, ONS ArcGIS GeoJSON, Datastore `/download` CSVs.

Browser **cannot** fetch: GLA PLD Elasticsearch, ONS PIPR `.xlsx`. Those are snapshotted into `data/` and refreshed with `scripts/snapshot-*.mjs`.

## 1. `london-boroughs.geojson`

- GET `https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD_MAY_2025_UK_BUC/FeatureServer/0/query?where=LAD25CD%20LIKE%20'E09%'&outFields=LAD25CD,LAD25NM&returnGeometry=true&outSR=4326&f=geojson`
- **33** features (London boroughs + City of London). Fields `LAD25CD`, `LAD25NM`.
- Tower Hamlets highlighted: **E09000030**.
- Credit: Office for National Statistics and Ordnance Survey. Open Government Licence. Contains OS data © Crown copyright and database right.

## 2. `tower-hamlets-constraints.geojson`

MHCLG [planning.data.gov.uk](https://www.planning.data.gov.uk/) entity.geojson, OGL v3. Tower Hamlets LPA entity **626199**.

Paginated `limit=100`. Counts on 28 Aug 2026:

| dataset | geometry_relation | features |
| --- | --- | ---: |
| conservation-area | intersects | **76** |
| listed-building | intersects | **916** (paged) |
| article-4-direction-area | intersects | **69** (not `article-4-direction`) |
| brownfield-land | within | **27** (hectares, planning-permission-status, site-address) |

Skipped: `tree-preservation-zone`. Skipped: `planning-application` on this API for TH (known empty).

Example: `https://www.planning.data.gov.uk/entity.geojson?dataset=conservation-area&geometry_entity=626199&geometry_relation=intersects&limit=100`

Refresh: `node scripts/snapshot-constraints.mjs`

Applications are tagged in `scripts/process-applications.mjs` (point-in-polygon for conservation / Article 4; 60 m listed; 180 m brownfield).

## 3. `tower-hamlets-applications.json`

GLA Planning London DataStore guest Elasticsearch.

- POST `https://planningdata.london.gov.uk/api-guest/applications/_search`
- Optional header `X-API-AllowRequest: be2rmRnt&`
- Match on **`lpa_name`** (text), not `lpa_name.keyword`
- Tower Hamlets total hits reported: **28,648**
- Snapshot: **400** recent residential/major-ish applications with centroids (query also matched 4,820 residential-ish hits)
- `centroid.lat` / `lon` converted to numbers and GeoJSON points
- `_source` kept: id, lpa_name, lpa_app_no, borough, ward, description, application_type, development_type, status, decision, decision_date, valid_date, centroid, wgs84_polygon, url_planning_app, uprn, postcode (plus application_type_full, site_name, street_name)
- Derived `game` block: parsed units, affordable %, luxury flag, constraint flags, playable flag (**49** playable after filtering EIA/NMA/lawful-dev)
- Plain-English `game.plainAsk` / `plainImpact` / `plainWho` (also `data/briefs.json`) are a reading of the public description plus game stats for the case card, not a new official document.

Refresh: `node scripts/snapshot-pld.mjs` then `node scripts/process-applications.mjs`

The eight-quarter desk prefers a fixed set of real refs (small infill → heritage → Canary Wharf 1,358-home variation).

## 4. `affordability-baseline.json`

Compiled from the sources below. Game reads this file.

### UKHPI — Tower Hamlets, June 2026 (latest month on 28 Aug 2026)

Source: `http://landregistry.data.gov.uk/data/ukhpi/region/tower-hamlets/month/2026-06.json` (list index `…/region/tower-hamlets.json` first item `2026-06`).

| field | value |
| --- | ---: |
| averagePrice | **456,898** |
| averagePriceFlatMaisonette | **439,424** |
| percentageAnnualChange | **−13.1** |
| percentageChange (month) | 1.5 |
| housePriceIndex | 88.3 |

ONS local page (19 Aug 2026) rounds the same month to **\u00a3457,000**, down 13.1% from June 2025. Files: `ukhpi-tower-hamlets.json`, `ukhpi-tower-hamlets-2026-06.json`.

April 2026 was cited in the brief (\u00a3456,210 / −12.8%); **June 2026 is what the API returned as latest**.

Refresh: `node scripts/snapshot-ukhpi.mjs`

### Affordable housing supply

CSV: `https://data.london.gov.uk/download/e64g0/9d975263-dc3a-45c9-9236-dcc15d9e55d2/dclg-affordable-housing-borough.csv`

`Code,Area,Year,Affordable Housing Supply` — Tower Hamlets **2023-24 = 432**.

That **432** is the win pace. London Plan 35% is a policy target shown on the case file only.

File kept: `dclg-affordable-housing-borough.csv`.

### Tenure (labelled 2018)

CSV: `https://data.london.gov.uk/download/23gn1/f125e620-cc51-4fa1-bfb4-e15d3dd1c13c/tenure-households-borough.csv`

Series ends **2018**. Tower Hamlets 2018:

| tenure | % of households |
| --- | ---: |
| Rented from private landlord | **36.2** |
| Rented from LA or HA (social) | **31.8** |
| Buying with mortgage | 18.2 |
| Own outright | 13.7 |
| Households | 121,200 |

### PIPR rents — Tower Hamlets, July 2026

Workbook (no CORS): `https://www.ons.gov.uk/file?uri=/economy/inflationandpriceindices/datasets/priceindexofprivaterentsukmonthlypricestatistics/19august2026/priceindexofprivaterentsukmonthlypricestatistics.xlsx`

Extracted **139** monthly rows for `E09000030` into `pipr-tower-hamlets.json` (the 18 MB workbook is not committed). Latest month **2026-07**:

| series | \u00a3 pcm |
| --- | ---: |
| All-property average | **2,439** |
| Annual change | **3.0%** |
| One bedroom | **1,981** |
| Two bedrooms | **2,404** |
| Three bedrooms | **2,733** |
| Four or more | **3,360** |
| Flat/maisonette | **2,272** |

Matches the ONS local article https://www.ons.gov.uk/visualisations/housingpriceslocal/E09000030/ (last updated 19 August 2026) and the bulletin https://www.ons.gov.uk/economy/inflationandpriceindices/bulletins/privaterentandhousepricesuk/august2026

Refresh: `node scripts/snapshot-pipr.mjs` then `python3 scripts/extract-pipr.py` (needs `openpyxl`).

### Nurse pay — Band 5 Inner London 2026/27

[NHS Employers pay scales 2026/27](https://www.nhsemployers.org/articles/pay-scales-202627)

| | \u00a3 |
| --- | ---: |
| England Band 5 entry (basic) | 32,073 |
| England Band 5 top (basic) | 39,043 |
| **Inner London entry (incl. HCAS)** | **38,488** |
| Inner London mid | 41,511 |
| **Inner London top** | **46,852** |

Inner HCAS: 20% of basic, min \u00a35,794, max \u00a38,746 from 1 April 2026. Game uses **entry \u00a338,488**.

### Housing in London 2025

Dataset page confirmed: https://data.london.gov.uk/dataset/housing-in-london-the-evidence-base-for-the-mayors-housing-strat-24rpx (2025 report + tables listed). **No chart figures were extracted; none are used.**

## 5. `stakes.json`

Official snapshot **28 August 2026**. Re-fetched; Tower Hamlets (`E09000030`) rows extracted from the ODS/DOCX. Chrome shows TA **3,096** (31 Mar 2026) and register 28,469 (432 is 1.5%).

| series | figure | date | source |
| --- | ---: | --- | --- |
| Households in TA | **3,096** (22.0 per 1,000 hh) | 31 Mar 2026 | MHCLG TA1 |
| of which with children | **2,404** | 31 Mar 2026 | TA1 |
| Children in TA | **4,911** | 31 Mar 2026 | TA1 |
| People aged under 18 in TA | **4,821** | 31 Mar 2026 | TA8 (not the same as TA1 dependents; note 47) |
| B&B | **200** (3 with children) | 31 Mar 2026 | TA1 |
| Nightly paid self-contained | **1,273** | 31 Mar 2026 | TA1 |
| Out-of-area TA | **1,329** (9.5/1,000; 89.9% still in London) | 31 Mar 2026 | TA1 / TA9 |
| Median stay, LA/HA stock | **1,860.5 days** | 31 Mar 2026 | TA7 |
| Duties owed (Q1 2026) | **608** (146 prevention / 462 relief) | Jan–Mar 2026 | A1 |
| Housing register | **28,469** | 31 Mar 2025 | MHCLG Live Table 600 |
| 432 completions vs register | **1.5%** (432/28,469) | 2023–24 supply / 2025 register | GLA Datastore + Table 600 |
| Child poverty AHC | **50.3%** (highest UK LA) | FYE 2025 | DWP Table 1 |
| London Living Wage | **\u00a314.80/hr** (implement by 1 May 2026) | announced 22 Oct 2025 | Living Wage Foundation |
| National Living Wage (statutory) | **\u00a312.71/hr** from 1 Apr 2026 | — | GOV.UK / LPC |
| s106 remaining | **\u00a3151,229,434** (~\u00a3151.2m) | end 2024/25 | LBTH IFS 2024/25 Table 2.1 D(v) |

Homelessness ODS Cover: released **13 August 2026**, status **Provisional**, OGL v3. Live tables: https://www.gov.uk/government/statistical-data-sets/live-tables-on-homelessness — ODS `https://assets.publishing.service.gov.uk/media/6a82eeb83bd75b81e2329a7a/Statutory_Homelessness_Detailed_Local_Authority_Data_202603.ods` (kept as `data/raw/Statutory_Homelessness_Detailed_Local_Authority_Data_202603.ods`).

Live Table 600: https://www.gov.uk/government/statistical-data-sets/live-tables-on-rents-lettings-and-tenancies — ODS `https://assets.publishing.service.gov.uk/media/6a2be263e50716856ed4afc4/Live_Table_600.ods` (updated 25 June 2026). OGL v3.

DWP children in low income families FYE 2025 bulletin, published 26 March 2026, Table 1 AHC: Tower Hamlets 50.3%, Hackney 50.1%. https://www.gov.uk/government/statistics/children-in-low-income-families-local-area-statistics-2022-to-2025/children-in-low-income-families-local-area-statistics-financial-year-ending-2025 OGL v3.

Real Living Wage: https://www.livingwage.org.uk/what-real-living-wage — London **\u00a314.80**, UK **\u00a313.45**, 2025–26 rates announced 22 October, employers have six months to implement by **1 May 2026**. Methodology not copied. Statutory NLW is a different rate.

IFS: council page https://www.towerhamlets.gov.uk/lgnl/planning_and_building_control/Infrastructure_planning/Funding-infrastructure.aspx still live. 2024/25 file is a Word document (dated 15/12/2025) at `/Documents/Planning-and-building-control/LLDC/2024-25-Infrastructure-Funding-Statement.docx`; body is the LBTH IFS. Compact TH rows: `data/raw/th-stakes-extract.json`.

No fetch failures on these sources.


## 6. `crime-th-2026-05.json`

Street-level crime from [data.police.uk](https://data.police.uk/) (no API key). Open Government Licence — **cite data.police.uk**.

Five overlapping 1-mile `crimes-street/all-crime` queries for **May 2026**, merged unique by `id`:

| centre | lat, lng | rows returned |
| --- | --- | ---: |
| Tower Hamlets (verified live) | 51.515, −0.042 | **1,778** |
| Bethnal Green | 51.525, −0.055 | **2,270** |
| Isle of Dogs | 51.505, −0.025 | **1,384** |
| Whitechapel | 51.520, −0.060 | **2,503** |
| Limehouse | 51.512, −0.035 | **1,686** |

Unique after merge: **4,391**. HUD `byCategory` is that full unique count. Map `points` capped at **2,500** (stratified by category).

**Locations are approximate.** Police.uk anonymises street-level crime to a street or nearby point — not the exact incident, not a property address.

`byCategory` (May 2026 unique): anti-social-behaviour 1,098; violent-crime 1,032; shoplifting 409; other-theft 378; theft-from-the-person 339; public-order 245; burglary 180; vehicle-crime 179; drugs 176; bicycle-theft 136; robbery 135; other-crime 39; criminal-damage-arson 23; possession-of-weapons 22.

Example: `https://data.police.uk/api/crimes-street/all-crime?lat=51.515&lng=-0.042&date=2026-05`

## 7. `schools-th.geojson`

Points, **not** legal catchments. GIAS dump `https://dfe-digital.github.io/gias-data/schools.json` filtered `local_authority == "Tower Hamlets"` and `status == "Open"`. Overpass was not needed.

**117** open schools with coordinates (28 Aug 2026). Phases in GIAS: Primary 66, Not applicable 26, Secondary 17, Nursery 4, 16 plus 3, All-through 1.

Sidecar `schools-th.meta.json`: a **400 m halo is a proximity cue, not an admissions catchment**. Catchments, PAN and oversubscription criteria are not in this file.

OGL v3 — Get Information About Schools, Department for Education.

## 8. `hospitals-th.json`

Two Barts Health sites, Nominatim/OSM confirmed 28 Aug 2026:

| name | lat, lng | note |
| --- | --- | --- |
| Royal London Hospital | **51.51750, −0.05989** | Whitechapel; OSM way 640495338. Matches the given 51.51745, −0.05993 (E1 1FR) to ~7 m. |
| Mile End Hospital | **51.52505, −0.04221** | 275 Bancroft Road, E1 4DG; OSM way 184154674. Confirmed, not an approximate pin. |

**Sweet-spot rule (game, not NHS policy):** 400–1,200 m of a hospital is a good walk; **<250 m** is too near (noise / servicing); **>2 km** is far. That rule lives here, not as a legal buffer.

## Simulation formulas (visible in-game)

Take-home (nurse / family earners), 2026/27 England sketch — not official tax software:

```
pension = gross \u00d7 9.8%          # NHS employee contribution, labelled estimate
tax     = max(0, gross − pension − \u00a312,570) \u00d7 20%
NI      = max(0, gross − \u00a312,570) \u00d7 8%
monthly = (gross − pension − tax − NI) / 12
```

Band 5 Inner entry → **\u00a32,351 / month** take-home.

| Resident | Housing cost | Starts |
| --- | --- | --- |
| Nurse | 42% of PIPR 1-bed (houseshare; a full 1-bed already exceeds 40% take-home) | ~35% |
| Private renter | `tenancyLag \u00d7 PIPR 1-bed`, modelled gross \u00a352,000 (not ASHE) | ~45% |
| Family of four | `tenancyLag \u00d7 PIPR 3-bed`, two Band 5 Inner entry salaries | ~45% |

- Sitting-tenant lag starts at **0.78** (PIPR is new + existing; lag closes toward 1 as the market tightens).
- **Stressed** if rent > **40%** of take-home.
- **Priced out** if rent > **55%** of take-home.
- Approve luxury / under-affordable majors: stock up, rent index up, lag closes, renter support down.
- Refuse everything: stock stagnates, scarcity lifts rents, support hit if a large affordable scheme is refused.
- Negotiate opens **the table** (see below). A fast Policy 35% handshake is about **82%** of units this term (harder in conservation/listed) at **35%** affordable. Delay, a 50% squeeze, or a smaller building change that.
- Brownfield: easier civic case. Heritage: harder.

## Section 106 at the table

Permission can be granted subject to a **Section 106 agreement** ([Town and Country Planning Act 1990 s106](https://www.legislation.gov.uk/ukpga/1990/8/section/106)): a legal deal bolted onto the planning permission. Without it, the stamp is empty.

[London Plan (2021) Policy H5](https://www.london.gov.uk/programmes-strategies/planning/london-plan/new-london-plan/london-plan-2021) (threshold approach): **35% affordable** is the starting point on major schemes, not a favour. **50%** is the public-land / GLA aspiration. Schemes **under 10 homes** often sit outside that H5 threshold in real life; the table still lets you extract a wheelchair unit or extra affordable, and says so.

Talks that drag raise build costs (BCIS-style tender inflation and interest on land). The developer then runs a viability argument and asks to cut affordable. In the game this is a **labelled scenario, not a BCIS download or a forecast**: each 5 seconds at the table = one stall ≈ a quarter of talks ≈ **+3% labelled build-cost**. At +6% they try to cut 5 affordable points (floor 20% at +9%). Shake on a card before the clock hits 0; timeout or Walks = talks collapse, 0 homes this quarter, they can appeal.

Win: `affordableCompletions ≥ 432` after 8 quarters, support > 0, fewer than two residents priced out.

## Kit (fourth face, not in the lose set)

Kit is a Canary Wharf worker. **No salary is modelled.** The number on the card is **PIPR 2-bed (\u00a32,404 in July 2026) \u00d7 the game's house-price index** — a rent-as-asset / glass-tower tracker, not a payslip. Label: `Canary Wharf worker · 2-bed PIPR`.

Mood moves opposite the renters, from existing state only:

- luxury or ~0% affordable **approved** → boosted (HPI/asset vibe)
- **negotiate**, **refuse luxury**, or **432 affordable** hit → flat/annoyed
- otherwise from `priceIndex` vs 1.0

Scoring waits until quarter 8. Support 0 or two priced-out is a HUD warning, not an early end. Win: 432 affordable **and** Sam (family) not priced out **and** support > 20. Kit is not in the lose set. TA HUD uses `stakes.json` (3,096); in-game TA change is a labelled scenario, not a forecast.

## Map credits

2D SVG: equirectangular projection of WGS84. Borough outlines: ONS LAD May 2025 BUC (ultra generalised) via Esri FeatureServer `ESMARspQHYMw9BZ9`. Constraints as above. Application points from PLD centroids. Crime points: data.police.uk street-level (approximate). School points: GIAS. Hospital points: OSM/Nominatim.

3D: MapLibre GL JS 5.24 (CDN) + OpenFreeMap dark style `https://tiles.openfreemap.org/styles/dark` (OpenStreetMap vector tiles, no API key), with Esri World Imagery as a raster underlay (Esri, Maxar, Earthstar Geographics) when those tiles load. Fill-extrusion buildings from the tileset `building` layer (`render_height`). Proposed massing is a **temporary GeoJSON extrusion** from `wgs84_polygon` or a square around the centroid. Height is `min(ceil(units/4), 72) \u00d7 3.2 m` (negotiate is 62% of that; a smaller-building deal is extra short). Collapse uses the existing refuse ring — no new GeoJSON. **Indicative massing, not a planning drawing or a real elevation.** Lime if affordable ≥ 35%; gold/sodium if luxury or low affordable; refuse is a coral ring that dissolves. A 2D/3D toggle falls back to the SVG if WebGL or tiles fail.

Faces in `assets/faces/` are original illustrations, not photographs of real people.

## What is not in this snapshot

- No GLA API Gateway.
- No live PLD calls from the browser.
- No VOA rents (series died 2019).
- No Datastore house-price time series (died 2017).
- No tree preservation zones.
- No planning-application layer from planning.data.gov.uk for Tower Hamlets.
- No live police.uk calls from the browser (May 2026 snapshot).
- No school-admissions catchments (GIAS points + 400 m halo only).
- No A&E catchments or NHS travel-time isochrones.
