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

function sourceOf(app) {
  return String(app?.game?.affordableSource || "");
}

/** Null when the public record does not state a social/affordable figure. Refused stays unknown, not 0. */
export function affordablePctOf(app) {
  const g = app?.game || {};
  const src = sourceOf(app);
  if (/not-stated|unspecified-20|inferred|london-plan-default|refused/i.test(src)) return null;
  if (g.affordablePct == null || g.affordablePct === "") return null;
  const n = Number(g.affordablePct);
  return Number.isFinite(n) ? n : null;
}

export function affordableUnknown(app) {
  return affordablePctOf(app) == null;
}

export function challengeSpec(app) {
  const g = app?.game || {};
  const c = g.constraints || {};
  const units = Math.max(0, Number(g.units) || 0);
  const aff = affordablePctOf(app);
  const unknown = aff == null;
  const luxury = !!g.luxury;
  const floors = floorsFor(app);
  const limeShare = unknown ? 0 : luxury ? Math.min(0.2, aff) : aff >= 0.35 ? Math.max(0.35, aff) : aff;
  const limeFloors = unknown ? 0 : Math.max(aff > 0 ? 1 : 0, Math.round(floors * limeShare));
  const tight = !!(c.conservation || c.listed || c.article4);
  const brown = !!c.brownfield;
  let socialHomes = null;
  if (!unknown && units) {
    if (g.socialRentUnits != null && Number.isFinite(Number(g.socialRentUnits))) {
      socialHomes = Number(g.socialRentUnits);
    } else {
      socialHomes = Math.round(units * aff);
    }
  }
  const homesPerLime = limeFloors ? Math.max(1, Math.round((socialHomes || limeFloors) / limeFloors)) : 0;
  return {
    floors,
    aff,
    unknown,
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
  if (spec.unknown && !spec.luxury) return "mixed";
  const socialFloor = spec.luxury
    ? spec.limeFloors > 0 && i === 0
    : i < spec.limeFloors;
  if (socialFloor) return "social";
  if (spec.luxury || (spec.aff != null && spec.aff < 0.12)) return "luxury";
  return "mixed";
}

/** Won the stack but the permission is 0 / super-low social. Unknown is not a luxury trap. */
export function isLowSocial(app, spec) {
  const s = spec || challengeSpec(app);
  if (s.unknown || s.aff == null) return false;
  const g = app?.game || {};
  const aff = s.aff;
  const socialHomes = Number(s.socialHomes) || 0;
  const luxury = !!(g.luxury || s.luxury);
  return aff === 0 || aff < 0.12 || socialHomes === 0 || (luxury && aff < 0.2);
}

export function isDecentSocial(app, spec) {
  const s = spec || challengeSpec(app);
  if (s.unknown || s.aff == null) return false;
  const g = app?.game || {};
  const aff = s.aff;
  const luxuryZero = !!(g.luxury || s.luxury) && aff < 0.2;
  return aff >= 0.2 && !luxuryZero;
}

function affordableInferred(app) {
  return /unspecified-20|inferred/i.test(sourceOf(app));
}

function affordableNotStated(app) {
  const src = sourceOf(app);
  if (/refused|council-led/i.test(src)) return false;
  return /not-stated/i.test(src) || affordablePctOf(app) == null;
}

function pctLabel(aff) {
  if (aff == null) return null;
  const raw = aff * 100;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) < 0.005) return String(rounded);
  return String(Math.round(raw * 100) / 100);
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
  const unknown = spec.unknown || spec.aff == null;
  return {
    site: app?.site_name || "",
    borough: app?.borough || "",
    ward: app?.ward || "",
    ref: app?.lpa_app_no || "",
    type: app?.application_type_full || "",
    units: spec.units,
    affordablePct: unknown ? null : Math.round(spec.aff * 100),
    affordablePctLabel: unknown ? null : pctLabel(spec.aff),
    affordableUnknown: unknown,
    affordableInferred: affordableInferred(app),
    socialHomes: unknown ? null : spec.socialHomes,
    socialRentUnits: g.socialRentUnits != null ? Number(g.socialRentUnits) : null,
    luxury: !!g.luxury,
    londonPlan: 35,
    constraints,
    plainAsk: g.plainAsk || "",
    plainImpact: g.plainImpact || "",
    boroughImpact: g.boroughImpact || "",
    url: g.affordableUrl || app?.url_planning_app || "",
    stalled: looksStalled(app),
    id: app?.id || app?.lpa_app_no || "",
    slug: app?.boroughSlug || "",
    source: sourceOf(app),
  };
}

/** Beginner-friendly sentences for the facts card. Numbers stay on the pack. */
export function factCopy(app) {
  const f = factsModel(app);
  const src = f.source;
  const wardHelps = !!(f.ward && f.site && !String(f.site).toLowerCase().includes(String(f.ward).toLowerCase().split(/\s+/)[0]));
  const place = [f.borough, wardHelps ? f.ward : ""].filter(Boolean).join(" · ");
  const homes = [];
  if (f.units) homes.push(`They want ${f.units} homes.`);
  if (/refused/i.test(src)) {
    // Pack plainAsk/plainImpact carry the refusal. Do not treat as 0%.
  } else if (/council-led/i.test(src)) {
    homes.push("These are new council homes.");
  } else if (f.affordableUnknown || affordableNotStated(app)) {
    homes.push("We could not find a social-housing figure on the public record. The application doesn't say.");
  } else if (f.affordableInferred) {
    homes.push("The application doesn't say how many affordable homes. We use a 20% guess so you can play. It might be more or less.");
  } else if (f.socialRentUnits != null) {
    const pct = f.affordablePctLabel;
    homes.push(
      pct
        ? `${pct}% affordable, including ${f.socialRentUnits} social-rent homes.`
        : `${f.socialRentUnits} social-rent homes.`
    );
  } else if (f.affordablePct === 0 || f.socialHomes === 0) {
    homes.push("None of these are for people on the waiting list.");
  } else if (f.affordablePct >= 35) {
    homes.push(`About ${f.socialHomes} of them would be social homes — that meets London's 35% ask on bigger schemes.`);
  } else if (f.units) {
    homes.push(`About ${f.socialHomes} of them would be social homes.`);
  }
  let london;
  if (/refused/i.test(src)) {
    london = "London asks bigger schemes for 35% affordable homes. This application was refused.";
  } else if (/council-led/i.test(src)) {
    london = "London asks bigger schemes for 35% affordable homes. This is a council-led scheme.";
  } else if (f.affordableUnknown) {
    london = "London asks bigger schemes for 35% affordable homes. This application doesn't say what it would provide.";
  } else {
    london = `London asks bigger schemes for 35% affordable homes. This one is ${f.affordablePctLabel}%.`;
  }
  const impact = [f.plainImpact, f.boroughImpact && !String(f.plainImpact || "").includes(f.boroughImpact) ? f.boroughImpact : ""]
    .filter(Boolean)
    .join(" ");
  return {
    site: f.site,
    place,
    ask: f.plainAsk,
    homes,
    london,
    extras: f.constraints.slice(),
    impact,
    stalled: f.stalled ? "Permission has been sitting a while. They may not have started building yet." : "",
    linkLabel: f.url ? "See the official application" : "",
    url: f.url,
    low: !f.affordableUnknown && (f.affordablePct < 12 || f.socialHomes === 0),
    ok: !f.affordableUnknown && f.affordablePct >= 35 && !f.affordableInferred,
    affordablePct: f.affordablePct,
    socialHomes: f.socialHomes,
    units: f.units,
    unknown: f.affordableUnknown,
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
  return `${shareOrigin()}/?v=ob13&app=${id}&scene=stack`;
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
  const url = shareUrl(app);
  const site = String(f.site || "this site").split(",")[0].trim() || "this site";
  const borough = f.borough || "London";
  const tags = civicHandles(civic, f.slug).join(" ");
  const n = copy.units;
  const x = copy.socialHomes;
  const y = copy.affordablePct;
  const civicWin = !!(copy.ok || (y != null && y >= 35));
  let stance;
  if (copy.unknown || y == null) {
    const nums = n
      ? `${n} homes. We could not find a social-housing figure on the public record.`
      : "We could not find a social-housing figure on the public record.";
    stance = `I played Our Block on ${site}, ${borough}. ${nums} London asks 35% on bigger schemes. I'd be grateful if you would look at the social-housing impact — does this do enough for people on the waiting list? You can try this application here: ${url}`;
  } else if (civicWin) {
    const nums = n
      ? `About ${x} of ${n} homes would be social (${y}%) — that meets London's 35% ask.`
      : `This one meets London's 35% ask (${y}%).`;
    stance = `I played Our Block on ${site}, ${borough}. ${nums} A good plan for the list. Thank you for a plan with real social homes. You can try this application here: ${url}`;
  } else if (y === 0 || x === 0) {
    const nums = n
      ? `${n} homes, none for the waiting list (0% affordable).`
      : `None of these homes are for the waiting list (0% affordable).`;
    stance = `I played Our Block on ${site}, ${borough}. ${nums} London asks 35% on bigger schemes. I'd be grateful if you would look at the social-housing impact — does this do enough for people on the waiting list? You can try this application here: ${url}`;
  } else {
    const nums = n
      ? `About ${x} of ${n} homes would be social (${y}%).`
      : `This one is ${y}% affordable.`;
    stance = `I played Our Block on ${site}, ${borough}. ${nums} London asks 35% on bigger schemes. I'd be grateful if you would look at the social-housing impact — does this do enough for people on the waiting list? You can try this application here: ${url}`;
  }
  const text = [stance, tags].filter(Boolean).join("\n");
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
  const src = sourceOf(app);
  const lines = [];
  const ask = clip(g.plainAsk || app?.site_name || "They want to build here.", 140);
  lines.push(ask);

  const unknown = spec.unknown || spec.aff == null;
  const pct = unknown ? null : pctLabel(spec.aff);
  const low = isLowSocial(app, spec);

  if (unknown) {
    if (/refused/i.test(src)) {
      if (spec.units) lines.push(`They want ${spec.units} homes. Committee refused this application.`);
      else lines.push("Committee refused this application.");
    } else if (/council-led/i.test(src)) {
      lines.push(spec.units ? `They want ${spec.units} new council homes.` : "These are new council homes.");
    } else if (spec.units) {
      lines.push(`They want ${spec.units} homes. We could not find a social-housing figure on the public record.`);
    } else {
      lines.push("We could not find a social-housing figure on the public record. The application doesn't say.");
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
    const socialBit =
      g.socialRentUnits != null
        ? `About ${g.socialRentUnits} of them would be social-rent homes — that meets London's 35% ask.`
        : `About ${spec.socialHomes} of them would be social homes — that meets London's 35% ask.`;
    lines.push(spec.units ? `They want ${spec.units} homes. ${socialBit}` : "This one meets London's 35% ask for affordable homes.");
    lines.push("Those are the homes that help people on the list.");
    lines.push("Right. Let's get it stacked.");
  } else {
    const socialBit =
      g.socialRentUnits != null
        ? `About ${g.socialRentUnits} of them would be social-rent homes. London asks 35%.`
        : `About ${spec.socialHomes} of them would be social homes. London asks 35%.`;
    lines.push(spec.units ? `They want ${spec.units} homes. ${socialBit}` : `This one is ${pct}% affordable. London asks 35%.`);
    lines.push(clip(g.plainImpact, 130) || "There's a gap versus the 35% London asks for.");
    lines.push("Have a look, then let's get it stacked.");
  }

  return lines.slice(0, 4);
}
