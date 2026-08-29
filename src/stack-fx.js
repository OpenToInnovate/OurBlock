/** Win/lose + stack sounds (Web Audio oscillators and noise buffers). No files. */

let ac = null;
let noise = null;

function ctx() {
  try {
    ac = ac || new AudioContext();
    if (ac.state === "suspended") ac.resume();
    return ac;
  } catch {
    return null;
  }
}

function noiseBuf(audio) {
  if (noise && noise.sampleRate === audio.sampleRate) return noise;
  const n = Math.floor(audio.sampleRate * 0.6);
  const buf = audio.createBuffer(1, n, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  noise = buf;
  return buf;
}

function beep(audio, { type = "square", freq = 440, at = 0, dur = 0.08, vol = 0.06, slide = 0 }) {
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, audio.currentTime + at);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audio.currentTime + at + dur);
  g.gain.setValueAtTime(0.0001, audio.currentTime + at);
  g.gain.exponentialRampToValueAtTime(vol, audio.currentTime + at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + dur);
  o.connect(g);
  g.connect(audio.destination);
  o.start(audio.currentTime + at);
  o.stop(audio.currentTime + at + dur + 0.02);
}

function noiseHit(audio, { at = 0, dur = 0.14, vol = 0.16, freq = 200, type = "lowpass", q = 0.8, slide = 0 }) {
  const src = audio.createBufferSource();
  src.buffer = noiseBuf(audio);
  const f = audio.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const t0 = audio.currentTime + at;
  f.frequency.setValueAtTime(freq, t0);
  if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(audio.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function playCheer() {
  const audio = ctx();
  if (!audio) return;
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    beep(audio, { type: "triangle", freq: f, at: i * 0.09, dur: 0.55, vol: 0.07 });
    beep(audio, { type: "sine", freq: f / 2, at: i * 0.09, dur: 0.7, vol: 0.035 });
  });
  for (let i = 0; i < 10; i++) {
    beep(audio, {
      type: "square",
      freq: 200 + Math.random() * 520,
      at: 0.25 + i * 0.11,
      dur: 0.07,
      vol: 0.045,
      slide: -80,
    });
  }
}

export function playLose() {
  const audio = ctx();
  if (!audio) return;
  beep(audio, { type: "sawtooth", freq: 220, at: 0, dur: 0.28, vol: 0.05, slide: -140 });
  beep(audio, { type: "triangle", freq: 140, at: 0.12, dur: 0.32, vol: 0.04, slide: -70 });
}

/** Clasp / unhook: high metallic click, then a short spring down-slide. */
export function playRelease() {
  const audio = ctx();
  if (!audio) return;
  noiseHit(audio, { at: 0, dur: 0.042, vol: 0.15, freq: 3400, type: "highpass", q: 0.75 });
  beep(audio, { type: "square", freq: 2200, at: 0, dur: 0.03, vol: 0.055, slide: -480 });
  beep(audio, { type: "triangle", freq: 680, at: 0.02, dur: 0.15, vol: 0.06, slide: -400 });
  beep(audio, { type: "sine", freq: 410, at: 0.034, dur: 0.2, vol: 0.032, slide: -230 });
}

/** Block hits the stack: lowpassed noise + a 70–90 Hz sine. */
export function playThud() {
  const audio = ctx();
  if (!audio) return;
  const lp = 150 + Math.random() * 100;
  const tone = 70 + Math.random() * 20;
  noiseHit(audio, { at: 0, dur: 0.2, vol: 0.22, freq: lp, type: "lowpass", q: 0.9, slide: -70 });
  beep(audio, { type: "sine", freq: tone, at: 0, dur: 0.24, vol: 0.16, slide: -18 });
  beep(audio, { type: "triangle", freq: tone * 0.55, at: 0.012, dur: 0.16, vol: 0.075, slide: -10 });
}

/** Slice chopped off / miss debris: crash burst, mid crack, falling bits. */
export function playSmash() {
  const audio = ctx();
  if (!audio) return;
  noiseHit(audio, { at: 0, dur: 0.24, vol: 0.2, freq: 880, type: "bandpass", q: 0.55 });
  noiseHit(audio, { at: 0, dur: 0.3, vol: 0.16, freq: 190, type: "lowpass", q: 0.7, slide: -70 });
  beep(audio, { type: "square", freq: 390, at: 0, dur: 0.07, vol: 0.07, slide: -170 });
  beep(audio, { type: "sawtooth", freq: 230, at: 0.018, dur: 0.1, vol: 0.045, slide: -95 });
  for (let i = 0; i < 5; i++) {
    beep(audio, {
      type: i % 2 ? "square" : "triangle",
      freq: 260 + Math.random() * 440,
      at: 0.055 + i * 0.048,
      dur: 0.055,
      vol: 0.034,
      slide: -130,
    });
    noiseHit(audio, {
      at: 0.07 + i * 0.05,
      dur: 0.065,
      freq: 1500 - i * 200,
      type: "highpass",
      q: 1.05,
      vol: 0.055,
    });
  }
}

export function playChop() {
  playSmash();
}

export function playLand() {
  playThud();
}

export function spawnBurst(particles, W, H, x, y, n = 28) {
  const palette = ["#c8f542", "#f5c518", "#ffe8a0", "#9ec98a", "#fff", "#ff8a3d", "#ff4d6d"];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 340;
    particles.push({
      x: x ?? W * (0.2 + Math.random() * 0.6),
      y: y ?? H * (0.18 + Math.random() * 0.28),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      life: 0.7 + Math.random() * 0.7,
      age: 0,
      col: palette[i % palette.length],
      r: 2.4 + Math.random() * 3.6,
    });
  }
}

export function updateParticles(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    p.vy += 420 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.age >= p.life) particles.splice(i, 1);
  }
}

export function drawParticles(ctx, particles) {
  for (const p of particles) {
    const a = 1 - p.age / p.life;
    ctx.fillStyle = p.col;
    ctx.globalAlpha = Math.max(0, a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
