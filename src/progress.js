/** Per-challenge stack progress. localStorage key our-block-progress. */

const KEY = "our-block-progress";

export function loadProgress() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function challengeId(app) {
  return String(app?.id || app?.lpa_app_no || "");
}

export function maxSocial(spec) {
  if (!spec) return 0;
  if (spec.socialHomes > 0) return spec.socialHomes;
  const lime = spec.limeFloors || 0;
  const per = spec.homesPerLime || 1;
  return lime * per;
}

export function saveChallenge(id, rec) {
  if (!id) return loadProgress();
  const all = loadProgress();
  const prev = all[id] || {};
  const next = {
    social: Number(rec.social) || 0,
    max: Number(rec.max) || 0,
    rubble: Number(rec.rubble) || 0,
    done: true,
  };
  if (prev.done && (prev.social || 0) > next.social) {
    next.social = prev.social;
    next.rubble = prev.rubble ?? next.rubble;
    if (prev.max > next.max) next.max = prev.max;
  }
  all[id] = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (_) {}
  return all;
}

export function recordOf(id) {
  if (!id) return null;
  return loadProgress()[id] || null;
}
