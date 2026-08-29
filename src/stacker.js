/** Our Block stacker. Crane at the top of the viewport. Pieces are storeys. */

import { challengeSpec, floorKind, isLowSocial } from "./talk.js?v=ob14";
import { maxSocial } from "./progress.js?v=ob8";
import {
  BLOCK_H,
  drawStorey,
  drawPlinth,
  drawHook,
  drawDebris,
  plinthSize,
  drawRoofGhost,
  drawSeamFlash,
} from "./stack-draw.js?v=ob14";
import {
  playCheer,
  playLose,
  playRelease,
  playThud,
  playSmash,
  playPerfect,
  playGlassChime,
  unlockAudio,
  spawnBurst,
  spawnDust,
  updateParticles,
  drawParticles,
} from "./stack-fx.js?v=ob14";

const HOOK_TOP = 40;
const HOOK_Y = HOOK_TOP + 22;
const CABLE = 44;
const MIN_OVERLAP = 12;
const RUBBLE_PX = 40;
const G = 2480;
const HANG_T = 0.055;
const SQUASH_T = 0.16;
const LAND_BAND = 0.45;
const LAND_LO = 0.38;
const LAND_HI = 0.52;
const THUMB_PX = 72;
const PARTICLE_CAP = 24;
const DEBRIS_CAP = 12;

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
    squashT: extra.squashT || 0,
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
  let particles = [];
  let shakeX = 0;
  let shakeVx = 0;
  let shakeRot = 0;
  let shakeVrot = 0;
  let shakeSq = 0;
  let shakeVsq = 0;
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
  let endWon = false;
  let swingOff = 0;
  let swingDir = 1;
  let hangT = 0;
  let hitchT = 0;
  let hitchPending = false;
  let hitStop = 0;
  let seamT = 0;
  let seamX = 0;
  let seamY = 0;
  let seamW = 0;
  let stampT = 0;
  let stampLuxury = false;
  let failT = 0;
  let failTitleY = 0;

  function viewportSize() {
    const host = canvas.parentElement || canvas;
    const vv = window.visualViewport;
    const w = host.clientWidth || Math.round(vv?.width || window.innerWidth);
    const h = host.clientHeight || Math.round(vv?.height || window.innerHeight);
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  function resize() {
    const sz = viewportSize();
    W = sz.w;
    H = sz.h;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (W <= 430) dpr = Math.min(1.5, dpr);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Constant px/s. No sin. */
  function hookPxS() {
    let v = 96 + stacked.length * 7;
    if (spec.luxury) v *= 1.18;
    if (drop && drop.kind === "luxury") v *= 1.10;
    return v;
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

  function capParticles() {
    while (particles.length > PARTICLE_CAP) particles.shift();
  }

  function capDebris() {
    while (debris.length > DEBRIS_CAP) debris.shift();
  }

  function stepSwing(dt) {
    const amp = swingAmp();
    swingOff += swingDir * hookPxS() * dt;
    if (swingOff > amp) {
      swingOff = amp;
      swingDir = -1;
    } else if (swingOff < -amp) {
      swingOff = -amp;
      swingDir = 1;
    }
  }

  function swingX() {
    return W / 2 + swingOff - (drop ? drop.w / 2 : 0);
  }

  function padPrev() {
    if (stacked.length) return stacked[stacked.length - 1];
    const p = plinthSize(spec, W);
    return { x: p.px, w: p.pw, y: plinthTop(H), isPlinth: true };
  }

  function ghostPad() {
    const prev = padPrev();
    return { x: prev.x, w: prev.w, y: nextLandY() };
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

  function result(won) {
    return {
      social,
      won,
      civicLose: isLowSocial(app, spec),
      floors: stacked.length,
      spec,
      rubble: rubblePx,
      max: maxHomes,
    };
  }

  function sendDone(won) {
    if (endSent) return;
    endSent = true;
    onDone(result(won));
    stop();
  }

  function startWinFx() {
    winT = 0;
    winShown = 0;
    skipWin = false;
    spawnBurst(particles, W, H, W * 0.5, H * 0.28, 16);
    spawnBurst(particles, W, H, W * 0.22, H * 0.2, 10);
    spawnBurst(particles, W, H, W * 0.78, H * 0.22, 10);
    spawnBurst(particles, W, H, W * 0.4, H * 0.16, 8);
    capParticles();
    playCheer();
  }

  function finish(won) {
    if (over) return;
    over = true;
    endWon = won;
    const civic = isLowSocial(app, spec);
    if (won && !civic) {
      phase = "win";
      flash = "STACKED";
      flashT = 3;
      startWinFx();
      setTimeout(() => sendDone(true), 820);
      return;
    }
    phase = "civic";
    flash = won ? "You won. Our Block lost." : "You Failed.";
    flashT = 0;
    if (!won) playLose();
    setTimeout(() => sendDone(won), won ? 820 : 420);
  }

  function resetShake() {
    shakeX = 0;
    shakeVx = 0;
    shakeRot = 0;
    shakeVrot = 0;
    shakeSq = 0;
    shakeVsq = 0;
  }

  function impulseTower(block, prev, chopped, perfect) {
    const widthFeel = Math.min(1.35, block.w / 160);
    let punch = 2.2 * widthFeel;
    if (prev?.isPlinth) punch *= 1.4;
    if (perfect) punch *= 0.5;
    if (chopped > 4) punch *= 1.28;
    const mid = block.x + block.w / 2;
    const baseMid = prev ? prev.x + prev.w / 2 : mid;
    const off = mid - baseMid;
    const side = off !== 0 ? Math.sign(off) : chopped > 4 ? (block.x < W / 2 ? -1 : 1) : 0;
    shakeVx += off * 0.35 + side * (chopped > 4 ? 22 : 6) * widthFeel;
    shakeVrot += off * 0.0018 + side * (chopped > 4 ? 0.14 : 0.04);
    shakeSq = Math.min(7, 2.2 * punch);
    shakeVsq = 0;
  }

  function stepShake(dt) {
    const k = 90;
    const damp = 16;
    shakeVx += (-k * shakeX - damp * shakeVx) * dt;
    shakeX += shakeVx * dt;
    shakeVrot += (-k * shakeRot - damp * shakeVrot) * dt;
    shakeRot += shakeVrot * dt;
    shakeVsq += (-k * shakeSq - damp * shakeVsq) * dt;
    shakeSq += shakeVsq * dt;
    if (Math.abs(shakeX) < 0.02 && Math.abs(shakeVx) < 0.2) {
      shakeX = 0;
      shakeVx = 0;
    }
    if (Math.abs(shakeRot) < 0.0004 && Math.abs(shakeVrot) < 0.004) {
      shakeRot = 0;
      shakeVrot = 0;
    }
    if (Math.abs(shakeSq) < 0.02 && Math.abs(shakeVsq) < 0.2) {
      shakeSq = 0;
      shakeVsq = 0;
    }
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
    capDebris();
    spawnDust(particles, x + w / 2, y + cam + BLOCK_H * 0.5, 8);
    capParticles();
  }

  function applyWaste(px) {
    if (px < 6) return 0;
    rubblePx += px;
    const waste = Math.max(1, Math.round(px / RUBBLE_PX));
    social = Math.max(0, social - waste);
    return waste;
  }

  function land(block, x, y, prev) {
    const pad = prev || padPrev();
    let nx = x;
    let nw = block.w;
    let u0 = block.u0 || 0;
    let perfect = true;
    let chopped = 0;
    const left = Math.max(x, pad.x);
    const right = Math.min(x + block.w, pad.x + pad.w);
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
    if (pad.isPlinth) {
      const dc = Math.abs((x + block.w / 2) - (pad.x + pad.w / 2));
      perfect = chopped < 8 && dc < 7;
    } else {
      perfect = Math.abs(x - pad.x) < 7 && Math.abs(block.w - pad.w) < 10 && chopped < 8;
    }
    stacked.push(stampPiece(block.kind, nx, nw, y, {
      textureOriginX: block.textureOriginX,
      u0,
      fullWidth: block.fullWidth || block.w,
      squashT: SQUASH_T,
      squashAmt: pad.isPlinth ? 0.24 : 0.16,
    }));
    if (perfect) {
      hitchT = 0.09;
      spawnBurst(particles, W, H, nx + nw / 2, y + cam, 8);
      capParticles();
      seamT = 0.2;
      if (block.kind === "luxury") playGlassChime();
      else playPerfect();
    }
    if (block.kind === "social") {
      const gain = spec.homesPerLime || 1;
      social += gain;
      if (perfect) {
        combo += 1;
        social += 2 + Math.max(0, combo - 1);
        flash = combo > 1 ? String(combo) : "";
        flashT = combo > 1 ? 0.9 : 0;
      } else {
        combo = 0;
        flash = "";
        flashT = 0;
      }
    } else {
      combo = 0;
      flash = "";
      flashT = 0;
    }
    const landed = stacked[stacked.length - 1];
    if (perfect) {
      seamX = landed.x;
      seamY = landed.y + BLOCK_H;
      seamW = landed.w;
    }
    impulseTower(landed, pad, chopped, perfect);
    playThud(pad.isPlinth ? { heavy: true } : {});
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

  function tossPiece(src, extraVy) {
    const side = src.x + src.w / 2 < W / 2 ? -1 : 1;
    const bit = stampPiece(src.kind, src.x, src.w, src.y, {
      textureOriginX: src.textureOriginX,
      u0: src.u0 || 0,
      fullWidth: src.fullWidth || src.w,
    });
    bit.side = side;
    bit.vx = side * (70 + Math.random() * 90) + (Math.random() - 0.5) * 40;
    bit.vy = (extraVy != null ? extraVy : -40) + Math.random() * 50;
    bit.rot = 0;
    bit.vr = side * (1.4 + Math.random() * 1.8);
    bit.falling = true;
    debris.push(bit);
    capDebris();
  }

  function toppleStack() {
    const n = stacked.length;
    for (let i = 0; i < n; i++) {
      const b = stacked[i];
      const side = (i % 2 ? 1 : -1) * (b.x + b.w / 2 < W / 2 ? -1 : 1);
      b.side = side;
      b.vx = side * (50 + Math.random() * 90) + (Math.random() - 0.5) * 50;
      b.vy = -90 - Math.random() * 110 - (n - i) * 12;
      b.rot = 0;
      b.vr = side * (0.9 + Math.random() * 2.4);
      b.falling = true;
      debris.push(b);
    }
    stacked = [];
    capDebris();
    resetShake();
  }

  function miss() {
    if (drop) {
      tossPiece(drop, 40);
      spawnDust(particles, drop.x + drop.w / 2, drop.y + cam + BLOCK_H * 0.4, 10);
      playSmash();
    }
    hp -= 1;
    combo = 0;
    hitchPending = false;
    flash = "";
    flashT = 0;
    paintHud();
    drop = null;
    if (hp <= 0) {
      toppleStack();
      phase = "fail";
      failT = 0;
      failTitleY = -80;
      over = true;
      endWon = false;
      playLose();
    } else {
      phase = "swing";
      drop = makeBlock();
    }
  }

  function nextLandY() {
    const prev = stacked[stacked.length - 1];
    if (prev) return prev.y - BLOCK_H;
    return plinthTop(H) - BLOCK_H;
  }

  function desiredCam() {
    const land = nextLandY();
    let c = H * LAND_BAND - land;
    const screenLand = land + c;
    if (screenLand < H * LAND_LO) c = H * LAND_LO - land;
    if (screenLand > H * LAND_HI) c = H * LAND_HI - land;
    const roofTop = land + BLOCK_H;
    const maxCam = H - THUMB_PX - roofTop - 4;
    if (c > maxCam) c = maxCam;
    return c;
  }

  function stepDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.vy += G * dt;
      d.x += (d.vx || 0) * dt;
      d.y += d.vy * dt;
      d.rot = (d.rot || 0) + (d.vr || 0) * dt;
      d.vx *= 0.992;
      if (d.y + cam > H + 80 || d.x < -80 || d.x > W + 80) debris.splice(i, 1);
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
    ctx.fillText("Tap", W / 2, H * 0.36 + 98);
    ctx.shadowBlur = 0;
    if (winT >= 3 || skipWin) sendDone(true);
  }

  function drawStoreySquash(b, isTop, skipCourses) {
    const amt = b.squashAmt || 0;
    if (b.squashT > 0 && amt > 0) {
      const k = Math.max(0, Math.min(1, b.squashT / SQUASH_T));
      const sy = 1 - amt * k;
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + BLOCK_H);
      ctx.scale(1, sy);
      ctx.translate(-(b.x + b.w / 2), -(b.y + BLOCK_H));
      drawStorey(ctx, b, b.y, spec, isTop, skipCourses);
      ctx.restore();
    } else {
      drawStorey(ctx, b, b.y, spec, isTop, skipCourses);
    }
  }

  function draw(dt) {
    if (hitchT > 0) {
      hitchT = Math.max(0, hitchT - dt);
      dt = 0;
    }
    t += dt;
    if (flashT > 0) flashT -= dt;
    if (seamT > 0) seamT -= dt;
    if (stampT > 0) stampT -= dt;
    for (const b of stacked) {
      if (b.squashT > 0) b.squashT = Math.max(0, b.squashT - dt);
    }
    if (phase === "swing" || phase === "hang") stepSwing(dt);
    if (phase === "hang") {
      hangT -= dt;
      if (hangT <= 0 && drop) {
        phase = "drop";
        drop.y = HOOK_Y + CABLE - cam + 7;
        drop.vy = 260;
      }
    }
    stepDebris(dt);
    stepShake(dt);
    updateParticles(particles, dt);
    ctx.clearRect(0, 0, W, H);

    const wantCam = desiredCam();
    cam += (wantCam - cam) * Math.min(1, dt * 4);

    ctx.save();
    ctx.translate(0, cam);

    drawPlinth(ctx, spec, W, plinthTop(H));
    ctx.save();
    if (stacked.length) {
      const b0 = stacked[0];
      const cx = b0.x + b0.w / 2;
      const foot = plinthTop(H);
      ctx.translate(cx + shakeX, foot + shakeSq);
      ctx.rotate(shakeRot);
      ctx.translate(-cx, -foot);
    }
    const skipCourses = stacked.length > 10;
    for (let i = 0; i < stacked.length; i++) {
      const isTop = i === stacked.length - 1 && phase !== "drop" && phase !== "hang";
      drawStoreySquash(stacked[i], isTop, !isTop && skipCourses);
    }
    if ((phase === "swing" || phase === "hang") && drop) {
      const roofY = stacked.length ? stacked[stacked.length - 1].y : plinthTop(H);
      drawRoofGhost(ctx, drop.x, roofY, drop.w);
    }
    if (seamT > 0) drawSeamFlash(ctx, seamX, seamY, seamW, seamT / 0.12);
    ctx.restore();
    for (const d of debris) drawDebris(ctx, d, spec);

    if (phase === "drop" && drop) {
      if (!frozen) {
        drop.vy = (drop.vy || 0) + G * dt;
        drop.y += drop.vy * dt;
      }
      drawStorey(ctx, drop, drop.y, spec, true, false);
      const target = nextLandY();
      if (drop.y >= target) {
        const prev = padPrev();
        const ok = land(drop, drop.x, target, prev);
        if (!ok) miss();
      } else if (drop.y > plinthTop(H) + 80) {
        miss();
      }
    }

    ctx.restore();

    if ((phase === "swing" || phase === "hang") && drop) {
      drop.x = swingX();
      const sy = HOOK_Y + CABLE;
      const stretch = phase === "hang" ? 7 * (1 - Math.max(0, hangT) / HANG_T) : 0;
      drawHook(ctx, W, drop.x + drop.w / 2, sy, HOOK_TOP);
      drawStorey(ctx, { ...drop, h: BLOCK_H + stretch }, sy, spec, true, false);
    } else if (phase === "drop" && drop) {
      drawHook(ctx, W, drop.x + drop.w / 2, Math.min(HOOK_Y + CABLE, drop.y + cam), HOOK_TOP);
    } else {
      drawHook(ctx, W, W / 2 + swingOff, HOOK_Y + CABLE, HOOK_TOP);
    }

    drawParticles(ctx, particles);

    if (flashT > 0 && flash && phase !== "win" && phase !== "fail") {
      ctx.fillStyle = "#c8f542";
      ctx.font = "700 22px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 8;
      ctx.fillText(flash, W / 2, 92);
      ctx.shadowBlur = 0;
    }
    if (phase === "win") drawWin(dt);
    else if (phase === "fail") {
      failT += dt;
      if (failT >= 0.72) sendDone(false);
    } else if (phase === "civic") {
      ctx.fillStyle = "rgba(8, 16, 12, 0.35)";
      ctx.fillRect(0, 0, W, H);
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
    if (phase === "win") {
      skipWin = true;
      return;
    }
    if (phase === "civic") {
      return;
    }
    if (phase === "fail") {
      return;
    }
    if (!armed || over || phase !== "swing" || !drop) return;
    phase = "hang";
    hangT = HANG_T;
    drop.y = HOOK_Y + CABLE - cam;
    drop.vy = 0;
    unlockAudio().then(() => playRelease());
  }

  function onPtr(ev) {
    ev.preventDefault();
    unlockAudio();
    tryDrop();
  }

  function onKey(ev) {
    if (ev.code === "Space" || ev.key === " ") {
      ev.preventDefault();
      unlockAudio();
      tryDrop();
    }
  }

  function seedFloors(n) {
    stacked = [];
    social = 0;
    combo = 0;
    debris = [];
    rubblePx = 0;
    resetShake();
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
    const full = stacked.length >= spec.floors;
    const civic = full && isLowSocial(app, spec);
    phase = civic ? "civic" : full ? "win" : "swing";
    drop = phase === "swing" ? makeBlock() : null;
    cam = desiredCam();
    if (phase === "win") {
      over = true;
      endWon = true;
      startWinFx();
      setTimeout(() => sendDone(true), 820);
    } else if (phase === "civic") {
      over = true;
      endWon = true;
      setTimeout(() => sendDone(true), 360);
    }
    paintHud();
  }

  function debugMidDrop(opts = {}) {
    if (!drop) drop = makeBlock();
    drop.x = W / 2 - drop.w / 2 + Math.min(48, W * 0.08);
    drop.y = H * 0.22 - cam;
    drop.vy = opts.freeze ? 0 : 180;
    phase = "drop";
    hangT = 0;
    if (opts.freeze) frozen = true;
  }

  function debugChopDrop() {
    if (!drop) drop = makeBlock();
    const prev = padPrev();
    const ox = prev.x + Math.max(28, prev.w * 0.28);
    drop.x = ox;
    drop.y = nextLandY() - 8;
    drop.vy = 80;
    phase = "drop";
    hangT = 0;
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
    endWon = false;
    hp = 3;
    social = 0;
    combo = 0;
    rubblePx = 0;
    stacked = [];
    debris = [];
    particles = [];
    resetShake();
    phase = "swing";
    t = 0;
    winT = 0;
    skipWin = false;
    swingOff = -swingAmp() * 0.65;
    swingDir = 1;
    hitchT = 0;
    hitchPending = false;
    hangT = 0;
    hitStop = 0;
    seamT = 0;
    stampT = 0;
    failT = 0;
    drop = makeBlock();
    cam = desiredCam();
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
      civicLose: isLowSocial(app, spec),
      kind: drop?.kind,
      lastW: stacked.length ? stacked[stacked.length - 1].w : 0,
      dropW: drop?.w ?? 0,
      rubble: rubblePx,
      max: maxHomes,
    }),
  };
}
