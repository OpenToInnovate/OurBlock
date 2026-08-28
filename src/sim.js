/** Committee-term simulation. Formulas are shown in the UI and DATA.md. */

export function takeHomeMonthly(gross, pensionPct = 0, tax = {}) {
  const pa = tax.personalAllowance ?? 12570;
  const rate = tax.basicRate ?? 0.2;
  const niRate = tax.employeeNi ?? 0.08;
  const niTh = tax.niThreshold ?? 12570;
  const pension = gross * pensionPct;
  const taxable = Math.max(0, gross - pension - pa);
  const taxPaid = taxable * rate;
  const ni = Math.max(0, gross - niTh) * niRate;
  return (gross - pension - taxPaid - ni) / 12;
}

export function proposalFrom(app) {
  const g = app.game || {};
  const desc = app.description || "";
  let affordablePct = g.affordablePct ?? 0;
  let units = g.units ?? 0;
  let luxury = !!g.luxury;
  if (/reduce the number of affordable/i.test(desc) || /increase the number of private homes/i.test(desc)) {
    affordablePct = Math.min(affordablePct, 0.18);
    luxury = true;
  }
  if (units >= 10 && affordablePct < 0.05) affordablePct = 0.2;
  return {
    units,
    unitsNet: g.unitsNet ?? units,
    affordablePct,
    luxury,
    constraints: g.constraints || {},
    londonPlanGap: Math.max(0, 0.35 - affordablePct),
  };
}

export function initialState(baseline) {
  const nurseGross = baseline.nursePay.usedInGame === "entryGross" ? baseline.nursePay.entryGross : 38488;
  const tax = baseline.takeHomeAssumptions;
  const nurse = takeHomeMonthly(nurseGross, baseline.residents.nurse.pensionPct, tax);
  const renter = takeHomeMonthly(baseline.residents.renter.gross, baseline.residents.renter.pensionPct, tax);
  const family = takeHomeMonthly(baseline.residents.family.grossEach, baseline.residents.family.pensionPct, tax) * 2;
  return {
    quarter: 0,
    quartersTotal: baseline.win?.quarters ?? 8,
    affordableCompletions: 0,
    marketHomes: 0,
    totalHomes: 0,
    publicSupport: 64,
    rentIndex: 1,
    priceIndex: 1,
    tenancyLag: baseline.thresholds.tenancyLagStart,
    stockGap: 0,
    heritageHarm: 0,
    familyLiveability: 0,
    warnings: { support: false, pricedOut: false, familyOut: false },
    over: null,
    log: [],
    nurseTakeHome: nurse,
    renterTakeHome: renter,
    familyTakeHome: family,
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function residentsFrom(state, baseline) {
  const pipr = baseline.pipr;
  const t = baseline.thresholds;
  const rent1 = pipr.oneBed * state.rentIndex;
  const rent3 = pipr.threeBed * state.rentIndex;
  const nurseRent = rent1 * baseline.residents.nurse.rentShareOfOneBed;
  const renterRent = rent1 * state.tenancyLag;
  const familyRent = rent3 * state.tenancyLag;
  const pack = (id, name, note, rent, takeHome, liveability = 0) => {
    const ratio = rent / takeHome - liveability * 0.012;
    return {
      id,
      name,
      note,
      rent,
      takeHome,
      ratio,
      stressed: ratio > t.stressRentToTakeHome,
      pricedOut: ratio > t.pricedOutRentToTakeHome,
    };
  };
  return [
    pack(
      "nurse",
      "Band 5 nurse",
      `Inner London entry \u00a3${baseline.nursePay.entryGross.toLocaleString("en-GB")}. Houseshare = 42% of 1-bed PIPR.`,
      nurseRent,
      state.nurseTakeHome
    ),
    pack(
      "renter",
      "Private renter",
      `1-bed sitting tenancy at ${(state.tenancyLag * 100).toFixed(0)}% of market. Modelled gross \u00a352,000.`,
      renterRent,
      state.renterTakeHome
    ),
    pack(
      "family",
      "Family of four",
      `3-bed sitting tenancy. Two Band 5 Inner entry salaries.`,
      familyRent,
      state.familyTakeHome,
      state.familyLiveability || 0
    ),
  ];
}

export const TABLE_MS = 15000;
export const STALL_MS = 5000;
const STALL_HOMES = [1, 0.94, 0.88, 0.82];

/** Timer stalls from elapsed ms. Each 5s = one stall ≈ +3% labelled build-cost. */
export function timerStalls(elapsedMs) {
  return Math.min(3, Math.floor(Math.max(0, elapsedMs) / STALL_MS));
}

/**
 * Deal at the s106 table.
 * squeeze50 starts at +1 stall. lockPct keeps 50% if they picked it before the 6% mark.
 */
export function makeDeal(kind, elapsedMs, squeezeLocked = false) {
  const tStalls = timerStalls(elapsedMs);
  if (kind === "collapse") {
    return { kind: "collapse", stalls: tStalls, costPct: tStalls * 3 };
  }
  const k = kind === "squeeze50" || kind === "smaller" ? kind : "policy35";
  let stalls = tStalls;
  if (k === "squeeze50") stalls = Math.min(3, stalls + 1);
  return {
    kind: k,
    stalls,
    costPct: stalls * 3,
    lockPct: k === "squeeze50" && !!squeezeLocked,
  };
}

/**
 * Pure s106 yield. Overlay live numbers and applyDecision share this.
 * Missing deal (smoke / old call) = Policy 35% at 0 stalls.
 */
export function negotiateYield(app, deal) {
  const p = proposalFrom(app);
  const c = p.constraints;
  const units = p.units;
  const minor = units > 0 && units < 10;
  const d = deal && deal.kind ? deal : { kind: "policy35", stalls: 0, costPct: 0 };

  if (d.kind === "collapse") {
    return {
      collapse: true,
      delivered: 0,
      affordablePct: 0,
      affordable: 0,
      market: 0,
      luxury: false,
      supportDelta: -3,
      costPct: d.costPct ?? 0,
      stalls: d.stalls ?? 0,
      minor,
      notes: ["Talks collapsed. Developer walks. They can appeal. The 3,096 get 0 this quarter."],
    };
  }

  let factor;
  let affordablePct;
  let supportDelta;
  const notes = [];

  if (d.kind === "squeeze50") {
    factor = 0.74;
    affordablePct = 0.5;
    supportDelta = 4;
    notes.push("s106: 50% GLA-style. Public-land aspiration. They'll fight.");
  } else if (d.kind === "smaller") {
    factor = 0.7;
    affordablePct = Math.max(0.35, p.affordablePct);
    supportDelta = 2;
    notes.push("s106: smaller building. Lose a floor, keep the neighbours, maybe keep 35%.");
  } else {
    factor = 0.82;
    affordablePct = 0.35;
    supportDelta = 3;
    notes.push("s106: 35% London Plan H5. Take 35% and sign. Real policy, not a favour.");
  }

  if (d.kind === "smaller" && (c.conservation || c.listed)) {
    supportDelta += 2;
    notes.push("Heritage-friendly cut.");
  } else if (d.kind !== "smaller" && (c.conservation || c.listed)) {
    factor *= 0.9;
    notes.push("Heritage makes the S106 slower.");
  }
  if (c.brownfield) {
    const cap = d.kind === "smaller" ? 0.78 : 0.9;
    factor = Math.min(cap, factor + 0.04);
  }

  const stalls = Math.max(0, Math.min(3, d.stalls ?? 0));
  const costPct = d.costPct ?? stalls * 3;
  factor *= STALL_HOMES[stalls];

  const locked = d.kind === "squeeze50" && d.lockPct;
  if (stalls >= 2 && !locked) {
    const cut = stalls >= 3 ? 0.1 : 0.05;
    affordablePct = Math.max(0.2, affordablePct - cut);
    notes.push(`Viability cut \u2212${Math.round(cut * 100)} points (labelled scenario, not a forecast).`);
  }

  const delivered = Math.round(units * factor);
  const affordable = Math.round(delivered * affordablePct);
  if (minor) {
    notes.push("Under 10 homes: H5 35% often does not bite. Still a deal — wheelchair unit / extra affordable.");
  }
  notes.push(
    `Delay +${costPct}% labelled build-cost · ${stalls} stall${stalls === 1 ? "" : "s"} · ${delivered} homes this term at ${Math.round(affordablePct * 100)}% affordable.`
  );

  return {
    collapse: false,
    delivered,
    affordablePct,
    affordable,
    market: delivered - affordable,
    luxury: false,
    supportDelta,
    costPct,
    stalls,
    minor,
    notes,
  };
}

export function applyDecision(state, app, decision, baseline, place = null, deal = null) {
  const p = proposalFrom(app);
  const c = p.constraints;
  let units = p.units;
  let affordablePct = p.affordablePct;
  let luxury = p.luxury;
  let supportDelta = 0;
  let rentDelta = 0;
  let priceDelta = 0;
  let lagDelta = 0;
  let delivered = 0;
  let collapse = false;
  const notes = [];
  if (decision !== "negotiate") deal = null;

  if (decision === "approve") {
    delivered = units;
    rentDelta += 0.003 + (luxury ? 0.01 : 0) + (units * (1 - affordablePct)) / 12000;
    priceDelta += luxury ? 0.01 : 0.003;
    lagDelta += luxury ? 0.02 : 0.006;
    if (affordablePct >= 0.35) {
      supportDelta += 5;
      notes.push("Meets London Plan 35%.");
    } else if (units >= 10) {
      supportDelta -= 3;
      notes.push("Below 35% affordable.");
    }
    if (luxury) {
      supportDelta -= 4;
      notes.push("Luxury pipeline: rent pressure up.");
    }
    if (c.conservation && units >= 15) {
      supportDelta -= 5;
      state.heritageHarm += 1;
      notes.push("Harm in a conservation area.");
    }
    if (c.listed && units >= 8) {
      supportDelta -= 3;
      state.heritageHarm += 1;
      notes.push("Setting of a listed building.");
    }
    if (c.article4) {
      supportDelta -= 1;
      notes.push("Article 4 removes PD fallback.");
    }
    if (c.brownfield) {
      supportDelta += 3;
      rentDelta -= 0.003;
      notes.push("Brownfield: easier civic case.");
    }
    if (units >= 200 && affordablePct < 0.25) supportDelta -= 3;
  } else if (decision === "refuse") {
    state.stockGap += units;
    rentDelta += 0.004 + units / 20000;
    lagDelta += 0.008;
    priceDelta -= 0.002;
    if (affordablePct >= 0.35 && units >= 40) {
      supportDelta -= 9;
      notes.push("Refused a large affordable scheme.");
    } else if (luxury) {
      supportDelta += 6;
      notes.push("Luxury refused; residents cheer, stock still tight.");
    } else {
      supportDelta -= 2;
      notes.push("Supply stagnates.");
    }
    if (c.conservation || c.listed) {
      supportDelta += 3;
      notes.push("Heritage lobby relieved.");
    }
    if (units >= 200) supportDelta -= 2;
  } else {
    // negotiate: s106 table. Missing deal = Policy 35% at 0 stalls.
    const y = negotiateYield(app, decision === "negotiate" ? deal : null);
    collapse = y.collapse;
    delivered = y.delivered;
    affordablePct = y.affordablePct;
    luxury = false;
    supportDelta = y.supportDelta;
    notes.push(...y.notes);
    if (y.collapse) {
      state.stockGap += units;
      rentDelta += 0.002;
      lagDelta += 0.004;
    } else {
      rentDelta += 0.002 + (delivered * (1 - affordablePct)) / 14000;
      lagDelta += 0.004;
    }
  }

  // Soften rent / lag / support so Q3 is not a death spiral. Play all 8, then score.
  rentDelta *= 0.5;
  lagDelta *= 0.5;
  supportDelta = Math.round(supportDelta * 0.6);

  const built = decision !== "refuse" && !collapse;
  if (place && built) {
    state.familyLiveability = clamp((state.familyLiveability || 0) + (place.liveability || 0) * 0.35, -3, 3);
    rentDelta += place.rentBump || 0;
  } else if (place && !built && place.schoolHalo && place.hospitalSweet) {
    state.familyLiveability = clamp((state.familyLiveability || 0) - 0.25, -3, 3);
  }

  const affordable = built ? Math.round(delivered * affordablePct) : 0;
  const market = built ? delivered - affordable : 0;
  state.affordableCompletions += affordable;
  state.marketHomes += market;
  state.totalHomes += delivered;
  state.rentIndex = Math.max(0.9, state.rentIndex * (1 + rentDelta));
  state.priceIndex = Math.max(0.85, state.priceIndex * (1 + priceDelta));
  state.tenancyLag = clamp(state.tenancyLag + lagDelta, 0.8, 1);
  state.publicSupport = clamp(Math.round(state.publicSupport + supportDelta), 0, 100);
  state.quarter += 1;

  const res = residentsFrom(state, baseline);
  const pricedOut = res.filter((r) => r.pricedOut).length;
  const family = res.find((r) => r.id === "family");
  state.warnings = {
    support: state.publicSupport <= 20,
    pricedOut: pricedOut >= 2,
    familyOut: !!(family && family.pricedOut),
  };

  let over = null;
  if (state.quarter >= state.quartersTotal) {
    const hitPace = state.affordableCompletions >= baseline.win.affordableCompletions;
    const familyOk = !(family && family.pricedOut);
    const supportOk = state.publicSupport > 20;
    if (hitPace && familyOk && supportOk) {
      over = {
        win: true,
        reason: `Hit the 2023–24 pace: ${state.affordableCompletions} affordable homes. A family still in. Support ${state.publicSupport}.`,
      };
    } else {
      const bits = [];
      if (!hitPace) bits.push(`missed 432 (${state.affordableCompletions})`);
      if (!familyOk) bits.push("a family priced out");
      if (!supportOk) bits.push(`support ${state.publicSupport}`);
      over = {
        win: false,
        reason: `Term scored. ${bits.join("; ")}.`,
        score: {
          affordable: state.affordableCompletions,
          support: state.publicSupport,
          familyPricedOut: !familyOk,
        },
      };
    }
  }
  state.over = over;
  state.log.unshift({
    quarter: state.quarter,
    decision,
    ref: app.lpa_app_no,
    affordable,
    market,
    support: state.publicSupport,
    notes: notes.join(" "),
    affordablePct: built ? affordablePct : 0,
    deal: decision === "negotiate" ? deal || { kind: "policy35", stalls: 0, costPct: 0 } : null,
  });
  return state;
}

/** Clone, run the same decision math, return deltas. Does not mutate the live state. */
export function previewDecision(state, app, decision, baseline, place = null, deal = null) {
  const next = JSON.parse(JSON.stringify(state));
  applyDecision(next, app, decision, baseline, place, deal);
  const beforeRes = residentsFrom(state, baseline);
  const afterRes = residentsFrom(next, baseline);
  const homes = next.totalHomes - state.totalHomes;
  const affordable = next.affordableCompletions - state.affordableCompletions;
  const support = next.publicSupport - state.publicSupport;
  const pricedNew = afterRes.filter((r, i) => r.pricedOut && !beforeRes[i].pricedOut);
  const stressUp = afterRes.some((r, i) => r.ratio > beforeRes[i].ratio + 0.0008);
  const verb = decision === "approve" ? "Approve" : decision === "refuse" ? "Refuse" : "Negotiate";
  const bits = [`${homes >= 0 ? "+" : ""}${homes} homes`, `${affordable} affordable`];
  if (pricedNew.length) bits.push("someone priced out");
  else if (stressUp) bits.push("renter stress up");
  else if (support < 0) bits.push(`support ${support}`);
  else if (support > 0) bits.push(`support +${support}`);
  return {
    homes,
    affordable,
    support,
    nurseRent: afterRes[0].rent - beforeRes[0].rent,
    line: `${verb}: ${bits.join(", ")}`,
    notes: next.log[0]?.notes || "",
    affordablePct: next.log[0]?.affordablePct ?? 0,
    deal: next.log[0]?.deal || null,
  };
}

/** Overlay live line — same homes / % as applyDecision, no state clone. */
export function dealPreview(app, deal) {
  return negotiateYield(app, deal);
}
