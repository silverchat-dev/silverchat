/**
 * Everything in the library that is painted rather than built: the two door leaves (the river horse reading in its
 * marsh, the hamster at its computer), the lunette over the door, the scores board, the terminal screens, the globe's
 * map and the long rug. All drawn with plain canvas shapes, so nothing is downloaded.
 */
import * as THREE from "three";

import { fbm, rng, simplex2 } from "../../kit/noise";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const ell = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) => {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
};

const round = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) => {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
};

/** The gilt frame every painted panel of the door shares: a band, a fine inner line, a rosette in each corner. */
function frame(g: CanvasRenderingContext2D, w: number, h: number) {
  g.strokeStyle = "#c9973e";
  g.lineWidth = 26;
  g.strokeRect(13, 13, w - 26, h - 26);
  g.strokeStyle = "#f1d48a";
  g.lineWidth = 4;
  g.strokeRect(34, 34, w - 68, h - 68);
  g.strokeStyle = "#7a5420";
  g.lineWidth = 2;
  g.strokeRect(4, 4, w - 8, h - 8);
  for (const [x, y] of [[26, 26], [w - 26, 26], [26, h - 26], [w - 26, h - 26]]) {
    ell(g, x, y, 20, 20, "#e8c25f");
    ell(g, x, y, 11, 11, "#9c3b2e");
    ell(g, x, y, 4, 4, "#f7e6b0");
  }
  // a small leaf scroll at the middle of each long side
  for (const y of [h / 2]) {
    for (const x of [26, w - 26]) {
      ell(g, x, y - 16, 8, 16, "#e8c25f");
      ell(g, x, y + 16, 8, 16, "#e8c25f");
      ell(g, x, y, 9, 9, "#9c3b2e");
    }
  }
}

/** Reeds and cattails standing in water, darker and taller at the back. */
function reeds(g: CanvasRenderingContext2D, r: () => number, x0: number, x1: number, base: number, n: number, tall: number, colour: string) {
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0);
    const h = tall * (0.55 + r() * 0.6);
    const lean = (r() - 0.5) * 40;
    g.strokeStyle = colour;
    g.lineWidth = 3 + r() * 3;
    g.beginPath();
    g.moveTo(x, base);
    g.quadraticCurveTo(x + lean * 0.3, base - h * 0.6, x + lean, base - h);
    g.stroke();
    if (r() < 0.45) ell(g, x + lean * 0.92, base - h * 0.9, 6, 20, "#6b3f22", lean * 0.004);
    else {
      // a blade of leaf
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(x, base);
      g.quadraticCurveTo(x - lean, base - h * 0.5, x - lean * 1.6, base - h * 0.75);
      g.quadraticCurveTo(x - lean * 0.5, base - h * 0.45, x + 6, base);
      g.fill();
    }
  }
}

/** Left leaf: a river horse sitting in a marsh at dusk, glasses on, reading a book. */
export function riverHorsePanel() {
  const W = 512;
  const H = 1024;
  const { c, g } = canvas(W, H);
  const r = rng(19);
  const sky = g.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, "#2d4f7c");
  sky.addColorStop(0.55, "#d9a77c");
  sky.addColorStop(1, "#f3d29a");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // a big low moon and its glow
  const glow = g.createRadialGradient(360, 300, 10, 360, 300, 200);
  glow.addColorStop(0, "rgba(255,240,200,0.8)");
  glow.addColorStop(1, "rgba(255,240,200,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  ell(g, 360, 300, 62, 62, "#fff1cf");
  // far bank of trees
  for (let i = 0; i < 14; i++) ell(g, i * 40 + r() * 20, 600 - r() * 20, 46 + r() * 20, 40 + r() * 30, "#4c6a58");
  g.fillStyle = "#4c6a58";
  g.fillRect(0, 590, W, 40);
  reeds(g, r, 40, 480, 650, 22, 220, "#3d5a3b");
  // water
  const water = g.createLinearGradient(0, 620, 0, H);
  water.addColorStop(0, "#5f8f93");
  water.addColorStop(1, "#24474f");
  g.fillStyle = water;
  g.fillRect(0, 630, W, H - 630);
  // the river horse: body, then head, snout, ears, eyes, glasses
  const skin = "#8f86ad";
  const light = "#b3a9cc";
  ell(g, 256, 760, 190, 130, skin);
  ell(g, 256, 520, 120, 100, skin);
  ell(g, 256, 590, 132, 74, light);
  ell(g, 214, 572, 10, 7, "#4b3e63");
  ell(g, 298, 572, 10, 7, "#4b3e63");
  ell(g, 168, 438, 22, 28, skin);
  ell(g, 344, 438, 22, 28, skin);
  ell(g, 168, 440, 11, 16, "#d99aa6");
  ell(g, 344, 440, 11, 16, "#d99aa6");
  ell(g, 180, 600, 22, 14, "rgba(232,140,150,0.55)");
  ell(g, 332, 600, 22, 14, "rgba(232,140,150,0.55)");
  for (const x of [214, 298]) {
    ell(g, x, 488, 24, 26, "#fffaf0");
    ell(g, x + 4, 494, 11, 13, "#2a2238");
    ell(g, x + 8, 488, 4, 4, "#ffffff");
    g.strokeStyle = "#c9973e";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(x, 490, 32, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(244, 486);
  g.quadraticCurveTo(256, 476, 268, 486);
  g.stroke();
  // a gentle smile
  g.strokeStyle = "#4b3e63";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(256, 600, 50, 0.25 * Math.PI, 0.75 * Math.PI);
  g.stroke();
  // the open book held in two front feet
  g.fillStyle = "#9c3b2e";
  g.beginPath();
  g.moveTo(130, 690);
  g.lineTo(256, 716);
  g.lineTo(382, 690);
  g.lineTo(386, 770);
  g.lineTo(256, 800);
  g.lineTo(126, 770);
  g.fill();
  for (const s of [-1, 1]) {
    g.fillStyle = "#fbf3dc";
    g.beginPath();
    g.moveTo(256, 712);
    g.lineTo(256 + s * 118, 684);
    g.lineTo(256 + s * 120, 760);
    g.lineTo(256, 790);
    g.fill();
    g.strokeStyle = "#9b8f78";
    g.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.moveTo(256 + s * 18, 728 + k * 10);
      g.lineTo(256 + s * 100, 706 + k * 10);
      g.stroke();
    }
  }
  ell(g, 140, 760, 38, 28, skin);
  ell(g, 372, 760, 38, 28, skin);
  // the water line over the lower body, ripples and lily pads
  g.fillStyle = "rgba(48,92,100,0.92)";
  g.fillRect(0, 830, W, H - 830);
  g.strokeStyle = "rgba(220,240,235,0.55)";
  g.lineWidth = 3;
  for (let i = 0; i < 18; i++) {
    const y = 840 + r() * 150;
    const x = r() * W;
    g.beginPath();
    g.moveTo(x - 30, y);
    g.quadraticCurveTo(x, y - 6, x + 30, y);
    g.stroke();
  }
  for (const [x, y] of [[90, 900], [420, 930], [300, 980], [160, 970]]) {
    ell(g, x, y, 34, 12, "#5d8a3e");
    ell(g, x + 6, y - 6, 9, 7, "#f2a7c0");
  }
  reeds(g, r, 0, 90, 1000, 6, 320, "#2f4a2c");
  reeds(g, r, 430, 512, 1000, 6, 320, "#2f4a2c");
  frame(g, W, H);
  return texture(c);
}

/** Right leaf: a hamster at its desk, paws on the keys, the screen lighting its face. */
export function hamsterPanel() {
  const W = 512;
  const H = 1024;
  const { c, g } = canvas(W, H);
  const r = rng(24);
  // warm wallpaper with stripes and a small window of stars
  g.fillStyle = "#d9a85e";
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 40) {
    g.fillStyle = "rgba(160,90,40,0.18)";
    g.fillRect(x, 0, 16, H);
  }
  round(g, 300, 120, 150, 190, 75, "#2b3a66");
  for (let i = 0; i < 12; i++) ell(g, 320 + r() * 110, 150 + r() * 140, 2.5, 2.5, "#fff5d6");
  g.strokeStyle = "#7a4a26";
  g.lineWidth = 12;
  g.beginPath();
  g.roundRect(300, 120, 150, 190, 75);
  g.stroke();
  // a shelf of tiny books
  g.fillStyle = "#7a4a26";
  g.fillRect(50, 330, 200, 14);
  const spines = ["#9c3b2e", "#2f4a6b", "#c08a3e", "#1f5e63", "#6b3a5c", "#d9c9a3"];
  let bx = 58;
  while (bx < 240) {
    const w = 12 + r() * 12;
    const h = 46 + r() * 30;
    g.fillStyle = spines[Math.floor(r() * spines.length)];
    g.fillRect(bx, 330 - h, w, h);
    bx += w + 2;
  }
  // the desk
  g.fillStyle = "#6e4425";
  g.fillRect(0, 740, W, 50);
  g.fillStyle = "#56331b";
  g.fillRect(0, 790, W, H - 790);
  // the computer: a rounded old monitor with a glowing screen
  round(g, 46, 480, 250, 210, 28, "#e9dcc0");
  const scr = g.createLinearGradient(70, 500, 270, 660);
  scr.addColorStop(0, "#8fe0ff");
  scr.addColorStop(1, "#3b7fbf");
  round(g, 70, 504, 202, 156, 16, "");
  g.fillStyle = scr;
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.85)";
  for (let k = 0; k < 7; k++) g.fillRect(88 + (k % 3) * 10, 522 + k * 19, 70 + r() * 90, 8);
  round(g, 140, 690, 64, 34, 6, "#d4c6a8");
  round(g, 60, 724, 250, 26, 8, "#efe3c8");
  for (let k = 0; k < 10; k++) round(g, 70 + k * 23, 729, 18, 8, 2, "#b8a888");
  // glow from the screen on the wall
  const glow = g.createRadialGradient(170, 580, 20, 170, 580, 300);
  glow.addColorStop(0, "rgba(140,220,255,0.35)");
  glow.addColorStop(1, "rgba(140,220,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 300, W, 500);
  // the hamster on a round stool, turned towards the screen
  round(g, 330, 830, 130, 26, 10, "#9c3b2e");
  g.fillStyle = "#7a4a26";
  g.fillRect(380, 856, 30, 120);
  const fur = "#d98c45";
  ell(g, 390, 720, 110, 125, fur);
  ell(g, 370, 750, 70, 90, "#f7e8d0");
  ell(g, 360, 560, 92, 84, fur);
  ell(g, 300, 590, 50, 42, "#f7e8d0");
  ell(g, 410, 498, 26, 30, fur);
  ell(g, 410, 500, 14, 18, "#f0a7a7");
  ell(g, 318, 500, 24, 28, fur);
  ell(g, 318, 502, 13, 17, "#f0a7a7");
  ell(g, 318, 548, 14, 15, "#1e1612");
  ell(g, 313, 543, 5, 5, "#ffffff");
  ell(g, 270, 584, 9, 7, "#d36c7a");
  g.strokeStyle = "#6b4630";
  g.lineWidth = 2;
  for (const dy of [-8, 0, 8]) {
    g.beginPath();
    g.moveTo(276, 590);
    g.lineTo(236, 584 + dy * 1.5);
    g.stroke();
  }
  ell(g, 312, 606, 18, 12, "rgba(232,120,130,0.45)");
  // paws on the keyboard
  ell(g, 300, 722, 26, 14, "#f0b9a0");
  ell(g, 252, 726, 22, 12, "#f0b9a0");
  g.strokeStyle = fur;
  g.lineWidth = 26;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(350, 680);
  g.quadraticCurveTo(330, 720, 300, 720);
  g.stroke();
  // a cup of tea, sealed, with a straw
  round(g, 440, 690, 44, 54, 8, "#f4efe4");
  g.fillStyle = "#c08a3e";
  g.fillRect(440, 690, 44, 8);
  g.strokeStyle = "#9c3b2e";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(468, 692);
  g.lineTo(476, 650);
  g.stroke();
  frame(g, W, H);
  return texture(c);
}

/** The half-moon over the door: rays of gold from an open book, on night blue. */
export function lunettePanel() {
  const W = 1024;
  const H = 512;
  const { c, g } = canvas(W, H);
  g.fillStyle = "#1f2c55";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 19; i++) {
    const a = Math.PI + (i / 18) * Math.PI;
    g.strokeStyle = i % 2 ? "#c9973e" : "#f1d48a";
    g.lineWidth = i % 2 ? 10 : 18;
    g.beginPath();
    g.moveTo(512, 470);
    g.lineTo(512 + Math.cos(a) * 520, 470 + Math.sin(a) * 520);
    g.stroke();
  }
  ell(g, 512, 470, 150, 150, "#1f2c55");
  ell(g, 512, 470, 132, 132, "#2d3f73");
  for (const s of [-1, 1]) {
    g.fillStyle = "#fbf3dc";
    g.beginPath();
    g.moveTo(512, 430);
    g.quadraticCurveTo(512 + s * 50, 400, 512 + s * 110, 414);
    g.lineTo(512 + s * 110, 490);
    g.quadraticCurveTo(512 + s * 50, 478, 512, 506);
    g.fill();
  }
  const r = rng(7);
  for (let i = 0; i < 26; i++) ell(g, r() * W, r() * 380, 3, 3, "#f7e6b0");
  g.strokeStyle = "#c9973e";
  g.lineWidth = 22;
  g.beginPath();
  g.arc(512, 512, 500, Math.PI, 0);
  g.stroke();
  return texture(c);
}

/** The forecasters' board: ranked rows, gold, silver and bronze for the first three, a bar for each score. */
export function scoresPanel() {
  const W = 512;
  const H = 1024;
  const { c, g } = canvas(W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1c2440");
  bg.addColorStop(1, "#141a2e");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // a laurel and star crest at the top
  g.fillStyle = "#e8c25f";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? 22 : 52;
    g.lineTo(256 + Math.cos(a) * rr, 84 + Math.sin(a) * rr);
  }
  g.fill();
  for (const s of [-1, 1])
    for (let k = 0; k < 6; k++) ell(g, 256 + s * (78 + k * 14), 110 - k * 13 + k * k * 1.6, 14, 7, "#c9973e", s * (0.5 + k * 0.22));
  g.fillStyle = "#c9973e";
  g.fillRect(60, 160, W - 120, 4);
  const medal = ["#f2c14e", "#d8dde6", "#d08a52"];
  const scores = [96, 91, 88, 84, 81, 77, 74, 70, 66, 61];
  scores.forEach((s, i) => {
    const y = 196 + i * 80;
    if (i % 2 === 0) round(g, 34, y - 4, W - 68, 70, 12, "rgba(255,255,255,0.045)");
    ell(g, 82, y + 31, 26, 26, medal[i] ?? "#3a4466");
    g.fillStyle = i < 3 ? "#1c2440" : "#f3ead5";
    g.font = "600 30px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(i + 1), 82, y + 33);
    // the forecaster: a small round face, then a name as a soft line
    ell(g, 140, y + 31, 15, 15, ["#7fc8f8", "#f78c6b", "#b8a1e8", "#f2c14e", "#e8a0b4"][i % 5]);
    round(g, 166, y + 16, 60 + ((i * 37) % 50), 9, 4, "rgba(243,234,213,0.7)");
    // the score bar
    round(g, 166, y + 36, 250, 14, 7, "rgba(255,255,255,0.08)");
    round(g, 166, y + 36, 250 * (s / 100), 14, 7, i < 3 ? medal[i] : "#e9a34f");
    g.fillStyle = "#f3ead5";
    g.font = "600 24px sans-serif";
    g.textAlign = "right";
    g.fillText(String(s), W - 44, y + 28);
  });
  return texture(c);
}

/** A terminal's screen: a window with lines of code (the open API), braces and a cursor. */
export function screenPanel(seed: number) {
  const W = 512;
  const H = 340;
  const { c, g } = canvas(W, H);
  const r = rng(seed);
  g.fillStyle = "#14202c";
  g.fillRect(0, 0, W, H);
  round(g, 0, 0, W, 34, 0, "#22344a");
  ell(g, 24, 17, 7, 7, "#f78c6b");
  ell(g, 46, 17, 7, 7, "#f2c14e");
  ell(g, 68, 17, 7, 7, "#7fc8f8");
  const tones = ["#ffcf8a", "#f3ead5", "#8fd6ff", "#e8a0b4"];
  let indent = 0;
  for (let k = 0; k < 11; k++) {
    const y = 54 + k * 25;
    if (k > 0 && r() < 0.3) indent = Math.max(0, Math.min(3, indent + (r() < 0.5 ? -1 : 1)));
    let x = 26 + indent * 26;
    const parts = 1 + Math.floor(r() * 3);
    for (let p = 0; p < parts; p++) {
      const w = 30 + r() * 110;
      round(g, x, y, w, 11, 5, tones[(k + p) % tones.length]);
      x += w + 12;
    }
  }
  round(g, 26, 54 + 11 * 25, 12, 16, 2, "#ffcf8a");
  return texture(c);
}

/** The globe's map: teal seas, cream lands with a darker coast, faint lines of latitude and longitude. */
export function globePanel() {
  const W = 512;
  const H = 256;
  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  const n = simplex2(32);
  const sea = new THREE.Color("#2f6f8a");
  const deep = new THREE.Color("#1f4f68");
  const land = new THREE.Color("#e2c98f");
  const hill = new THREE.Color("#b88a52");
  const col = new THREE.Color();
  for (let y = 0; y < H; y++) {
    const lat = (y / H - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      // sample noise on the sphere so the map has no seam
      const px = Math.cos(lat) * Math.cos(lon);
      const pz = Math.cos(lat) * Math.sin(lon);
      const py = Math.sin(lat);
      const v = fbm(n, px * 1.6 + py * 0.7, pz * 1.6 - py * 0.9, 5);
      if (v > 0.08) col.copy(land).lerp(hill, Math.min(1, (v - 0.08) * 3));
      else col.copy(sea).lerp(deep, Math.min(1, -v * 2));
      if (Math.abs(v - 0.08) < 0.012) col.multiplyScalar(0.6);
      const i = (y * W + x) * 4;
      img.data[i] = col.r * 255;
      img.data[i + 1] = col.g * 255;
      img.data[i + 2] = col.b * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = "rgba(255,240,200,0.25)";
  g.lineWidth = 1;
  for (let k = 1; k < 12; k++) {
    g.beginPath();
    g.moveTo((k * W) / 12, 0);
    g.lineTo((k * W) / 12, H);
    g.stroke();
  }
  for (let k = 1; k < 6; k++) {
    g.beginPath();
    g.moveTo(0, (k * H) / 6);
    g.lineTo(W, (k * H) / 6);
    g.stroke();
  }
  return texture(c);
}

/** The long rug from the door to the desk: a deep red field, gold and indigo borders, a row of medallions. */
export function rugPanel() {
  const W = 256;
  const H = 1536;
  const { c, g } = canvas(W, H);
  g.fillStyle = "#7a1f24";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#2b2d57";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#c9973e";
  g.fillRect(10, 10, W - 20, H - 20);
  g.fillStyle = "#2b2d57";
  g.fillRect(22, 22, W - 44, H - 44);
  g.fillStyle = "#7a1f24";
  g.fillRect(40, 40, W - 80, H - 80);
  // small diamonds along the indigo border
  for (let y = 40; y < H - 40; y += 28) {
    for (const x of [31, W - 31]) {
      g.fillStyle = "#e8c25f";
      g.beginPath();
      g.moveTo(x, y - 7);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 7);
      g.lineTo(x - 5, y);
      g.fill();
    }
  }
  for (let k = 0; k < 6; k++) {
    const y = 150 + k * 250;
    const cx = W / 2;
    g.fillStyle = "#2b2d57";
    g.beginPath();
    g.moveTo(cx, y - 100);
    g.lineTo(cx + 70, y);
    g.lineTo(cx, y + 100);
    g.lineTo(cx - 70, y);
    g.fill();
    g.fillStyle = "#c9973e";
    g.beginPath();
    g.moveTo(cx, y - 70);
    g.lineTo(cx + 46, y);
    g.lineTo(cx, y + 70);
    g.lineTo(cx - 46, y);
    g.fill();
    ell(g, cx, y, 24, 24, "#7a1f24");
    ell(g, cx, y, 10, 10, "#f1d48a");
  }
  const t = texture(c);
  return t;
}
