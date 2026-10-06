/**
 * The pyramid's carvings, drawn on canvases with plain shapes: the clashing fists of Minpentai over the door (ch4), the
 * round seal on the door, and the face of a plaque for each solved riddle.
 */
import * as THREE from "three";

function canvas(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  draw(el.getContext("2d")!);
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** One fist seen from the side, knuckles to the right, its forearm reaching in from the left edge. */
function fist(c: CanvasRenderingContext2D) {
  const part = (x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
    c.fill();
    c.stroke();
  };
  part(18, 178, 100, 60, 12); // forearm
  part(100, 166, 24, 84, 6); // the cuff
  part(118, 116, 96, 154, 34); // the back of the hand
  for (let i = 0; i < 4; i++) part(176, 116 + i * 38.5, 66, 38, 17); // four curled fingers
  part(136, 218, 92, 38, 18); // the thumb across them
}

/** Two fists meeting, with a burst between them: inlaid gold on dark stone, so it reads at night. */
export function fistsTexture() {
  return canvas(512, 384, (c) => {
    c.fillStyle = "#2a2430";
    c.fillRect(0, 0, 512, 384);
    c.strokeStyle = "#c79a52";
    c.lineWidth = 10;
    c.strokeRect(14, 14, 484, 356);
    c.lineWidth = 3;
    c.strokeRect(30, 30, 452, 324);
    // the clash: rays out of the point where they meet, behind the fists
    c.strokeStyle = "#f4d79c";
    c.lineWidth = 7;
    c.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      const r1 = i % 2 ? 70 : 120;
      c.beginPath();
      c.moveTo(256 + Math.cos(a) * 20, 192 + Math.sin(a) * 20);
      c.lineTo(256 + Math.cos(a) * r1 * 0.6, 192 + Math.sin(a) * r1);
      c.stroke();
    }
    c.fillStyle = "#e9bf74";
    c.strokeStyle = "#5a3d1c";
    c.lineWidth = 6;
    c.lineJoin = "round";
    fist(c);
    c.save();
    c.translate(512, 0);
    c.scale(-1, 1);
    fist(c);
    c.restore();
  });
}

/**
 * The seal on the door: three dials turned against each other around a keyhole, a ring of 24 marks outside. The lines
 * are light on dark bronze, so the same picture is the colour and the glow.
 */
export function sealTexture() {
  return canvas(512, 512, (c) => {
    const g = c.createRadialGradient(256, 256, 20, 256, 256, 256);
    g.addColorStop(0, "#3b2a1c");
    g.addColorStop(1, "#1c140e");
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
    c.translate(256, 256);
    c.strokeStyle = "#ffd590";
    c.fillStyle = "#ffd590";
    c.lineCap = "round";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(0, 0, 238, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r1 = i % 6 === 0 ? 182 : 204;
      c.lineWidth = i % 6 === 0 ? 8 : 4;
      c.beginPath();
      c.moveTo(Math.cos(a) * 226, Math.sin(a) * 226);
      c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      c.stroke();
    }
    // three dials, each broken by a notch at its own angle: the combination
    [
      [164, 0.6],
      [124, 2.4],
      [86, 4.3],
    ].forEach(([r, a], k) => {
      c.lineWidth = 9 - k * 2;
      c.beginPath();
      c.arc(0, 0, r, a + 0.32, a + Math.PI * 2 - 0.32);
      c.stroke();
      c.beginPath();
      c.arc(Math.cos(a) * r, Math.sin(a) * r, 9 - k, 0, Math.PI * 2);
      c.fill();
    });
    // the keyhole
    c.beginPath();
    c.arc(0, -14, 22, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-12, -4);
    c.lineTo(12, -4);
    c.lineTo(18, 46);
    c.lineTo(-18, 46);
    c.closePath();
    c.fill();
  });
}

const ROMAN: [number, string][] = [
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];
export function roman(n: number) {
  let out = "";
  for (const [v, s] of ROMAN) while (n >= v) (out += s), (n -= v);
  return out;
}

/** Break a name into lines that fit `width` at the current font. */
function lines(c: CanvasRenderingContext2D, text: string, width: number) {
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = out[out.length - 1];
    if (last && c.measureText(`${last} ${word}`).width <= width) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

/** A plaque's face: lit alabaster, the riddle's number and name cut into it. */
export function plaqueTexture(n: number, name: string) {
  return canvas(320, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#fff1cf");
    g.addColorStop(0.55, "#f6dca6");
    g.addColorStop(1, "#e5b978");
    c.fillStyle = g;
    c.fillRect(0, 0, 320, 512);
    c.strokeStyle = "#8a5a2e";
    c.lineWidth = 6;
    c.strokeRect(16, 16, 288, 480);
    c.fillStyle = "#4a2c16";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "600 84px sans-serif";
    c.fillText(roman(n), 160, 112);
    c.fillRect(110, 176, 100, 5);
    c.font = "600 48px sans-serif";
    let size = 48;
    while (size > 26 && lines(c, name, 250).some((l) => c.measureText(l).width > 250)) c.font = `600 ${(size -= 4)}px sans-serif`;
    const ls = lines(c, name, 250).slice(0, 4);
    ls.forEach((l, i) => c.fillText(l, 160, 270 + (i - (ls.length - 1) / 2) * size * 1.15));
    // a small diamond at the foot
    c.beginPath();
    c.moveTo(160, 410);
    c.lineTo(178, 430);
    c.lineTo(160, 450);
    c.lineTo(142, 430);
    c.closePath();
    c.fill();
  });
}
