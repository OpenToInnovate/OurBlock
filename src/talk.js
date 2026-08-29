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

/** Won the stack but the permission is 0 / super-low social. */
export function isLowSocial(app, spec) {
  const s = spec || challengeSpec(app);
  const g = app?.game || {};
  const aff = Number(s.aff) || 0;
  const socialHomes = Number(s.socialHomes) || 0;
  const luxury = !!(g.luxury || s.luxury);
  return aff === 0 || aff < 0.12 || socialHomes === 0 || (luxury && aff < 0.2);
}

export function isDecentSocial(app, spec) {
  const s = spec || challengeSpec(app);
  const g = app?.game || {};
  const aff = Number(s.aff) || 0;
  const luxuryZero = !!(g.luxury || s.luxury) && aff < 0.2;
  return aff >= 0.2 && !luxuryZero;
}

function affordableInferred(app) {
  return /unspecified-20|inferred/i.test(app?.game?.affordableSource || "");
}

/** Facts drawn only from pack fields. No invented numbers. */
export function factsModel(app) {
  const g = app?.game || {};
  const spec = challengeSpec(app);
  const c = g.constraints || {};
  const constraints = [];
  if (c.conservation) constraints.push("The look of this street is protected.");
  if (c.listed) constraints.push("There's a historic listed building nearby.");
  if (c.article4) constraints.push("This street has extra planning rules.");
  if (c.brownfield) constraints.push("This land has been built on before.");
  return {
    site: app?.site_name || "",
    borough: app?.borough || "",
    ward: app?.ward || "",
    ref: app?.lpa_app_no || "",
    type: app?.application_type_full || "",
    units: spec.units,
    affordablePct: Math.round(spec.aff * 100),
    affordableInferred: affordableInferred(app),
    socialHomes: spec.socialHomes,
    luxury: !!g.luxury,
    londonPlan: 35,
    constraints,
    plainAsk: g.plainAsk || "",
    plainImpact: g.plainImpact || "",
    url: app?.url_planning_app || "",
    stalled: looksStalled(app),
    id: app?.id || app?.lpa_app_no || "",
    slug: app?.boroughSlug || "",
  };
}

/** Beginner-friendly sentences for the facts card. Numbers stay on the pack. */
export function factCopy(app) {
  const f = factsModel(app);
  const wardHelps = !!(f.ward && f.site && !String(f.site).toLowerCase().includes(String(f.ward).toLowerCase().split(/\s+/)[0]));
  const place = [f.borough, wardHelps ? f.ward : ""].filter(Boolean).join(" · ");
  const homes = [];
  if (f.units) homes.push(`They want ${f.units} homes.`);
  if (f.affordableInferred) {
    homes.push("The application doesn't say how many affordable homes. We use a 20% guess so you can play. It might be more or less.");
  } else if (f.affordablePct === 0 || f.socialHomes === 0) {
    homes.push("None of these are for people on the waiting list.");
  } else if (f.affordablePct >= 35) {
    homes.push(`About ${f.socialHomes} of them would be social homes — that meets London's 35% ask on bigger schemes.`);
  } else if (f.units) {
    homes.push(`About ${f.socialHomes} of them would be social homes.`);
  }
  return {
    site: f.site,
    place,
    ask: f.plainAsk,
    homes,
    london: `London asks bigger schemes for 35% affordable homes. This one is ${f.affordablePct}%.`,
    extras: f.constraints.slice(),
    impact: f.plainImpact,
    stalled: f.stalled ? "Permission has been sitting a while. They may not have started building yet." : "",
    linkLabel: f.url ? "See the official application" : "",
    url: f.url,
    low: f.affordablePct < 12 || f.socialHomes === 0,
    ok: f.affordablePct >= 35 && !f.affordableInferred,
    affordablePct: f.affordablePct,
    socialHomes: f.socialHomes,
    units: f.units,
  };
}

export function shareOrigin() {
  const host = location.hostname || "";
  if (host.endsWith("here.now")) return location.origin;
  if (location.origin && location.origin !== "null") return location.origin;
  return "https://supple-island-3ck2.here.now";
}

export function shareUrl(app) {
  const id = encodeURIComponent(app?.id || app?.lpa_app_no || "");
  return `${shareOrigin()}/?v=ob10&app=${id}&scene=stack`;
}

export function civicHandles(civic, slug) {
  const n = civic?.national || {};
  const tags = [
    n.pmOffice || "10DowningStreet",
    n.pm || "andyburnham",
    n.mhclg || "mhclg",
    n.mayor || "MayorofLondon",
  ];
  const council = civic?.councils?.[slug];
  if (council) tags.push(council);
  return tags.map((h) => "@" + String(h).replace(/^@/, ""));
}

export function sharePayload(app, civic) {
  const f = factsModel(app);
  const copy = factCopy(app);
  const spec = challengeSpec(app);
  const url = shareUrl(app);
  const site = f.site || "This site";
  const borough = f.borough || "London";
  const homes = copy.homes.join(" ") || (spec.units ? `They want ${spec.units} homes.` : "Homes not stated on the pack");
  const impact = clip(f.plainImpact, 180);
  const tags = civicHandles(civic, f.slug).join(" ");
  const text = [
    `Our Block: ${site}, ${borough}`,
    homes,
    copy.london,
    impact,
    url,
    tags,
  ].filter(Boolean).join("\n");
  return {
    title: `Our Block — ${site}`,
    text,
    url,
  };
}

export function civicLoseLine() {
  return "You stacked it, but this permission does almost nothing for social housing.";
}

export function civicFailRetryLine() {
  return "Have another go — this one actually has homes for the list.";
}

export function civicWinLine() {
  return "You stacked it. This one actually has homes for the list.";
}

export function talkLines(app) {
  const g = app?.game || {};
  const spec = challengeSpec(app);
  const lines = [];
  const ask = clip(g.plainAsk || app?.site_name || "They want to build here.", 140);
  lines.push(ask);

  const pct = Math.round(spec.aff * 100);
  const inferred = affordableInferred(app);
  const low = isLowSocial(app, spec);

  if (inferred) {
    if (spec.units) {
      lines.push(`They want ${spec.units} homes. The application doesn't say how many are affordable — we use a 20% guess so you can play.`);
    } else {
      lines.push("The application doesn't say how many affordable homes. We use a 20% guess so you can play.");
    }
    const who = clip(g.plainImpact, 130);
    lines.push(who || "Have a look at the card, then we'll stack it.");
    lines.push("Have a look, then let's get it stacked.");
  } else if (low) {
    if (spec.units) {
      lines.push(
        `They want ${spec.units} homes. None of these are for people on the waiting list. London asks 35% on bigger schemes.`
      );
    } else {
      lines.push(`This one is ${pct}% affordable. London asks 35% on bigger schemes.`);
    }
    const who = clip(g.plainImpact, 130);
    lines.push(who || "That leaves people waiting for a social home out of this one.");
    lines.push("Have a look, then let's get it stacked.");
  } else if (spec.aff >= 0.35) {
    lines.push(
      spec.units
        ? `They want ${spec.units} homes. About ${spec.socialHomes} of them would be social homes — that meets London's 35% ask.`
        : "This one meets London's 35% ask for affordable homes."
    );
    lines.push("Those are the homes that help people on the list.");
    lines.push("Right. Let's get it stacked.");
  } else {
    lines.push(
      spec.units
        ? `They want ${spec.units} homes. About ${spec.socialHomes} of them would be social homes. London asks 35%.`
        : `This one is ${pct}% affordable. London asks 35%.`
    );
    lines.push(clip(g.plainImpact, 130) || "There's a gap versus the 35% London asks for.");
    lines.push("Have a look, then let's get it stacked.");
  }

  return lines.slice(0, 4);
}
