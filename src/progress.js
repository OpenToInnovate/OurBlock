/** Sitting-only challenge progress. RAM, not a save-game. Wipes our-block-progress on boot. */

const KEY = "our-block-progress";

let progress = {};
let wiped = false;

function wipeSaved() {
  if (wiped) return;
  wiped = true;
  try {
    localStorage.removeItem(KEY);
  } catch (_) {}
}

wipeSaved();

export function loadProgress() {
  wipeSaved();
  return progress;
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
  if (!id) return progress;
  const prev = progress[id] || {};
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
  progress[id] = next;
  return progress;
}

export function recordOf(id) {
  if (!id) return null;
  return progress[id] || null;
}
