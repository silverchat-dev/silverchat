/**
 * The walk's music: one track, decoded once, looped by Web Audio with exact loop points so the seam never depends on
 * the codec's padding. Phones get a mono, lower-rate cut (a quarter of the memory). It starts only from a click (the
 * browser's rule), fades in and out, and the context is suspended while the tab is hidden.
 */
const LOOP_SECONDS = 164; // the loop was cut to exactly this length (notes: Morning in Meldan, 2:44)

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let buffer: Promise<AudioBuffer> | null = null;
let playing: AudioBufferSourceNode | null = null;

function file() {
  const phone = matchMedia("(pointer: coarse)").matches;
  const probe = document.createElement("audio");
  const webm = probe.canPlayType('audio/webm; codecs="opus"') !== "";
  return `/world/music/meldan${phone ? "-phone" : ""}.${webm ? "webm" : "m4a"}`;
}

/** Fetch and decode ahead of time (in the loader), without making any sound. */
export function prepareMusic() {
  if (buffer) return buffer;
  ctx ??= new AudioContext();
  const c = ctx;
  buffer = fetch(file())
    .then((r) => r.arrayBuffer())
    .then((b) => c.decodeAudioData(b))
    .catch((e) => {
      buffer = null;
      throw e;
    });
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (playing) void ctx.resume();
  });
  return buffer;
}

/** Start the music from inside a click handler (resume must happen in the gesture), fading in. */
export async function playMusic() {
  ctx ??= new AudioContext();
  const resumed = ctx.resume();
  const b = await prepareMusic();
  await resumed;
  if (playing) return setVolume(true);
  gain ??= ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = Math.min(LOOP_SECONDS, b.duration);
  src.connect(gain);
  src.start();
  playing = src;
  setVolume(true);
}

/** Fade the music in or out (the sound button). */
export function setVolume(on: boolean) {
  if (!ctx || !gain) return;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(on ? 0.55 : 0, now + (on ? 2.5 : 0.6));
  if (on) void ctx.resume();
}

/** True when the context runs: on an iPhone with the ringer off it can be "interrupted", and the button must say so. */
export const musicRunning = () => ctx?.state === "running";
