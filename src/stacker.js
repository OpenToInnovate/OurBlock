/** Our Block stacker. Crane at the top of the viewport. Pieces are storeys. */

import { challengeSpec, floorKind } from "./talk.js?v=ob2";

const BLOCK_H = 56;
const HOOK_Y = 22;
const CABLE = 44;
const MIN_OVERLAP = 12;

function baseWidth(spec, canvasW) {
  let w = Math.min(248, Math.round(canvasW * 0.44));
  if (spec.tight) w = Math.round(w * 0.72);
  if (spec.brown) w = Math.round(w * 1.12);
  if (spec.luxury) w = Math.round(w * 0.82);
  return Math.max(86, w);
}

function plinthTop(H) {
  return Math.round(H * 0.6);
}

function shade(hex, amt) {
  const n = hex.replace("#", "");
  const r = Math.max(0, Math.min(255, parseInt(n.slice(0, 2), 16) + amt));
  const g = Math.max(0, Math.min(255, parseInt(n.slice(2, 4), 16) + amt));
  const b = Math.max(0, Math.min(255, parseInt(n.slice(4, 6), 16) + amt));
  return `rgb(${r},${g},${b})`;
}

function windowCols(x, w, module = 30) {
  const xs = [];
  const start = Math.ceil((x + 8) / module) * module;
  for (let xx = start; xx + 16 < x + w - 6; xx += module) xs.push(xx);
  if (!xs.length && w > 28) xs.push(x + w / 2 - 7);
  return xs;
}

function clipStorey(ctx, x, y, w, h, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  draw();
  ctx.restore();
}

function brickCourses(ctx, x, y, w, h, brick, mortar, course = 5, stretch = 15) {
  ctx.fillStyle = brick;
  ctx.fillRect(x, y, w, h);
  for (let row = 0, yy = y; yy < y + h; row++, yy += course) {
    ctx.fillStyle = row % 6 === 5 ? shade(brick, -18) : mortar;
    ctx.fillRect(x, yy + course - 1, w, 1);
    const off = row % 2 ? stretch / 2 : 0;
    ctx.fillStyle = mortar;
    for (let xx = x + off; xx < x + w; xx += stretch) {
      ctx.fillRect(xx, yy, 1, course);
    }
  }
}

function leftLight(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, "rgba(255,244,220,0.22)");
  g.addColorStop(0.28, "rgba(255,244,220,0.05)");
  g.addColorStop(0.72, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function glassPane(ctx, x, y, w, h, night) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, night ? "#3a4e58" : "#6a8a96");
  g.addColorStop(0.35, night ? "#1a2830" : "#3d5560");
  g.addColorStop(1, night ? "#0c1418" : "#24343c");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(220,236,255,0.18)";
  ctx.fillRect(x, y, Math.max(2, w * 0.28), h);
}

function drawSocial(ctx, b, y, spec, isTop) {
  const { x, w } = b;
  const h = b.h || BLOCK_H;
  const concrete = !!spec.brown;
  clipStorey(ctx, x, y, w, h, () => {
    if (concrete) {
      ctx.fillStyle = "#b4aea4";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#9e9890";
      for (let yy = y + 6; yy < y + h; yy += 8) ctx.fillRect(x, yy, w, 1);
      ctx.fillStyle = "#c8c2b8";
      ctx.fillRect(x, y, 5, h);
    } else {
      brickCourses(ctx, x, y, w, h, "#c49a52", "#e6d4b0", 5, 14);
      ctx.fillStyle = "#8a6a32";
      ctx.fillRect(x, y + h - 3, w, 3);
    }
    leftLight(ctx, x, y, w, h);

    const cols = windowCols(x, w, 28);
    const winH = 22;
    const winW = 11;
    const winY = y + 10;
    for (const cx of cols) {
      ctx.fillStyle = "#efe6d6";
      ctx.fillRect(cx - 2, winY - 2, winW + 4, winH + 4);
      glassPane(ctx, cx, winY, winW, winH, false);
      ctx.fillStyle = "#efe6d6";
      ctx.fillRect(cx + 5, winY, 1, winH);
      ctx.fillRect(cx, winY + 10, winW, 1);
    }

    const railY = y + h - 13;
    ctx.fillStyle = concrete ? "#c4c0b6" : "#c8b8a4";
    ctx.fillRect(x, railY + 8, w, 5);
    ctx.strokeStyle = "#2a2c2e";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 2, railY);
    ctx.lineTo(x + w - 2, railY);
    ctx.stroke();
    for (let i = 0; i < cols.length; i++) {
      const px = cols[i] + 5;
      ctx.beginPath();
      ctx.moveTo(px, railY);
      ctx.lineTo(px, railY + 8);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x + 2, railY + 8);
    ctx.lineTo(x + w - 2, railY + 8);
    ctx.stroke();
  });
  if (isTop) {
    ctx.fillStyle = concrete ? "#d0ccc4" : "#a07a3c";
    ctx.fillRect(x - 1, y, w + 2, 4);
    ctx.fillStyle = concrete ? "#ece8e0" : "#d4b46a";
    ctx.fillRect(x - 1, y, w + 2, 1);
  }
}

function drawMixed(ctx, b, y, spec, isTop) {
  const { x, y: _y, w } = b;
  const h = b.h || BLOCK_H;
  clipStorey(ctx, x, y, w, h, () => {
    brickCourses(ctx, x, y, w, h, "#c2b492", "#e0d6c0", 5, 16);
    ctx.fillStyle = "#9a9a94";
    ctx.fillRect(x, y + h - 4, w, 4);
    leftLight(ctx, x, y, w, h);
    const cols = windowCols(x, w, 32);
    const winW = 14;
    const winH = 26;
    const winY = y + 12;
    for (const cx of cols) {
      ctx.fillStyle = "#6a6862";
      ctx.fillRect(cx - 2, winY - 2, winW + 4, winH + 3);
      ctx.fillStyle = "#4a4844";
      ctx.fillRect(cx - 1, winY - 1, winW + 2, winH + 1);
      glassPane(ctx, cx, winY, winW, winH, false);
    }
  });
  if (isTop) {
    ctx.fillStyle = "#d8d0be";
    ctx.fillRect(x - 1, y, w + 2, 4);
    ctx.fillStyle = "#f0eadc";
    ctx.fillRect(x - 1, y, w + 2, 1);
  }
}

function drawLuxury(ctx, b, y, spec, isTop) {
  const { x, w } = b;
  const h = b.h || BLOCK_H;
  clipStorey(ctx, x, y, w, h, () => {
    const bg = ctx.createLinearGradient(x, y, x + w, y);
    bg.addColorStop(0, "#243038");
    bg.addColorStop(0.4, "#151c22");
    bg.addColorStop(1, "#0a1014");
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);

    const module = 20;
    const start = Math.ceil((x + 4) / module) * module;
    for (let xx = start; xx < x + w - 6; xx += module) {
      glassPane(ctx, xx + 2, y + 5, 14, h - 10, true);
      ctx.fillStyle = "#b08a3e";
      ctx.fillRect(xx, y + 4, 2, h - 8);
    }
    ctx.fillStyle = "#c4a050";
    ctx.fillRect(x, y + 4, w, 2);
    ctx.fillRect(x, y + h - 8, w, 2);
    ctx.fillStyle = "rgba(255,220,140,0.12)";
    ctx.fillRect(x, y, 6, h);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x + w - 5, y, 5, h);
  });
  if (isTop) {
    ctx.fillStyle = "#d4b46a";
    ctx.fillRect(x - 1, y, w + 2, 4);
    ctx.fillStyle = "#f0d890";
    ctx.fillRect(x - 1, y, w + 2, 1);
  }
}

function drawStorey(ctx, b, y, spec, isTop) {
  if (b.kind === "luxury") drawLuxury(ctx, b, y, spec, isTop);
  else if (b.kind === "mixed") drawMixed(ctx, b, y, spec, isTop);
  else drawSocial(ctx, b, y, spec, isTop);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x + 0.5, y + 0.5, b.w - 1, (b.h || BLOCK_H) - 1);
}

function drawPlinth(ctx, spec, W, top) {
  const bw = baseWidth(spec, W);
  const extra = spec.brown ? 26 : spec.tight ? 10 : 16;
  const pw = bw + extra;
  const px = W / 2 - pw / 2;
  ctx.fillStyle = "#6e6a64";
  ctx.fillRect(px - 8, top + 12, pw + 16, 16);
  ctx.fillStyle = "#8a8680";
  ctx.fillRect(px - 3, top, pw + 6, 14);
  ctx.fillStyle = "#a8a49c";
  ctx.fillRect(px, top, pw, 4);
  const lg = ctx.createLinearGradient(px, top, px + pw, top);
  lg.addColorStop(0, "rgba(255,255,255,0.2)");
  lg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = lg;
  ctx.fillRect(px - 3, top, pw + 6, 14);
  ctx.fillStyle = "#2a2c2e";
  ctx.fillRect(px + pw * 0.42, top + 2, Math.max(16, pw * 0.16), 12);
}

function drawHook(ctx, W, hx, blockTop) {
  ctx.fillStyle = "#6a5840";
  ctx.fillRect(0, 6, W, 10);
  ctx.fillStyle = "#c4a574";
  ctx.fillRect(0, 6, W, 7);
  ctx.fillStyle = "#8a7348";
  ctx.fillRect(0, 13, W, 2);
  ctx.fillStyle = "#2a2418";
  for (let x = 18; x < W; x += 46) ctx.fillRect(x, 7, 3, 6);

  ctx.fillStyle = "#e0c888";
  ctx.fillRect(hx - 18, 3, 36, 16);
  ctx.fillStyle = "#8a7040";
  ctx.fillRect(hx - 18, 3, 36, 3);
  ctx.fillStyle = "#2a2418";
  ctx.fillRect(hx - 3, 8, 6, 10);

  ctx.strokeStyle = "#f2e6c4";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hx, 18);
  ctx.lineTo(hx, blockTop);
  ctx.stroke();

  ctx.strokeStyle = "#f0d090";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hx, blockTop + 2, 7, Math.PI * 0.15, Math.PI * 0.95, false);
  ctx.stroke();
}

export function createStacker(canvas, app, onDone) {
  const spec = challengeSpec(app);
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let running = false;
  let W = 360;
  let H = 640;
  let hp = 3;
  let social = 0;
  let combo = 0;
  let stacked = [];
  let phase = "swing";
  let t = 0;
  let last = 0;
  let drop = null;
  let cam = 0;
  let flash = "";
  let flashT = 0;
  let over = false;
  let frozen = false;
  let armed = false;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function hookSpeed() {
    let s = 1.08 + stacked.length * 0.05;
    if (spec.luxury) s *= 1.22;
    if (drop && drop.kind === "luxury") s *= 1.12;
    return Math.min(2.15, s);
  }

  function swingAmp() {
    return Math.min(W * 0.3, 132) * (1 + Math.min(0.28, stacked.length * 0.035));
  }

  function makeBlock() {
    const i = stacked.length;
    const kind = floorKind(i, spec);
    let w = stacked.length ? stacked[stacked.length - 1].w : baseWidth(spec, W);
    if (kind === "luxury") w = Math.max(70, Math.round(w * (spec.luxury ? 0.88 : 0.92)));
    if (kind === "mixed" && stacked.length) w = Math.max(74, Math.round(w * 0.96));
    return { kind, w, x: W / 2 - w / 2, y: 0, h: BLOCK_H, vy: 0 };
  }

  function swingX() {
    return W / 2 + Math.sin(t * hookSpeed()) * swingAmp() - (drop ? drop.w / 2 : 0);
  }

  function paintHud() {
    const s = document.getElementById("stack-social");
    const h = document.getElementById("stack-hp");
    const f = document.getElementById("stack-floors");
    const site = document.getElementById("stack-site");
    if (s) s.textContent = `Social ${social}`;
    if (h) h.textContent = "\u2665".repeat(hp) + "\u2661".repeat(Math.max(0, 3 - hp));
    if (f) f.textContent = `${stacked.length} / ${spec.floors}`;
    if (site) site.textContent = app?.site_name || app?.game?.plainAsk || "";
  }

  function finish(won) {
    if (over) return;
    over = true;
    phase = won ? "win" : "lose";
    flash = won ? "Homes up." : "Missed the stack.";
    flashT = 1.6;
    setTimeout(() => {
      stop();
      onDone?.({ social, won, floors: stacked.length, spec });
    }, 900);
  }

  function land(block, x, y, prev) {
    let nx = x;
    let nw = block.w;
    let perfect = true;
    if (prev) {
      const left = Math.max(x, prev.x);
      const right = Math.min(x + block.w, prev.x + prev.w);
      const overlap = right - left;
      if (overlap < MIN_OVERLAP) return false;
      nx = left;
      nw = overlap;
      perfect = Math.abs(x - prev.x) < 7 && Math.abs(block.w - prev.w) < 10;
    }
    stacked.push({ x: nx, y, w: nw, h: BLOCK_H, kind: block.kind });
    if (block.kind === "social") {
      const gain = spec.homesPerLime || 1;
      social += gain;
      if (perfect) {
        combo += 1;
        social += 2 + Math.max(0, combo - 1);
        flash = combo > 1 ? `Perfect \u00d7${combo}` : "Perfect \u00b7 social";
      } else {
        combo = 0;
        flash = `+${gain} social`;
      }
    } else if (block.kind === "luxury") {
      combo = 0;
      flash = perfect ? "Landed glass. 0 homes." : "Private floor. 0 for the list.";
    } else {
      combo = 0;
      flash = perfect ? "Mixed floor. Still private." : "Buff brick. 0 for the list.";
    }
    flashT = 0.9;
    if (stacked.length >= spec.floors) finish(true);
    else {
      phase = "swing";
      drop = makeBlock();
    }
    paintHud();
    return true;
  }

  function miss() {
    hp -= 1;
    combo = 0;
    flash = "Miss";
    flashT = 0.7;
    paintHud();
    if (hp <= 0) finish(false);
    else {
      phase = "swing";
      drop = makeBlock();
    }
  }

  function nextLandY() {
    const prev = stacked[stacked.length - 1];
    if (prev) return prev.y - BLOCK_H;
    return plinthTop(H) - BLOCK_H;
  }

  function draw(dt) {
    t += dt;
    if (flashT > 0) flashT -= dt;
    ctx.clearRect(0, 0, W, H);

    const wash = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.12, W / 2, H * 0.5, H * 0.9);
    wash.addColorStop(0, "rgba(10,16,20,0)");
    wash.addColorStop(0.62, "rgba(10,16,20,0.04)");
    wash.addColorStop(1, "rgba(8,12,16,0.18)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);

    const topY = stacked.length ? stacked[stacked.length - 1].y : plinthTop(H);
    const wantCam = H * 0.4 - topY;
    cam += (wantCam - cam) * Math.min(1, dt * 4);

    ctx.save();
    ctx.translate(0, cam);

    drawPlinth(ctx, spec, W, plinthTop(H));
    for (let i = 0; i < stacked.length; i++) {
      drawStorey(ctx, stacked[i], stacked[i].y, spec, i === stacked.length - 1 && phase !== "drop");
    }

    if (phase === "drop" && drop) {
      if (!frozen) {
        drop.vy = (drop.vy || 0) + 1760 * dt;
        drop.y += drop.vy * dt;
      }
      drawStorey(ctx, drop, drop.y, spec, true);
      const target = nextLandY();
      if (drop.y >= target) {
        const prev = stacked[stacked.length - 1];
        const ok = land(drop, drop.x, target, prev);
        if (!ok) miss();
      } else if (drop.y > plinthTop(H) + 80) {
        miss();
      }
    }

    ctx.restore();

    if (phase === "swing" && drop) {
      drop.x = swingX();
      const sy = HOOK_Y + CABLE;
      drawHook(ctx, W, drop.x + drop.w / 2, sy);
      drawStorey(ctx, drop, sy, spec, true);
    } else if (phase === "drop" && drop) {
      drawHook(ctx, W, drop.x + drop.w / 2, Math.min(HOOK_Y + CABLE, drop.y + cam));
    } else {
      drawHook(ctx, W, W / 2, HOOK_Y + CABLE);
    }

    if (flashT > 0 && flash) {
      ctx.fillStyle = "#e8f6dc";
      ctx.font = "700 22px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 8;
      ctx.fillText(flash, W / 2, 108);
      ctx.shadowBlur = 0;
    }
    if (over) {
      ctx.fillStyle = "rgba(13,27,22,0.55)";
      ctx.fillRect(0, H * 0.4, W, 80);
      ctx.fillStyle = "#c8f542";
      ctx.font = "700 28px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(phase === "win" ? "STACKED" : "FALLEN", W / 2, H * 0.4 + 50);
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function tryDrop() {
    if (!armed || over || phase !== "swing" || !drop) return;
    phase = "drop";
    drop.y = HOOK_Y + CABLE - cam;
    drop.vy = 50;
  }

  function onPtr(ev) {
    ev.preventDefault();
    tryDrop();
  }

  function onKey(ev) {
    if (ev.code === "Space" || ev.key === " ") {
      ev.preventDefault();
      tryDrop();
    }
  }

  function seedFloors(n) {
    stacked = [];
    social = 0;
    combo = 0;
    const count = Math.max(0, Math.min(Number(n) || 0, spec.floors));
    const bw = baseWidth(spec, W);
    for (let i = 0; i < count; i++) {
      const kind = floorKind(i, spec);
      const y = plinthTop(H) - (i + 1) * BLOCK_H;
      stacked.push({ x: W / 2 - bw / 2, y, w: bw, h: BLOCK_H, kind });
      if (kind === "social") social += spec.homesPerLime || 1;
    }
    over = false;
    phase = stacked.length >= spec.floors ? "win" : "swing";
    drop = phase === "swing" ? makeBlock() : null;
    const topY = stacked.length ? stacked[stacked.length - 1].y : plinthTop(H);
    cam = H * 0.4 - topY;
    paintHud();
  }

  function debugMidDrop(opts = {}) {
    if (!drop) drop = makeBlock();
    drop.x = W / 2 - drop.w / 2 + Math.min(48, W * 0.08);
    drop.y = H * 0.22 - cam;
    drop.vy = opts.freeze ? 0 : 180;
    phase = "drop";
    if (opts.freeze) frozen = true;
  }

  function start() {
    resize();
    running = true;
    over = false;
    hp = 3;
    social = 0;
    combo = 0;
    stacked = [];
    phase = "swing";
    t = 0;
    cam = 0;
    drop = makeBlock();
    armed = false;
    paintHud();
    last = performance.now();
    setTimeout(() => { armed = true; }, 280);
    window.addEventListener("resize", resize);
    canvas.addEventListener("pointerdown", onPtr, { passive: false });
    const overlay = canvas.parentElement;
    if (overlay && overlay !== canvas) overlay.addEventListener("pointerdown", onPtr, { passive: false });
    window.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("pointerdown", onPtr);
    const overlay = canvas.parentElement;
    if (overlay) overlay.removeEventListener("pointerdown", onPtr);
    window.removeEventListener("keydown", onKey);
  }

  return {
    start,
    stop,
    drop: tryDrop,
    seedFloors,
    debugMidDrop,
    freezePlay: () => debugMidDrop({ freeze: true }),
    spec,
    state: () => ({ phase, hp, social, floors: stacked.length, cam, over, kind: drop?.kind }),
  };
}
