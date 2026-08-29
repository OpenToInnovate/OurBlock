/** Spoken lines before the stacker. Not a legal card. */

function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
}

export function parseStoreys(text) {
  const s = String(text || "");
  let best = 0;
  const re = /(\d+)\s*(?:-|to\s+)?(?:storey|storeys|storied|floor|floors)\b/gi;
  let m;
  while ((m = re.exec(s))) best = Math.max(best, Number(m[1]) || 0);
  const parts = s.matchAll(/part[-\s]*(\d+)/gi);
  for (const p of parts) best = Math.max(best, Number(p[1]) || 0);
  return best || 0;
}

export function floorsFor(app) {
  const g = app?.game || {};
  const units = Math.max(0, Number(g.units) || 0);
  const fromUnits = Math.max(2, Math.ceil((units || 8) / 8));
  const fromText = parseStoreys(g.plainAsk || app?.description || "");
  const n = fromText || fromUnits;
  return Math.max(2, Math.min(24, n));
}

export function looksStalled(app) {
  const ref = app?.lpa_app_no || app?.id || "";
  const year = /(?:PA|PP)\/(\d{2})/i.exec(ref);
  const old = year && Number(year[1]) <= 24;
  const blob = `${app?.application_type_full || ""} ${app?.description || ""} ${app?.game?.plainAsk || ""}`;
  const vary = /variation|condition|already have permission|already won|cosmetics/i.test(blob);
  return !!(old || vary);
}

export function challengeSpec(app) {
  const g = app?.game || {};
  const c = g.constraints || {};
  const units = Math.max(0, Number(g.units) || 0);
  const aff = Number(g.affordablePct) || 0;
  const luxury = !!g.luxury || aff < 0.12;
  const floors = floorsFor(app);
  const limeShare = luxury ? Math.min(0.2, aff) : aff >= 0.35 ? Math.max(0.35, aff) : aff;
  const limeFloors = Math.max(aff > 0 ? 1 : 0, Math.round(floors * limeShare));
  const tight = !!(c.conservation || c.listed || c.article4);
  const brown = !!c.brownfield;
  const socialHomes = Math.round(units * aff);
  const homesPerLime = limeFloors ? Math.max(1, Math.round((socialHomes || limeFloors) / limeFloors)) : 0;
  return {
    floors,
    aff,
    luxury,
    tight,
    brown,
    units,
    limeFloors,
    homesPerLime,
    socialHomes,
  };
}


export function floorKind(i, spec) {
  const socialFloor = spec.luxury
    ? spec.limeFloors > 0 && i === 0
    : i < spec.limeFloors;
  if (socialFloor) return "social";
  if (spec.luxury || spec.aff < 0.12) return "luxury";
  return "mixed";
}

export function talkLines(app) {
  const g = app?.game || {};
  const spec = challengeSpec(app);
  const lines = [];
  const ask = clip(g.plainAsk || app?.site_name || "They want to build here.", 140);
  lines.push(ask);

  const mad = !!(g.luxury || spec.aff < 0.2);

  if (mad) {
    lines.push(
      spec.units
        ? `Now then. ${spec.units} on the plans, nowt for the list. Penthouse merchants.`
        : "Now then. Dead luxury, this. Nowt for the list. Penthouse merchants."
    );
    lines.push("I'm not having it. Brick is homes. Glass is bobbins.");
  } else if (spec.aff >= 0.35) {
    lines.push(
      spec.socialHomes
        ? `Ey up. ${spec.socialHomes} proper homes for the list. Sound, that.`
        : "Ey up. This one actually hits 35%. Proper homes. Sound, that."
    );
    lines.push("I'm chuffed. Land the brick — that's the stack we want.");
  } else {
    const pct = Math.round(spec.aff * 100);
    lines.push(`Now then. ${pct}% affordable — bit thin, that. London Plan wants 35%.`);
    lines.push("Not owt to write home about. Still, stack summat decent.");
  }

  if (looksStalled(app) && lines.length < 4) {
    lines.push("Been sat a while, this. Still worth a stack.");
  } else if (lines.length < 4) {
    lines.push(
      mad
        ? `${spec.floors} floors. Don't chase the glass, our kid.`
        : `${spec.floors} floors. Tap to drop. Brick scores, glass doesn't.`
    );
  }

  return lines.slice(0, 4);
}
