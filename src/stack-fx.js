/** Win/lose + stack sounds (Web Audio oscillators and noise buffers). No files. */

let ac = null;
let noise = null;

function ensure() {
  try {
    ac = ac || new AudioContext();
    return ac;
  } catch {
    return null;
  }
}

function ctx() {
  const audio = ensure();
  if (audio && audio.state === "suspended") audio.resume();
  return audio;
}

/** Resume AudioContext from a user gesture so the first drop is not silent. */
export function unlockAudio() {
  const audio = ensure();
  if (!audio) return Promise.resolve();
  if (audio.state === "suspended") return audio.resume().catch(() => {});
  return Promise.resolve();
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
