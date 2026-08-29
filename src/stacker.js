/** Our Block stacker. Crane at the top of the viewport. Pieces are storeys. */

import { challengeSpec, floorKind } from "./talk.js?v=ob6";
import { maxSocial } from "./progress.js?v=ob6";
import {
  BLOCK_H,
  drawStorey,
  drawPlinth,
  drawHook,
  drawDebris,
} from "./stack-draw.js?v=ob6";
import {
  playCheer,
  playLose,
  playRelease,
  playThud,
  playSmash,
  spawnBurst,
  updateParticles,
  drawParticles,
} from "./stack-fx.js?v=ob6";

const HOOK_Y = 22;
const CABLE = 44;
const MIN_OVERLAP = 12;
const RUBBLE_PX = 40;

function baseWidth(spec, canvasW) {
  let w = Math.min(248, Math.round(canvasW * 0.44));
  if (spec.tight) w = Math.round(w * 0.72);
  if (spec.brown) w = Math.round(w * 1.12);
  if (spec.luxury) w = Math.round(w * 0.82);
  return Math.max(86, w);
}

function plinthTop(H) {
  return Math.round(H * 0.72);
}

function stampPiece(kind, x, w, y, extra = {}) {
  return {
    kind,
    x,
    w,
    y,
    h: BLOCK_H,
    vy: 0,
    textureOriginX: extra.textureOriginX ?? 0,
    u0: extra.u0 ?? 0,
    fullWidth: extra.fullWidth ?? w,
  };
}

export function createStacker(canvas, app, onDone) {
  const spec = challengeSpec(app);
  const maxHomes = maxSocial(spec);
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let running = false;
  let W = 360;
  let H = 640;
  let hp = 3;
  let social = 0;
  let combo = 0;
  let rubblePx = 0;
  let stacked = [];
  let debris = [];
  let rubble = [];
  let particles = [];
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
  let winT = 0;
  let winShown = 0;
  let skipWin = false;
  let endSent = false;

  function viewportSize() {
    const host = canvas.parentElement || canvas;
    const vv = window.visualViewport;
    const w = host.clientWidth || Math.round(vv?.width || window.innerWidth);
    const h = host.clientHeight || Math.round(vv?.height || window.innerHeight);
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sz = viewportSize();
    W = sz.w;
    H = sz.h;
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
    const lastTop = stacked[stacked.length - 1];
    const w = lastTop ? lastTop.w : baseWidth(spec, W);
    const x = W / 2 - w / 2;
    return stampPiece(kind, x, w, 0, lastTop
      ? { textureOriginX: lastTop.textureOriginX, u0: lastTop.u0, fullWidth: lastTop.fullWidth }
      : { textureOriginX: 0, u0: 0, fullWidth: w });
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
    if (h) h.textContent = "♥".repeat(hp) + "♡".repeat(Math.max(0, 3 - hp));
    if (f) f.textContent = `${stacked.length} / ${spec.floors}`;
    if (site) site.textContent = app?.site_name || app?.game?.plainAsk || "";
  }

  function result(won) {
    return {
      social,
      won,
      floors: stacked.length,
      spec,
      rubble: rubblePx,
      max: maxHomes,
    };
  }

  function sendDone(won) {
    if (endSent) return;
    endSent = true;
    stop();
    onDone?.(result(won));
  }

  function startWinFx() {
    winT = 0;
    winShown = 0;
    skipWin = false;
    spawnBurst(particles, W, H, W * 0.5, H * 0.28, 42);
    spawnBurst(particles, W, H, W * 0.22, H * 0.2, 28);
    spawnBurst(particles, W, H, W * 0.78, H * 0.22, 28);
    spawnBurst(particles, W, H, W * 0.4, H * 0.16, 18);
    playCheer();
  }

  function finish(won) {
    if (over) return;
    over = true;
    phase = won ? "win" : "lose";
    flash = won ? "STACKED" : "Missed the stack.";
    flashT = won ? 3 : 1.1;
    if (won) startWinFx();
    else {
      playLose();
      setTimeout(() => sendDone(false), 720);
    }
  }

  function pileSpot(side, w) {
    const base = stacked[0] || { x: W / 2 - 40, w: 80 };
    const heap = rubble.filter((r) => r.side === side);
    let hy = plinthTop(H) + 6;
    for (const r of heap) hy -= Math.min(16, 7 + r.w * 0.08);
    const x = side < 0 ? base.x - 12 - w : base.x + base.w + 12;
    return { x, y: hy - BLOCK_H * 0.55, rot: side * (0.35 + Math.random() * 0.25) };
  }

  function spawnSlice(src, x, w, u0, side, y) {
    if (w < 5) return;
    const bit = stampPiece(src.kind, x, w, y, {
      textureOriginX: src.textureOriginX,
      u0,
      fullWidth: src.fullWidth,
    });
    bit.side = side;
    bit.vx = side * (90 + Math.random() * 70);
    bit.vy = 30 + Math.random() * 40;
    bit.rot = 0;
    bit.vr = side * (1.8 + Math.random() * 1.6);
    bit.falling = true;
    debris.push(bit);
  }

  function applyWaste(px) {
    if (px < 6) return 0;
    rubblePx += px;
    const waste = Math.max(1, Math.round(px / RUBBLE_PX));
    social = Math.max(0, social - waste);
    flash = `Rubble −${waste}`;
    flashT = 1.05;
    return waste;
  }

  function land(block, x, y, prev) {
    let nx = x;
    let nw = block.w;
    let u0 = block.u0 || 0;
    let perfect = true;
    let chopped = 0;
    if (prev) {
      const left = Math.max(x, prev.x);
      const right = Math.min(x + block.w, prev.x + prev.w);
      const overlap = right - left;
      if (overlap < MIN_OVERLAP) return false;
      const leftHang = left - x;
      const rightHang = x + block.w - right;
      if (leftHang > 4) {
        spawnSlice(block, x, leftHang, block.u0 || 0, -1, y);
        chopped += leftHang;
      }
      if (rightHang > 4) {
        spawnSlice(block, right, rightHang, (block.u0 || 0) + (right - x), 1, y);
        chopped += rightHang;
      }
      nx = left;
      nw = overlap;
      u0 = (block.u0 || 0) + (left - x);
      perfect = Math.abs(x - prev.x) < 7 && Math.abs(block.w - prev.w) < 10 && chopped < 8;
    }
    stacked.push(stampPiece(block.kind, nx, nw, y, {
      textureOriginX: block.textureOriginX,
      u0,
      fullWidth: block.fullWidth || block.w,
    }));
    if (block.kind === "social") {
      const gain = spec.homesPerLime || 1;
      social += gain;
      if (perfect) {
        combo += 1;
        social += 2 + Math.max(0, combo - 1);
        flash = combo > 1 ? `Perfect ×${combo}` : "Perfect · social";
      } else {
        combo = 0;
        flash = `+${gain} social`;
      }
      flashT = 0.9;
    } else if (block.kind === "luxury") {
      combo = 0;
      flash = perfect ? "Landed glass. 0 homes." : "Private floor. 0 for the list.";
      flashT = 0.9;
    } else {
      combo = 0;
      flash = perfect ? "Mixed floor. Still private." : "Buff brick. 0 for the list.";
      flashT = 0.9;
    }
    playThud();
    if (chopped > 4) playSmash();
    if (chopped >= 6) applyWaste(chopped);
    if (stacked.length >= spec.floors) finish(true);
    else {
      phase = "swing";
      drop = makeBlock();
    }
    paintHud();
    return true;
  }

  function miss() {
    if (drop) {
      spawnSlice(drop, drop.x, Math.max(18, drop.w * 0.45), drop.u0 || 0, drop.x + drop.w / 2 < W / 2 ? -1 : 1, drop.y);
      playSmash();
    }
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

  function stepDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.vy += 1680 * dt;
      d.x += (d.vx || 0) * dt;
      d.y += d.vy * dt;
      d.rot = (d.rot || 0) + (d.vr || 0) * dt;
      d.vx *= 0.992;
      const dest = pileSpot(d.side || 1, d.w);
      const floor = dest.y;
      if (d.y >= floor) {
        d.y = floor;
        d.x = dest.x;
        d.rot = dest.rot;
        d.falling = false;
        rubble.push(d);
        debris.splice(i, 1);
      }
    }
  }

  function drawWin(dt) {
    winT += dt;
    if (winT > 0.35 && winT < 2.4 && Math.random() < dt * 3.2) {
      spawnBurst(particles, W, H, W * (0.18 + Math.random() * 0.64), H * (0.14 + Math.random() * 0.3), 18);
    }
    const target = social;
    winShown += (target - winShown) * Math.min(1, dt * 6);
    if (target - winShown < 0.4) winShown = target;
    ctx.fillStyle = "rgba(8, 16, 12, 0.42)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#c8f542";
    ctx.font = `700 ${Math.min(64, Math.round(W * 0.16))}px Fredoka, sans-serif`;
    ctx.fillText("STACKED", W / 2, H * 0.36);
    ctx.fillStyle = "#e8f6dc";
    ctx.font = "700 28px Fredoka, sans-serif";
    ctx.fillText(`${Math.round(winShown)} social homes`, W / 2, H * 0.36 + 46);
    ctx.font = "600 15px Nunito, sans-serif";
    ctx.fillStyle = "#c5d6bc";
    const mx = maxHomes || target;
    ctx.fillText(mx ? `${Math.round(winShown)} / ${mx}` : "Homes for the list", W / 2, H * 0.36 + 72);
    ctx.font = "600 13px Nunito, sans-serif";
    ctx.fillText("Tap to keep walking", W / 2, H * 0.36 + 98);
    ctx.shadowBlur = 0;
    if (winT >= 3 || skipWin) sendDone(true);
  }

  function drawLose() {
    ctx.fillStyle = "rgba(13,27,22,0.4)";
    ctx.fillRect(0, H * 0.38, W, 72);
    ctx.fillStyle = "#ff8a8a";
    ctx.font = "700 28px Fredoka, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FALLEN", W / 2, H * 0.38 + 46);
  }

  function draw(dt) {
    t += dt;
    if (flashT > 0) flashT -= dt;
    stepDebris(dt);
    updateParticles(particles, dt);
    ctx.clearRect(0, 0, W, H);

    const topY = stacked.length ? stacked[stacked.length - 1].y : plinthTop(H);
    const wantCam = H * 0.42 - topY;
    cam += (wantCam - cam) * Math.min(1, dt * 4);

    ctx.save();
    ctx.translate(0, cam);

    drawPlinth(ctx, spec, W, plinthTop(H));
    for (const r of rubble) drawDebris(ctx, r, spec);
    for (const d of debris) drawDebris(ctx, d, spec);
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

    drawParticles(ctx, particles);

    if (flashT > 0 && flash && phase !== "win") {
      ctx.fillStyle = flash.startsWith("Rubble") ? "#ffb4a0" : "#e8f6dc";
      ctx.font = "700 22px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 8;
      ctx.fillText(flash, W / 2, 108);
      ctx.shadowBlur = 0;
    }
    if (phase === "win") drawWin(dt);
    else if (phase === "lose") drawLose();
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function tryDrop() {
    if (phase === "win") {
      skipWin = true;
      return;
    }
    if (!armed || over || phase !== "swing" || !drop) return;
    phase = "drop";
    drop.y = HOOK_Y + CABLE - cam;
    drop.vy = 50;
    playRelease();
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
    rubble = [];
    debris = [];
    rubblePx = 0;
    const count = Math.max(0, Math.min(Number(n) || 0, spec.floors));
    const bw = baseWidth(spec, W);
    for (let i = 0; i < count; i++) {
      const kind = floorKind(i, spec);
      const y = plinthTop(H) - (i + 1) * BLOCK_H;
      const x = W / 2 - bw / 2;
      stacked.push(stampPiece(kind, x, bw, y, { textureOriginX: 0, u0: 0, fullWidth: bw }));
      if (kind === "social") social += spec.homesPerLime || 1;
    }
    over = false;
    phase = stacked.length >= spec.floors ? "win" : "swing";
    drop = phase === "swing" ? makeBlock() : null;
    const topY = stacked.length ? stacked[stacked.length - 1].y : plinthTop(H);
    cam = H * 0.42 - topY;
    if (phase === "win") {
      over = true;
      startWinFx();
    }
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

  function debugChopDrop() {
    if (!drop) drop = makeBlock();
    const prev = stacked[stacked.length - 1];
    const ox = prev ? prev.x + Math.max(28, prev.w * 0.28) : W / 2 - drop.w / 2 + 36;
    drop.x = ox;
    drop.y = nextLandY() - 8;
    drop.vy = 80;
    phase = "drop";
    frozen = false;
  }

  function bindView() {
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
  }

  function unbindView() {
    window.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("scroll", resize);
  }

  function start() {
    resize();
    running = true;
    over = false;
    endSent = false;
    hp = 3;
    social = 0;
    combo = 0;
    rubblePx = 0;
    stacked = [];
    debris = [];
    rubble = [];
    particles = [];
    phase = "swing";
    t = 0;
    cam = 0;
    winT = 0;
    skipWin = false;
    drop = makeBlock();
    armed = false;
    paintHud();
    last = performance.now();
    setTimeout(() => { armed = true; }, 280);
    bindView();
    canvas.addEventListener("pointerdown", onPtr, { passive: false });
    const overlay = canvas.parentElement;
    if (overlay && overlay !== canvas) overlay.addEventListener("pointerdown", onPtr, { passive: false });
    window.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    unbindView();
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
    debugChopDrop,
    freezePlay: () => debugMidDrop({ freeze: true }),
    spec,
    state: () => ({
      phase,
      hp,
      social,
      floors: stacked.length,
      cam,
      over,
      kind: drop?.kind,
      lastW: stacked.length ? stacked[stacked.length - 1].w : 0,
      dropW: drop?.w ?? 0,
      rubble: rubblePx,
      max: maxHomes,
    }),
  };
}
