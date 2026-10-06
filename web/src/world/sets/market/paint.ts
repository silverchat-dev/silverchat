/**
 * Pictures painted with plain canvas shapes: the insides of the shops, the cartoon animals on the wall (ch. 2: an
 * inflated pig with a calculator and a hamster with a green vial holding up the motto), the painted boards of the
 * shops that are not launches, and the chalk stand in front of the empty shop.
 */
import * as THREE from "three";

import { rng } from "../../kit/noise";

export const FONT = "600 48px sans-serif";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}

function texture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
};

const GOODS = ["#e8475f", "#f4c542", "#4fa3e0", "#f7f2e8", "#d95fa6", "#ff8a3d", "#7a6cf0", "#2e2a36", "#c9d3dc"];

/**
 * Four shop insides side by side (each 384 x 256): a warm back wall, shelves of boxes and gadgets, little screens,
 * lamps hanging from the ceiling and a counter in front. The shop front picks one with its `aVariant`.
 */
export function interiorTexture() {
  const [c, g] = canvas(1536, 256);
  const r = rng(808);
  for (let v = 0; v < 4; v++) {
    const x0 = v * 384;
    const wall = g.createLinearGradient(0, 0, 0, 256);
    wall.addColorStop(0, ["#fff1d2", "#f3e6ff", "#e6f4ff", "#ffe6d6"][v]);
    wall.addColorStop(1, ["#b88d5c", "#8c78a8", "#7d93a8", "#b07a5e"][v]);
    g.fillStyle = wall;
    g.fillRect(x0, 0, 384, 256);
    // a strip of ceiling light
    g.fillStyle = "#fffaf0";
    g.fillRect(x0 + 30, 6, 324, 7);
    // shelves of goods
    for (let row = 0; row < 3; row++) {
      const y = 52 + row * 52;
      g.fillStyle = "#5a4330";
      g.fillRect(x0 + 10, y, 364, 6);
      let x = x0 + 14;
      while (x < x0 + 366) {
        const w = 8 + r() * 22;
        const h = 12 + r() * 30;
        if (r() < 0.16) {
          // a little screen, lit
          g.fillStyle = "#0e1a26";
          g.fillRect(x, y - h, w + 6, h);
          g.fillStyle = ["#7fe3ff", "#ffd36b", "#ff8fc7"][Math.floor(r() * 3)];
          g.fillRect(x + 2, y - h + 2, w + 2, h - 4);
        } else {
          g.fillStyle = GOODS[Math.floor(r() * GOODS.length)];
          g.fillRect(x, y - h, w, h);
          g.fillStyle = "rgba(255,255,255,0.35)";
          g.fillRect(x, y - h, w, 3);
        }
        x += w + 2 + r() * 4;
      }
    }
    // hanging cables and lamps
    for (let k = 0; k < 3; k++) {
      const lx = x0 + 70 + k * 120 + r() * 30;
      g.strokeStyle = "#2a2420";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(lx, 0);
      g.lineTo(lx, 26);
      g.stroke();
      g.fillStyle = "#fff4c8";
      g.beginPath();
      g.arc(lx, 30, 7, 0, Math.PI * 2);
      g.fill();
    }
    // the counter, with a robed shopkeeper's shape behind it in some shops
    if (v % 2 === 0) {
      g.fillStyle = "#3b2c4a";
      g.beginPath();
      g.ellipse(x0 + 250, 182, 22, 44, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x0 + 250, 128, 15, 0, Math.PI * 2);
      g.fillStyle = "#4a3a5c";
      g.fill();
    }
    g.fillStyle = "#6b4a2e";
    g.fillRect(x0, 196, 384, 60);
    g.fillStyle = "#8a6440";
    g.fillRect(x0, 196, 384, 8);
    for (let k = 0; k < 5; k++) {
      g.fillStyle = "#f4f1ea";
      g.fillRect(x0 + 30 + k * 26, 178, 22, 18);
      g.strokeStyle = "#b9b2a6";
      g.strokeRect(x0 + 30 + k * 26, 178, 22, 18);
    }
  }
  return texture(c);
}

/** The empty shop: bare walls, a swept floor, one cord with no lamp. */
export function emptyTexture() {
  const [c, g] = canvas(384, 256);
  const wall = g.createLinearGradient(0, 0, 0, 256);
  wall.addColorStop(0, "#3a3532");
  wall.addColorStop(1, "#1a1716");
  g.fillStyle = wall;
  g.fillRect(0, 0, 384, 256);
  g.fillStyle = "#2a2522";
  g.fillRect(0, 200, 384, 56);
  g.strokeStyle = "rgba(255,255,255,0.08)";
  g.lineWidth = 2;
  for (const x of [60, 150, 240, 330]) g.strokeRect(x - 30, 60, 60, 80);
  g.strokeStyle = "#111";
  g.beginPath();
  g.moveTo(190, 0);
  g.lineTo(190, 60);
  g.stroke();
  return texture(c);
}

/**
 * The mural on the wall (ch. 2): under a blue sky, an inflated pink pig holding a calculator and a hamster holding a
 * green vial, a ribbon between them with "Dzego will rise again".
 */
export function muralTexture() {
  const [c, g] = canvas(1024, 384);
  const sky = g.createLinearGradient(0, 0, 0, 384);
  sky.addColorStop(0, "#4aa3f0");
  sky.addColorStop(1, "#bfe3ff");
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 384);
  g.fillStyle = "#ffffff";
  for (const [x, y, s] of [[140, 70, 1], [520, 50, 1.3], [880, 90, 0.9], [700, 150, 0.6]]) {
    for (const [dx, dy, rr] of [[0, 0, 30], [32, -10, 36], [66, 2, 28], [30, 12, 30]]) {
      g.beginPath();
      g.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = "#8fd17a";
  g.fillRect(0, 330, 1024, 54);
  const ink = "#3a2418";
  g.lineWidth = 7;
  g.strokeStyle = ink;
  g.lineJoin = "round";
  const blob = (x: number, y: number, rx: number, ry: number, fill: string) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.stroke();
  };
  // the pig, round as a balloon
  const pink = "#ff9fbf";
  blob(230, 350, 26, 18, pink);
  blob(330, 350, 26, 18, pink);
  blob(280, 235, 130, 118, pink);
  for (const ex of [205, 345]) {
    g.beginPath();
    g.moveTo(ex - 28, 140);
    g.lineTo(ex, 88);
    g.lineTo(ex + 28, 140);
    g.closePath();
    g.fillStyle = pink;
    g.fill();
    g.stroke();
  }
  blob(280, 238, 40, 28, "#ff7fa6");
  g.fillStyle = ink;
  for (const nx of [266, 294]) {
    g.beginPath();
    g.ellipse(nx, 238, 6, 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (const ex of [232, 328]) {
    g.beginPath();
    g.arc(ex, 186, 10, 0, Math.PI * 2);
    g.fill();
  }
  // its calculator
  g.save();
  g.translate(380, 290);
  g.rotate(-0.18);
  roundRect(g, -40, -55, 80, 110, 10);
  g.fillStyle = "#e9e4d8";
  g.fill();
  g.stroke();
  g.fillStyle = "#9fc4b0";
  g.fillRect(-28, -44, 56, 22);
  g.fillStyle = "#6a6058";
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g.fillRect(-27 + i * 20, -12 + j * 20, 14, 13);
  g.restore();
  blob(352, 300, 22, 18, pink);
  // the hamster
  const fur = "#e5a65a";
  blob(760, 250, 100, 108, fur);
  blob(760, 280, 62, 70, "#fff1dc");
  for (const ex of [690, 830]) blob(ex, 160, 26, 26, fur);
  g.fillStyle = ink;
  for (const ex of [728, 792]) {
    g.beginPath();
    g.arc(ex, 210, 10, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(760, 232, 7, 0, Math.PI * 2);
  g.fill();
  // its vial of green
  g.save();
  g.translate(660, 270);
  g.rotate(0.3);
  roundRect(g, -14, -60, 28, 100, 12);
  g.fillStyle = "#eef7f2";
  g.fill();
  g.stroke();
  g.fillStyle = "#4cc46a";
  g.fillRect(-10, -16, 20, 52);
  g.restore();
  blob(676, 290, 20, 16, fur);
  // the ribbon with the motto, held between them
  g.beginPath();
  g.moveTo(400, 92);
  g.quadraticCurveTo(520, 120, 640, 92);
  g.lineTo(640, 152);
  g.quadraticCurveTo(520, 180, 400, 152);
  g.closePath();
  g.fillStyle = "#ffd84a";
  g.fill();
  g.stroke();
  g.fillStyle = ink;
  g.font = FONT;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.save();
  g.translate(520, 134);
  g.scale(0.58, 0.58);
  g.fillText("DZE GO BA FAU GIE", 0, 0);
  g.restore();
  return texture(c);
}

/**
 * Painted boards for shops that are not launches (128 x 128 each): sensors, anti-transmission foil, chips, power,
 * plugs, phones. They are paint, not light, so only launches glow on this street.
 */
export const ICONS = ["sensor", "foil", "chip", "battery", "plug", "phone"] as const;
export function iconTexture() {
  const [c, g] = canvas(128 * ICONS.length, 128);
  const ink = "#2b2230";
  ICONS.forEach((name, i) => {
    g.save();
    g.translate(i * 128, 0);
    g.fillStyle = ["#f6e7c8", "#d9dde2", "#f3d9e6", "#fff0b8", "#d8ecf6", "#f2dccb"][i];
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.lineWidth = 7;
    g.lineCap = "round";
    g.strokeRect(5, 5, 118, 118);
    g.translate(64, 64);
    if (name === "sensor") {
      g.beginPath();
      g.ellipse(0, 0, 34, 20, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 10, 0, Math.PI * 2);
      g.fill();
      for (const rr of [44, 54]) {
        g.beginPath();
        g.arc(0, 0, rr, -0.5, 0.5);
        g.stroke();
      }
    } else if (name === "foil") {
      for (const rr of [16, 30, 44]) {
        g.beginPath();
        g.arc(0, 18, rr, -2.4, -0.74);
        g.stroke();
      }
      g.strokeStyle = "#d8443a";
      g.beginPath();
      g.moveTo(-40, -40);
      g.lineTo(40, 40);
      g.stroke();
    } else if (name === "chip") {
      g.strokeRect(-26, -26, 52, 52);
      for (let k = -18; k <= 18; k += 12) {
        for (const [a, b, cc, d] of [[k, -26, k, -40], [k, 26, k, 40], [-26, k, -40, k], [26, k, 40, k]]) {
          g.beginPath();
          g.moveTo(a, b);
          g.lineTo(cc, d);
          g.stroke();
        }
      }
    } else if (name === "battery") {
      g.strokeRect(-36, -20, 66, 40);
      g.fillRect(32, -8, 8, 16);
      g.fillRect(-28, -12, 30, 24);
    } else if (name === "plug") {
      roundRect(g, -24, -14, 48, 40, 10);
      g.stroke();
      g.fillRect(-14, -36, 7, 22);
      g.fillRect(7, -36, 7, 22);
      g.beginPath();
      g.moveTo(0, 26);
      g.lineTo(0, 44);
      g.stroke();
    } else {
      roundRect(g, -20, -38, 40, 76, 8);
      g.stroke();
      g.beginPath();
      g.arc(0, 26, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
  return texture(c);
}

/** The stand in front of the empty shop: a chalk board, "for launch" with an arrow pointing up. */
export function standTexture() {
  const [c, g] = canvas(256, 320);
  g.fillStyle = "#26302c";
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 40; i++) g.fillRect((i * 53) % 240, (i * 97) % 300, 30, 3);
  g.strokeStyle = "#8a6440";
  g.lineWidth = 16;
  g.strokeRect(8, 8, 240, 304);
  g.fillStyle = "#f2efe6";
  g.font = FONT;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("FOR", 128, 92);
  g.save();
  g.translate(128, 150);
  g.scale(0.78, 0.9);
  g.fillText("LAUNCH", 0, 0);
  g.restore();
  g.strokeStyle = "#f2efe6";
  g.lineWidth = 7;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(128, 270);
  g.lineTo(128, 200);
  g.moveTo(104, 224);
  g.lineTo(128, 200);
  g.lineTo(152, 224);
  g.stroke();
  return texture(c);
}
