import fs from "node:fs";
import { initialState, applyDecision, proposalFrom, residentsFrom, makeDeal, negotiateYield } from "../src/sim.js";
import { pickDeck } from "../src/game.js";

const baseline = JSON.parse(fs.readFileSync("data/affordability-baseline.json", "utf8"));
const appsDoc = JSON.parse(fs.readFileSync("data/tower-hamlets-applications.json", "utf8"));
const deck = pickDeck(appsDoc.applications);
console.log("deck", deck.map((a) => [a.lpa_app_no, a.game.units, Math.round(a.game.affordablePct * 100) + "%", a.ward].join(" ")));

function run(label, decisions) {
  let state = initialState(baseline);
  for (let i = 0; i < 8; i++) {
    applyDecision(state, deck[i], decisions[i], baseline);
    if (state.over && i < 7) break;
  }
  const res = residentsFrom(state, baseline);
  console.log(
    label,
    "aff",
    state.affordableCompletions,
    "homes",
    state.totalHomes,
    "support",
    state.publicSupport,
    "rentIdx",
    state.rentIndex.toFixed(3),
    "priced",
    res.filter((r) => r.pricedOut).map((r) => r.id).join(",") || "none",
    "over",
    JSON.stringify(state.over)
  );
}

run("all-approve", Array(8).fill("approve"));
run("all-refuse", Array(8).fill("refuse"));
run("all-negotiate", Array(8).fill("negotiate"));
run("neg-majors", ["approve", "negotiate", "negotiate", "approve", "negotiate", "refuse", "negotiate", "negotiate"]);

const sample = deck[0];
function one(label, deal) {
  const state = initialState(baseline);
  applyDecision(state, sample, "negotiate", baseline, null, deal);
  const y = negotiateYield(sample, deal);
  const log = state.log[0];
  const homes = log.affordable + log.market;
  console.log(
    label,
    "yield",
    y.delivered,
    y.affordablePct,
    "applied",
    homes,
    log.affordablePct,
    "support",
    state.publicSupport,
    "overQ",
    state.quarter,
    state.over ? "ENDED_EARLY" : "ok",
    log.notes.slice(0, 120)
  );
  if (y.delivered !== homes) console.error("MISMATCH homes", y.delivered, homes);
  if ((y.collapse ? 0 : y.affordablePct) !== log.affordablePct) console.error("MISMATCH pct", y.affordablePct, log.affordablePct);
}
one("policy35-0", makeDeal("policy35", 0));
one("policy35-6pct", makeDeal("policy35", 10000));
one("squeeze50-lock", makeDeal("squeeze50", 0, true));
one("squeeze50-late", makeDeal("squeeze50", 10000, false));
one("smaller", makeDeal("smaller", 2000));
one("collapse", makeDeal("collapse", 15000));
