/** Storey drawing. Texture is local to the piece (textureOriginX / u0), never world-snapped. */

export const BLOCK_H = 56;

export function shade(hex, amt) {
  const n = hex.replace("#", "");
  const r = Math.max(0, Math.min(255, parseInt(n.slice(0, 2), 16) + amt));
  const g = Math.max(0, Math.min(255, parseInt(n.slice(2, 4), 16) + amt));
  const b = Math.max(0, Math.min(255, parseInt(n.slice(4, 6), 16) + amt));
  return `rgb(${r},${g},${b})`;
}

export function texOrigin(b) {
  return (b.x - (b.u0 || 0)) + (b.textureOriginX || 0);
}

export function windowCols(b, module = 30) {
  const x = b.x;
  const w = b.w;
  const origin = texOrigin(b);
  const full = b.fullWidth || w;
  const xs = [];
  for (let xx = origin + 8; xx + 16 < origin + full - 6; xx += module) {
    if (xx + 4 >= x && xx < x + w - 4) xs.push(xx);
  }
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

function brickCourses(ctx, b, y, h, brick, mortar, course = 5, stretch = 15, skipCourses = false) {
  const x = b.x;
  const w = b.w;
  const origin = texOrigin(b);
  ctx.fillStyle = brick;
  ctx.fillRect(x, y, w, h);
  if (skipCourses) return;
  for (let row = 0, yy = y; yy < y + h; row++, yy += course) {
    ctx.fillStyle = row % 6 === 5 ? shade(brick, -18) : mortar;
    ctx.fillRect(x, yy + course - 1, w, 1);
    const off = row % 2 ? stretch / 2 : 0;
    ctx.fillStyle = mortar;
    const first = origin + off;
    const i0 = Math.floor((x - first) / stretch) - 1;
    for (let i = i0; ; i++) {
      const xx = first + i * stretch;
      if (xx > x + w) break;
      if (xx >= x) ctx.fillRect(xx, yy, 1, course);
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

function drawSocial(ctx, b, y, spec, isTop, skipCourses) {
  const { x, w } = b;
  const h = b.h || BLOCK_H;
  const concrete = !!spec.brown;
  clipStorey(ctx, x, y, w, h, () => {
    if (concrete) {
      ctx.fillStyle = "#b4aea4";
      ctx.fillRect(x, y, w, h);
      if (!skipCourses) {
        ctx.fillStyle = "#9e9890";
        for (let yy = y + 6; yy < y + h; yy += 8) ctx.fillRect(x, yy, w, 1);
        ctx.fillStyle = "#c8c2b8";
        ctx.fillRect(x, y, 5, h);
      }
    } else {
      brickCourses(ctx, b, y, h, "#c49a52", "#e6d4b0", 5, 14, skipCourses);
      if (!skipCourses) {
        ctx.fillStyle = "#8a6a32";
        ctx.fillRect(x, y + h - 3, w, 3);
      }
    }
    leftLight(ctx, x, y, w, h);
    if (skipCourses) return;
    const cols = windowCols(b, 28);
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

function drawMixed(ctx, b, y, spec, isTop, skipCourses) {
  const { x, w } = b;
  const h = b.h || BLOCK_H;
  clipStorey(ctx, x, y, w, h, () => {
    brickCourses(ctx, b, y, h, "#c2b492", "#e0d6c0", 5, 16, skipCourses);
    if (!skipCourses) {
      ctx.fillStyle = "#9a9a94";
      ctx.fillRect(x, y + h - 4, w, 4);
    }
    leftLight(ctx, x, y, w, h);
    if (skipCourses) return;
    const cols = windowCols(b, 32);
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
  const origin = texOrigin(b);
  const full = b.fullWidth || w;
  clipStorey(ctx, x, y, w, h, () => {
    const bg = ctx.createLinearGradient(x, y, x + w, y);
    bg.addColorStop(0, "#243038");
    bg.addColorStop(0.4, "#151c22");
    bg.addColorStop(1, "#0a1014");
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    const module = 20;
    for (let xx = origin + 4; xx < origin + full - 6; xx += module) {
      if (xx + 16 < x || xx > x + w) continue;
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

export function drawStorey(ctx, b, y, spec, isTop, skipCourses) {
  if (b.kind === "luxury") drawLuxury(ctx, b, y, spec, isTop);
  else if (b.kind === "mixed") drawMixed(ctx, b, y, spec, isTop, skipCourses);
  else drawSocial(ctx, b, y, spec, isTop, skipCourses);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x + 0.5, y + 0.5, b.w - 1, (b.h || BLOCK_H) - 1);
}

/** Plinth footprint — first floor crops against this, same as later roofs. */
export function plinthSize(spec, W) {
  let bw = Math.min(248, Math.round(W * 0.44));
  if (spec.tight) bw = Math.round(bw * 0.72);
  if (spec.brown) bw = Math.round(bw * 1.12);
  if (spec.luxury) bw = Math.round(bw * 0.82);
  bw = Math.max(86, bw);
  const extra = spec.brown ? 18 : spec.tight ? 8 : 12;
  const pw = bw + extra;
  return { bw, extra, pw, px: W / 2 - pw / 2 };
}

export function drawPlinth(ctx, spec, W, top) {
  const { pw, px } = plinthSize(spec, W);
  ctx.fillStyle = "#6e6a64";
  ctx.fillRect(px - 6, top + 8, pw + 12, 10);
  ctx.fillStyle = "#8a8680";
  ctx.fillRect(px - 2, top, pw + 4, 10);
  ctx.fillStyle = "#a8a49c";
  ctx.fillRect(px, top, pw, 3);
  const lg = ctx.createLinearGradient(px, top, px + pw, top);
  lg.addColorStop(0, "rgba(255,255,255,0.2)");
  lg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = lg;
  ctx.fillRect(px - 2, top, pw + 4, 10);
  ctx.fillStyle = "#2a2c2e";
  ctx.fillRect(px + pw * 0.42, top + 1, Math.max(14, pw * 0.16), 8);
}

/** Lime 3px roof ghost at drop.x / drop.w. */
export function drawRoofGhost(ctx, x, y, w) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "#c8f542";
  ctx.fillRect(x, y, w, 3);
  ctx.restore();
}

/** Lime seam flash on a perfect land. */
export function drawSeamFlash(ctx, x, y, w, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = "#c8f542";
  ctx.shadowColor = "#c8f542";
  ctx.shadowBlur = 16;
  ctx.fillRect(x - 3, y - 3, w + 6, 7);
  ctx.restore();
}

export function drawHook(ctx, W, hx, blockTop, top = 40) {
  ctx.fillStyle = "#6a5840";
  ctx.fillRect(0, top + 6, W, 10);
  ctx.fillStyle = "#c4a574";
  ctx.fillRect(0, top + 6, W, 7);
  ctx.fillStyle = "#8a7348";
  ctx.fillRect(0, top + 13, W, 2);
  ctx.fillStyle = "#2a2418";
  for (let x = 18; x < W; x += 46) ctx.fillRect(x, top + 7, 3, 6);
  ctx.fillStyle = "#e0c888";
  ctx.fillRect(hx - 18, top + 3, 36, 16);
  ctx.fillStyle = "#8a7040";
  ctx.fillRect(hx - 18, top + 3, 36, 3);
  ctx.fillStyle = "#2a2418";
  ctx.fillRect(hx - 3, top + 8, 6, 10);
  ctx.strokeStyle = "#f2e6c4";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hx, top + 18);
  ctx.lineTo(hx, blockTop);
  ctx.stroke();
  ctx.strokeStyle = "#f0d090";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hx, blockTop + 2, 7, Math.PI * 0.15, Math.PI * 0.95, false);
  ctx.stroke();
}

export function drawDebris(ctx, d, spec) {
  ctx.save();
  ctx.translate(d.x + d.w / 2, d.y + (d.h || BLOCK_H) / 2);
  ctx.rotate(d.rot || 0);
  const piece = {
    ...d,
    x: -d.w / 2,
    y: 0,
  };
  drawStorey(ctx, piece, -(d.h || BLOCK_H) / 2, spec, false);
  ctx.restore();
}
