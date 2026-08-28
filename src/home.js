/** Home street: postcode + borough fly. No crime dots. On-demand APIs only. */

import { distMetres } from "./geo.js";

const PC_URL = "https://api.postcodes.io/postcodes/";
const CRIME_URL = "https://data.police.uk/api/crimes-street/all-crime";
const CRIME_MONTH = "2026-05";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const HOME_KEY = "planning-desk-home";

export function loadSavedHome() {
  try {
    const raw = localStorage.getItem(HOME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveHome(home) {
  try {
    localStorage.setItem(HOME_KEY, JSON.stringify(home));
  } catch (_) {}
}

export async function lookupPostcode(raw) {
  const code = String(raw || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (code.length < 5) throw new Error("Need a full postcode.");
  const r = await fetch(PC_URL + encodeURIComponent(code.replace(/\s/g, "")));
  const j = await r.json();
  if (!r.ok || !j?.result) throw new Error("Postcode not found.");
  const p = j.result;
  const lad = p.codes?.admin_district || p.codes?.laua;
  const borough = p.admin_district || p.parliamentary_constituency;
  const inLondon = String(lad || "").startsWith("E09") || /London|Westminster|City of London/i.test(borough || "");
  return {
    postcode: p.postcode,
    lat: p.latitude,
    lng: p.longitude,
    borough,
    ward: p.admin_ward,
    lad,
    inLondon,
  };
}

function nearest(lat, lng, sites, maxM) {
  let best = null;
  for (const s of sites || []) {
    const slat = s.lat ?? s.latitude;
    const slng = s.lng ?? s.lon ?? s.longitude;
    if (slat == null || slng == null) continue;
    const m = distMetres(lat, lng, slat, slng);
    if (maxM != null && m > maxM) continue;
    if (!best || m < best.m) best = { name: s.name, m: Math.round(m), lat: slat, lng: slng };
  }
  return best;
}

async function crimeCountNear(lat, lng) {
  const u = `${CRIME_URL}?lat=${lat}&lng=${lng}&date=${CRIME_MONTH}`;
  const r = await fetch(u);
  if (!r.ok) return null;
  const rows = await r.json();
  if (!Array.isArray(rows)) return null;
  let n = 0;
  for (const c of rows) {
    const clat = Number(c?.location?.latitude);
    const clng = Number(c?.location?.longitude);
    if (!Number.isFinite(clat) || !Number.isFinite(clng)) continue;
    if (distMetres(lat, lng, clat, clng) <= 400) n += 1;
  }
  return { count: n, month: CRIME_MONTH, totalReturned: rows.length };
}

async function overpassNearest(lat, lng, filter, aroundM) {
  const q = `[out:json][timeout:8];nwr${filter}(around:${aroundM},${lat},${lng});out tags center 4;`;
  const r = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: "data=" + encodeURIComponent(q),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const els = j.elements || [];
  let best = null;
  for (const e of els) {
    const elat = e.lat ?? e.center?.lat;
    const elng = e.lon ?? e.center?.lon;
    if (elat == null) continue;
    const m = distMetres(lat, lng, elat, elng);
    const name = e.tags?.name || "Unnamed";
    if (!best || m < best.m) best = { name, m: Math.round(m) };
  }
  return best;
}

export async function streetImpact(home, opts = {}) {
  const { lat, lng } = home;
  const schools = opts.schools || [];
  const hospitals = opts.hospitals || [];
  const apps = opts.apps || [];

  const schoolPack = nearest(lat, lng, schools.map((s) => ({
    name: s.name || s.properties?.name,
    lat: s.lat ?? s.geometry?.coordinates?.[1],
    lng: s.lng ?? s.geometry?.coordinates?.[0],
  })), 2000);

  const hospPack = nearest(lat, lng, hospitals, 8000);

  const nearbyApps = apps
    .filter((a) => a.centroid)
    .map((a) => ({
      ref: a.lpa_app_no,
      m: Math.round(distMetres(lat, lng, a.centroid.lat, a.centroid.lon)),
      ask: a.game?.plainAsk || a.site_name,
    }))
    .filter((a) => a.m <= 800)
    .sort((a, b) => a.m - b.m)
    .slice(0, 3);

  const [crime, schoolOsm, hospOsm] = await Promise.all([
    crimeCountNear(lat, lng).catch(() => null),
    schoolPack ? Promise.resolve(null) : overpassNearest(lat, lng, '["amenity"="school"]', 800).catch(() => null),
    hospPack ? Promise.resolve(null) : overpassNearest(lat, lng, '["amenity"="hospital"]', 2500).catch(() => null),
  ]);

  const school = schoolPack || schoolOsm;
  const hospital = hospPack || hospOsm;
  let hospBand = "unknown";
  if (hospital) {
    if (hospital.m < 250) hospBand = "too-close";
    else if (hospital.m >= 400 && hospital.m <= 1200) hospBand = "sweet";
    else if (hospital.m > 2000) hospBand = "far";
    else hospBand = "ok";
  }

  return { crime, school, hospital, hospBand, nearbyApps };
}

export function streetCopy(home, impact, playableHere) {
  const bits = [];
  bits.push(`${home.postcode} · ${home.ward || home.borough}`);
  if (impact.school) {
    bits.push(
      impact.school.m <= 400
        ? `School on the walk (${impact.school.name}, ${impact.school.m} m). Not a legal catchment.`
        : `Nearest school ${impact.school.m} m (${impact.school.name}).`
    );
  }
  if (impact.hospital) {
    const band =
      impact.hospBand === "sweet"
        ? "sweet spot for a family (near A&E, not on the helipad)"
        : impact.hospBand === "too-close"
          ? "very close — ambulances and noise"
          : impact.hospBand === "far"
            ? "a hike to A&E"
            : "in range";
    bits.push(`${impact.hospital.name} is ${impact.hospital.m} m — ${band}.`);
  }
  if (impact.crime) {
    bits.push(
      `About ${impact.crime.count} street crimes within 400 m in ${impact.crime.month} (police.uk, locations approximate).`
    );
  }
  if (playableHere && impact.nearbyApps?.length) {
    bits.push(`On this desk, ${impact.nearbyApps.length} live case${impact.nearbyApps.length > 1 ? "s" : ""} within 800 m.`);
  } else if (!playableHere) {
    bits.push(`You're home. No committee pack for ${home.borough} in this snapshot.`);
  }
  return bits;
}

let streetFoldOpen = true;

export function renderStreetCard(el, home, impact, playableHere) {
  if (!el) return;
  const lines = streetCopy(home, impact, playableHere);
  el.hidden = false;
  const extra = lines.slice(1).map((l) => "<li>" + l + "</li>").join("");
  const ward = home.ward ? home.ward + " · " : "";
  el.innerHTML =
    "<details class=\"street-fold\"" + (streetFoldOpen ? " open" : "") + ">" +
    "<summary class=\"fold-sum\"><span class=\"fold-kicker\">Your street</span> " + home.postcode + "</summary>" +
    "<p class=\"street-meta\">" + ward + home.borough + "</p>" +
    "<ul class=\"street-bits\">" + extra + "</ul>" +
    "</details>";
  const fold = el.querySelector("details");
  if (fold) fold.addEventListener("toggle", () => { streetFoldOpen = fold.open; });
}

export function fillBoroughSelect(sel, boroughs, currentLad) {
  if (!sel) return;
  sel.innerHTML = boroughs
    .map((b) => {
      const selAttr = b.lad === currentLad ? " selected" : "";
      return `<option value="${b.lad}"${selAttr}>${b.name}</option>`;
    })
    .join("");
}
