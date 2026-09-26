// Tiny sound cues (Web Audio): a soft tick per scanned frame, a rising chime on success.
// Must be unlocked by a user tap on iOS: call unlockSound() from the Start button.

let ctx = null;

export function unlockSound() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function beep(freq, ms, volume = 0.05, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

/** Soft tick: "I'm scanning". */
export function tick() { beep(1200, 40, 0.03); }

/** Rising two-tone: "found it". */
export function chime() { beep(660, 120, 0.08); beep(990, 180, 0.08, 0.13); }
