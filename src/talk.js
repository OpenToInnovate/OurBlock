/** Spoken lines before the stacker. Not a legal card. */

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
  // Unknown stays mixed bricks — no invented 20% lime share.
  const limeShare = unknown || aff == null ? 0 : aff;
  const limeFloors = unknown || aff == null || limeShare <= 0 ? 0 : Math.max(1, Math.round(floors * limeShare));
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
  if (spec.unknown || spec.aff == null) return "mixed";
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
  const place = [f.borough, wardHelps ? f.ward : ""].filter(Boolean).join(" \u00b7 ");
  const homes = [];
  if (f.units) homes.push(`They want ${f.units} homes.`);
  if (/refused/i.test(src)) {
    // Pack plainAsk/plainImpact carry the refusal. Do not treat as 0%.
  } else if (/council-led/i.test(src)) {
    homes.push("These are new council homes.");
  } else if (f.affordableUnknown || affordableNotStated(app)) {
    homes.push("We could not find a social-housing figure on the public record.");
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
    homes.push(`About ${f.socialHomes} of them would be social homes. That meets London's 35% ask on bigger schemes.`);
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
    site: scrubTalk(f.site),
    place,
    ask: scrubTalk(f.plainAsk),
    homes: homes.map(scrubTalk),
    london: scrubTalk(london),
    extras: f.constraints.slice().map(scrubTalk),
    impact: scrubTalk(impact),
    stalled: f.stalled ? scrubTalk("Permission has been sitting a while. They may not have started building yet.") : "",
    linkLabel: f.url ? "See the official application" : "",
    url: f.url,
    low: !f.affordableUnknown && (f.affordablePct < 12 || f.socialHomes === 0),
    ok: !f.affordableUnknown && f.affordablePct >= 35,
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
  return `${shareOrigin()}/?app=${id}&scene=stack`;
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
  const origin = String(shareOrigin() || "").replace(/\/+$/, "");
  const url = `${origin}/`;
  const site = String(f.site || "this site").split(",")[0].trim() || "this site";
  const borough = f.borough || "London";
  const tags = civicHandles(civic, f.slug).join(" ");
  const n = copy.units;
  const x = copy.socialHomes;
  const y = copy.affordablePct;
  const civicWin = !!(copy.ok || (y != null && y >= 35));
  let facts;
  let askLine = "London asks 35% on bigger schemes. Does this do enough for people on the waiting list?";
  if (copy.unknown || y == null) {
    facts = n
      ? `${n} homes. The public record doesn't say how many would be social.`
      : "The public record doesn't say how many would be social.";
  } else if (civicWin) {
    facts = n
      ? `About ${x} of ${n} homes would be social (${y}%). That meets London's 35% ask. Proper homes for the list.`
      : "That meets London's 35% ask. Proper homes for the list.";
    askLine = "";
  } else if (y === 0 || x === 0) {
    facts = n
      ? `${n} homes, none for the waiting list (0% affordable).`
      : "None of these homes are for the waiting list (0% affordable).";
  } else {
    facts = n
      ? `About ${x} of ${n} homes would be social (${y}%).`
      : `This one is ${y}% affordable.`;
  }
  const lead = [`I played "Our Block" on ${site}, ${borough}.`, facts, askLine].filter(Boolean).join(" ");
  const text = [lead, `You can try this application here: ${url}`, tags].filter(Boolean).join("\n\n");
  return {
    title: scrubTalk(`Our Block: ${site}`),
    text: scrubTalk(text),
    url,
  };
}

function scrubTalk(s) {
  return String(s || "").replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s--\s/g, ". ");
}

export function civicLoseLine() {
  return scrubTalk("You stacked it, but this permission does almost nothing for social housing.");
}

export function civicFailRetryLine() {
  return scrubTalk("Have another go. This one actually has homes for the list.");
}

export function civicWinLine() {
  return scrubTalk("You stacked it. This one actually has homes for the list.");
}

export function talkLines(app) {
  const spec = challengeSpec(app);
  const src = sourceOf(app);
  const unknown = spec.unknown || spec.aff == null;
  const low = isLowSocial(app, spec);
  const last = "Have a look, then hit STACK.";
  const stack = "Let's get it stacked.";
  let lines;
  if (/refused/i.test(src)) {
    lines = [
      "They refused this. We're stacking what they said no to, not a live yes.",
      last,
    ];
  } else if (/council-led/i.test(src)) {
    lines = [
      "Council homes. I'm chuffed about that.",
      "Let's stack them well.",
      stack,
    ];
  } else if (unknown) {
    lines = [
      "They've not written the social homes down. That's a worry.",
      "If it's not on the record, we don't guess.",
      last,
    ];
  } else if (low) {
    lines = [
      "A thin slice for the list. I'm not happy.",
      "Glass and gold are the trap.",
      last,
    ];
  } else if (spec.aff >= 0.35) {
    lines = [
      "I'm chuffed. Keep the brick. That's homes for the list.",
      stack,
    ];
  } else {
    lines = [
      "Not nothing. There's some for the list.",
      "Not enough, though.",
      last,
    ];
  }
  return lines.map(scrubTalk);
}
