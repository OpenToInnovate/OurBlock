/** Place facts from snapshotted amenities. No invented crime numbers. */

import { distMetres } from "./geo.js";

export const SCHOOL_HALO_M = 400;
export const HOSP_TOO_CLOSE_M = 250;
export const HOSP_SWEET_MIN_M = 400;
export const HOSP_SWEET_MAX_M = 1200;
export const HOSP_TOO_FAR_M = 2000;
/** Unique anonymised street-points within 400 m. Calibrated on the May 2026 snapshot. */
export const HIGH_CRIME_LOCS = 28;

function hospitalSites(hospitals) {
  if (!hospitals) return [];
  if (Array.isArray(hospitals)) return hospitals;
  return hospitals.sites || [];
}

function schoolPoints(schools) {
  const feats = schools?.features || [];
  return feats
    .map((f) => {
      const lon = f.geometry?.coordinates?.[0] ?? f.properties?.lng;
      const lat = f.geometry?.coordinates?.[1] ?? f.properties?.lat;
      if (lon == null || lat == null) return null;
      return { name: f.properties?.name || "School", lon, lat, phase: f.properties?.phase || null };
    })
    .filter(Boolean);
}

function crimeLocations(crime) {
  if (crime?.locations?.length) return crime.locations;
  const acc = new Map();
  for (const p of crime?.points || []) {
    const k = `${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`;
    const rec = acc.get(k) || { lat: p.lat, lng: p.lng, count: 0, street: p.street };
    rec.count += 1;
    acc.set(k, rec);
  }
  return [...acc.values()];
}

export function emptyPlace() {
  return {
    schoolHalo: false,
    schoolName: null,
    schoolM: null,
    hospitalName: null,
    hospitalM: null,
    hospitalBand: "unknown",
    hospitalSweet: false,
    hospitalTooClose: false,
    hospitalFar: false,
    crimeCount: 0,
    crimeLocs: 0,
    crimeMonth: null,
    highCrime: false,
    liveability: 0,
    rentBump: 0,
    streetLine: "liveability unknown",
    samLine: "liveability unknown",
    chips: [],
  };
}

export function placeOf(app, amenities = {}) {
  if (app?.game?.place) {
    const merged = { ...emptyPlace(), ...app.game.place };
    const line = merged.streetLine || merged.samLine || "liveability unknown";
    merged.streetLine = line;
    merged.samLine = line;
    return merged;
  }
  const out = emptyPlace();
  const lat = app?.centroid?.lat;
  const lon = app?.centroid?.lon;
  if (lat == null || lon == null) return out;

  const schools = schoolPoints(amenities.schools);
  if (schools.length) {
    let best = null;
    for (const s of schools) {
      const m = distMetres(lat, lon, s.lat, s.lon);
      if (!best || m < best.m) best = { ...s, m };
    }
    out.schoolName = best.name;
    out.schoolM = Math.round(best.m);
    out.schoolHalo = best.m <= SCHOOL_HALO_M;
  }

  const hosps = hospitalSites(amenities.hospitals);
  if (hosps.length) {
    let best = null;
    for (const h of hosps) {
      const m = distMetres(lat, lon, h.lat, h.lng);
      if (!best || m < best.m) best = { name: h.name, m };
    }
    out.hospitalName = best.name;
    out.hospitalM = Math.round(best.m);
    if (best.m < HOSP_TOO_CLOSE_M) {
      out.hospitalBand = "too-close";
      out.hospitalTooClose = true;
    } else if (best.m >= HOSP_SWEET_MIN_M && best.m <= HOSP_SWEET_MAX_M) {
      out.hospitalBand = "sweet";
      out.hospitalSweet = true;
    } else if (best.m > HOSP_TOO_FAR_M) {
      out.hospitalBand = "far";
      out.hospitalFar = true;
    } else {
      out.hospitalBand = "ok";
    }
  }

  const crime = amenities.crime;
  out.crimeMonth = crime?.month || null;
  const locs = crimeLocations(crime);
  let locN = 0;
  let crimeN = 0;
  for (const p of locs) {
    const m = distMetres(lat, lon, p.lat, p.lng);
    if (m <= SCHOOL_HALO_M) {
      locN += 1;
      crimeN += p.count || 1;
    }
  }
  out.crimeLocs = locN;
  out.crimeCount = crimeN;
  out.highCrime = locN >= HIGH_CRIME_LOCS;

  let liv = 0;
  let rent = 0;
  if (out.schoolHalo) {
    liv += 1;
    rent += 0.002;
  }
  if (out.hospitalSweet) {
    liv += 1;
    rent += 0.002;
  }
  if (out.hospitalTooClose) liv -= 1;
  if (out.hospitalFar) liv -= 1;
  if (out.highCrime) liv -= 1;
  else rent += 0.001;
  if (out.schoolHalo && out.hospitalSweet && !out.highCrime) rent += 0.002;

  out.liveability = liv;
  out.rentBump = rent;

  const bits = [];
  bits.push(out.schoolHalo ? "school 400m" : "no school 400m");
  if (out.hospitalSweet) bits.push("hospital sweet");
  else if (out.hospitalTooClose) bits.push("hospital too close");
  else if (out.hospitalFar) bits.push("hospital far");
  else bits.push("hospital ok");
  bits.push(out.highCrime ? `crime high (${out.crimeCount})` : `crime ${out.crimeCount}`);
  out.streetLine = bits.join(" · ");
  out.samLine = out.streetLine;

  out.chips = [
    {
      key: "school",
      on: out.schoolHalo,
      label: out.schoolHalo ? "School 400m" : "No school 400m",
      tip: out.schoolName
        ? `${out.schoolName}, ${out.schoolM} m. Within 400m of a school (not a legal catchment).`
        : "Within 400m of a school (not a legal catchment).",
    },
    {
      key: "hospital",
      on: out.hospitalSweet,
      warn: out.hospitalTooClose || out.hospitalFar,
      label: out.hospitalTooClose
        ? "Hospital <250m"
        : out.hospitalSweet
          ? "Hospital sweet"
          : out.hospitalFar
            ? "Hospital >2km"
            : "Hospital",
      tip: out.hospitalName
        ? `${out.hospitalName}, ${out.hospitalM} m. Sweet spot 400–1200 m (near A&E, not on the helipad).`
        : "Sweet spot 400–1200 m from a named hospital.",
    },
    {
      key: "crime",
      on: false,
      warn: out.highCrime,
      label: `Crime ${out.crimeCount} this month`,
      tip: `May 2026 street-level count within 400 m (${out.crimeLocs} anonymised points). Locations are approximate — police.uk snaps them to a street, not an address.`,
    },
  ];
  return out;
}

export function actionFx(app, decision, proposal, place, taFrom) {
  const desc = app?.description || "";
  const familyOrSocial =
    (proposal?.affordablePct ?? 0) >= 0.35 ||
    /family|3-bed|4-bed|social rent|social housing|affordable housing/i.test(desc);
  const zeroLux = !!(proposal?.luxury || (proposal?.affordablePct ?? 1) < 0.05);
  const units = proposal?.units || 1;
  const bump = Math.max(4, Math.min(12, Math.round(4 + units / 20)));
  const ease = Math.max(2, Math.min(6, Math.round(2 + units / 30)));
  let taDelta = 0;
  if (decision === "refuse" && familyOrSocial) taDelta = bump;
  else if (decision === "approve" && zeroLux) taDelta = bump;
  else if (decision === "negotiate") taDelta = -ease;
  else if (decision === "approve" && (proposal?.affordablePct ?? 0) >= 0.35) taDelta = -ease;
  const crowd = decision === "refuse" ? "out" : "in";
  const crowdCount = Math.max(8, Math.min(20, Math.round(8 + units / 8)));
  return {
    taDelta,
    taFrom,
    taTo: Math.max(0, taFrom + taDelta),
    crowd,
    crowdCount,
    place: place || emptyPlace(),
  };
}
