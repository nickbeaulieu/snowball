// Web Audio API sound system — all sounds synthesized, zero audio file assets.

let audioCtx: AudioContext | null = null;
let masterVolume = 0.7;
let masterGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

/** Call on first user gesture to satisfy browser autoplay policy. Safe to call multiple times. */
export function initAudio() {
  getCtx();
}

export function setMasterVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (masterGain) masterGain.gain.value = masterVolume;
}

export function getMasterVolume(): number {
  return masterVolume;
}

// --- Spatial volume ---

const FULL_VOLUME_RADIUS = 200;
const MAX_HEARING_RADIUS = 1200;

/** Linear falloff: full volume within 200px, silent beyond 1200px. */
export function spatialVolume(
  eventX: number,
  eventY: number,
  listenerX: number,
  listenerY: number,
): number {
  const dist = Math.hypot(eventX - listenerX, eventY - listenerY);
  if (dist <= FULL_VOLUME_RADIUS) return 1.0;
  if (dist >= MAX_HEARING_RADIUS) return 0.0;
  return 1.0 - (dist - FULL_VOLUME_RADIUS) / (MAX_HEARING_RADIUS - FULL_VOLUME_RADIUS);
}

// --- Helpers ---

function createNoiseBuffer(duration: number): AudioBuffer {
  const ctx = getCtx();
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** Soft-clipping waveshaper for warm distortion / crunch. */
function createDistortion(amount = 8): WaveShaperNode {
  const ctx = getCtx();
  const ws = ctx.createWaveShaper();
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * amount);
  }
  ws.curve = curve;
  ws.oversample = "2x";
  return ws;
}

function playNoise(
  duration: number,
  filterType: BiquadFilterType,
  filterFreq: number,
  volume: number,
  crunch = false,
) {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(duration);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  if (crunch) {
    const dist = createDistortion(12);
    src.connect(dist).connect(filter).connect(gain).connect(getMaster());
  } else {
    src.connect(filter).connect(gain).connect(getMaster());
  }
  src.start(now);
  src.stop(now + duration);
}

/** Play a rich tone with optional detuned second oscillator for width. */
function playTone(
  freq: number,
  duration: number,
  volume: number,
  startTime?: number,
  endFreq?: number,
  type: OscillatorType = "sine",
  detune = 0,
) {
  const ctx = getCtx();
  const t = startTime ?? ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  gain.connect(getMaster());

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
  }
  osc.connect(gain);
  osc.start(t);
  osc.stop(t + duration);

  // Detuned second oscillator for width/chorus
  if (detune !== 0) {
    const osc2 = ctx.createOscillator();
    osc2.type = type;
    osc2.frequency.setValueAtTime(freq, t);
    osc2.detune.value = detune;
    if (endFreq !== undefined) {
      osc2.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    }
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(volume * 0.6, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + duration);
    gain2.connect(getMaster());
    osc2.connect(gain2);
    osc2.start(t);
    osc2.stop(t + duration);
  }
}

// --- Sound effects ---

/** Swoosh — snowball leaving hand. Descending bandpass sweep over noise. */
export function playThrowSound(volume = 1.0) {
  if (volume < 0.01) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  const dur = 0.15;
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.exponentialRampToValueAtTime(400, now + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.35 * volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(filter).connect(gain).connect(getMaster());
  src.start(now);
  src.stop(now + dur);
}

/** Crunchy splat — snowball hitting another player. */
export function playHitSound(volume = 1.0) {
  if (volume < 0.01) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  playNoise(0.15, "lowpass", 600, 0.3 * volume, true);
  playTone(90, 0.15, 0.15 * volume, now, 50, "triangle");
  // Crackle layer
  playNoise(0.08, "highpass", 1500, 0.1 * volume);
}

/** Emphasized crunchy splat for when YOU get hit. Always full volume. */
export function playLocalHitSound() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  playNoise(0.2, "lowpass", 600, 0.4, true);
  playTone(90, 0.2, 0.25, now, 50, "triangle");
  playTone(50, 0.25, 0.2, now, undefined, "square");
  playNoise(0.1, "highpass", 1500, 0.12);
}

/** Gritty click — snowball hitting a wall. */
export function playWallHitSound(volume = 1.0) {
  if (volume < 0.01) return;
  playNoise(0.05, "bandpass", 2500, 0.25 * volume, true);
  playTone(200, 0.03, 0.1 * volume, undefined, 80, "square");
}

/** Crunchy descending sweep — player death. */
export function playDeathSound(volume = 1.0) {
  if (volume < 0.01) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  playTone(600, 0.3, 0.25 * volume, now, 80, "sawtooth", 15);
  playNoise(0.3, "lowpass", 500, 0.2 * volume, true);
  playTone(150, 0.2, 0.15 * volume, now + 0.1, 60, "triangle");
}

/** Ascending sparkle arpeggio — player respawn. */
export function playRespawnSound(volume = 1.0) {
  if (volume < 0.01) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  for (let i = 0; i < notes.length; i++) {
    playTone(notes[i], 0.14, 0.18 * volume, now + i * 0.08, undefined, "triangle", 8);
  }
  // Shimmer noise underneath
  playNoise(0.4, "highpass", 3000, 0.06 * volume);
}

/** Ascending 2-note chime — flag picked up. */
export function playFlagPickupSound(volume = 1.0) {
  if (volume < 0.01) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  playTone(523, 0.14, 0.25 * volume, now, undefined, "triangle", 10);
  playTone(659, 0.18, 0.25 * volume, now + 0.08, undefined, "triangle", 10);
  playNoise(0.06, "highpass", 4000, 0.05 * volume);
}

/** Descending 2-note chime — flag dropped. */
export function playFlagDropSound(volume = 1.0) {
  if (volume < 0.01) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  playTone(659, 0.14, 0.25 * volume, now, undefined, "triangle", 10);
  playTone(523, 0.18, 0.25 * volume, now + 0.08, undefined, "triangle", 10);
  playNoise(0.06, "bandpass", 2000, 0.05 * volume);
}

/** Bright ping — flag returned to base. */
export function playFlagReturnSound(volume = 1.0) {
  if (volume < 0.01) return;
  playTone(880, 0.18, 0.25 * volume, undefined, undefined, "triangle", 12);
  playNoise(0.04, "highpass", 5000, 0.04 * volume);
}

/** Triumphant 3-note fanfare — flag captured / score! */
export function playFlagCaptureSound(volume = 1.0) {
  if (volume < 0.01) return;
  const ctx = getCtx();
  const now = ctx.currentTime;
  playTone(523, 0.22, 0.3 * volume, now, undefined, "triangle", 12);
  playTone(659, 0.22, 0.3 * volume, now + 0.15, undefined, "triangle", 12);
  playTone(784, 0.35, 0.3 * volume, now + 0.3, undefined, "triangle", 12);
  // Celebratory noise burst
  playNoise(0.15, "highpass", 3000, 0.08 * volume);
}

/** 3 countdown beeps + higher "go". No spatial — always full volume. */
export function playGameStartSound() {
  const ctx = getCtx();
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    playTone(440, 0.1, 0.25, now + i * 0.3, undefined, "square");
  }
  playTone(880, 0.18, 0.3, now + 0.9, undefined, "triangle", 10);
}

/** Victory or defeat jingle. No spatial — always full volume. */
export function playGameOverSound(won: boolean) {
  const ctx = getCtx();
  const now = ctx.currentTime;
  if (won) {
    // Major ascending: C4-E4-G4-C5
    const notes = [262, 330, 392, 523];
    for (let i = 0; i < notes.length; i++) {
      playTone(notes[i], 0.25, 0.25, now + i * 0.15, undefined, "triangle", 10);
    }
    playNoise(0.3, "highpass", 3000, 0.05);
  } else {
    // Minor descending: C4-Ab3-F3
    const notes = [262, 208, 175];
    for (let i = 0; i < notes.length; i++) {
      playTone(notes[i], 0.3, 0.2, now + i * 0.18, undefined, "sawtooth", 15);
    }
  }
}
