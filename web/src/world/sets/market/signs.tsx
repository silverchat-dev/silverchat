"use client";

/**
 * Every launched token is a shop sign on Hun Min street. The busier a token (its 24-hour volume), the bigger and
 * brighter its sign; a quiet one keeps a floor of light, so no launch is ever dark. Half the signs are hand-made
 * neon (glowing tubes on a dark board), half polished light boxes, as in the book (ch. 2). All of them are painted
 * into one canvas and drawn as one mesh; each blinks in its own way.
 */
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { weather } from "../../kit/materials";
import { FONT } from "./paint";
import type { Piece } from "./parts";

export type Token = { symbol: string; volume: number };

/** Where a sign can hang: on a bracket off a two-storey front, on a frame on a one-storey roof, or over a stairway. */
export type Slot =
  | { kind: "blade"; s: number; z: number; base: number }
  | { kind: "roof"; s: number; z: number; y: number }
  | { kind: "stair"; x: number; z: number; y: number };

/** No green here: that colour belongs to the one spot where the visitor acts. */
const COLOURS = ["#ff3d7f", "#29d3ff", "#ffb627", "#b46cff", "#ff5a36", "#fff15c", "#5c7cff", "#ff7ad9", "#ffe2b8"];

const FACADE = 8;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** A token's symbol as it is written on its sign: capitals, at most 8 characters. */
export const signText = (symbol: string) => symbol.toUpperCase().replace(/\s+/g, "").slice(0, 8) || "?";

/** How busy a token is next to the busiest one, 0 to 1, on a log scale so a quiet launch still shows. */
export const busy = (volume: number, max: number) => Math.log(1 + 9 * Math.max(volume, 0) / Math.max(max, 1e-9)) / Math.log(10);

const mix = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

type Laid = { text: string; colour: string; neon: boolean; vertical: boolean; w: number; h: number; x: number; y: number };

/** Paints one sign at (x, y) of the atlas, in CSS pixels times two. */
function paintSign(g: CanvasRenderingContext2D, l: Laid, seed: number) {
  const { w, h } = l;
  g.save();
  g.translate(l.x, l.y);
  g.scale(2, 2);
  g.font = FONT;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const letters = l.vertical ? [...l.text] : [l.text];
  const at = (i: number) => (l.vertical ? [w / 2, 24 + 25 + i * 50] : [w / 2, h / 2 + 2]);
  const wobble = (i: number) => (l.neon ? Math.sin(seed * 7.1 + i * 2.3) * 0.05 : 0);
  const write = (fill: boolean) =>
    letters.forEach((ch, i) => {
      const [x, y] = at(i);
      g.save();
      g.translate(x, y);
      g.rotate(wobble(i));
      if (fill) g.fillText(ch, 0, 0);
      else g.strokeText(ch, 0, 0);
      g.restore();
    });
  if (l.neon) {
    // a dark board, a tube around the edge, letters bent from glass tube: a coloured halo around a pale core
    g.fillStyle = "#140f1b";
    g.beginPath();
    g.roundRect(0, 0, w, h, 12);
    g.fill();
    g.shadowColor = l.colour;
    g.shadowBlur = 8;
    g.strokeStyle = l.colour;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(7, 7, w - 14, h - 14, 9);
    g.stroke();
    g.shadowBlur = 16;
    g.fillStyle = l.colour;
    write(true);
    write(true);
    g.shadowBlur = 0;
    g.fillStyle = mix(l.colour, "#ffffff", 0.55);
    write(true);
  } else {
    // a polished light box: a lit panel, a thin bright rim, white letters with a dark edge
    const grad = g.createLinearGradient(0, 0, l.vertical ? w : 0, l.vertical ? 0 : h);
    grad.addColorStop(0, mix(l.colour, "#ffffff", 0.25));
    grad.addColorStop(1, mix(l.colour, "#000000", 0.25));
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(0, 0, w, h, 6);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.7)";
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 4);
    g.stroke();
    g.lineJoin = "round";
    g.lineWidth = 6;
    g.strokeStyle = mix(l.colour, "#000000", 0.6);
    write(false);
    g.fillStyle = "#fffaf0";
    write(true);
  }
  g.restore();
}

/**
 * Lays the tokens onto the slots (busiest first), paints the atlas and builds one geometry of all sign faces, plus
 * the dark boards and brackets behind them as pieces, and the brightest signs as lights for the street around them.
 */
export function buildSigns(tokens: Token[], slots: Slot[]) {
  const ranked = [...tokens].sort((a, b) => b.volume - a.volume).slice(0, slots.length);
  const max = Math.max(...ranked.map((t) => t.volume), 1e-9);
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = FONT;
  const sized = ranked.map((t, i) => {
    const text = signText(t.symbol);
    const vertical = slots[i].kind === "blade";
    return { text, vertical, w: vertical ? 84 : Math.ceil(measure.measureText(text).width) + 64, h: vertical ? text.length * 50 + 48 : 84 };
  });
  // shelf packing, tallest first so each shelf wastes little: left to right, a new shelf when a row is full
  let cx = 0;
  let cy = 0;
  let shelf = 0;
  const spots = new Map<number, [number, number]>();
  [...sized.keys()].sort((a, b) => sized[b].h - sized[a].h).forEach((i) => {
    const { w, h } = sized[i];
    if (cx + w * 2 > 2048) {
      cx = 0;
      cy += shelf + 4;
      shelf = 0;
    }
    spots.set(i, [cx, cy]);
    cx += w * 2 + 4;
    shelf = Math.max(shelf, h * 2);
  });
  const H = Math.max(256, 2 ** Math.ceil(Math.log2(cy + shelf)));
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const laid: Laid[] = sized.map((z, i) => {
    const h0 = hash(z.text);
    const [x, y] = spots.get(i)!;
    return { ...z, colour: COLOURS[h0 % COLOURS.length], neon: ((h0 >> 4) + i) % 2 === 0, x, y };
  });
  laid.forEach((l, i) => paintSign(g, l, i + 1));

  const pos: number[] = [];
  const uv: number[] = [];
  const local: number[] = [];
  const sign: number[] = [];
  const idx: number[] = [];
  const pieces: Piece[] = [];
  const lights: { p: THREE.Vector3; colour: string; level: number }[] = [];
  const v = new THREE.Vector3();
  const BACK = "#1b1820";

  const face = (m: THREE.Matrix4, bw: number, bh: number, l: Laid, seed: number, mode: number, level: number) => {
    const base = pos.length / 3;
    const u0 = l.x / 2048;
    const u1 = (l.x + l.w * 2) / 2048;
    const v1 = 1 - l.y / H;
    const v0 = 1 - (l.y + l.h * 2) / H;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => {
      v.set((a * bw) / 2, (b * bh) / 2, 0).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      uv.push(a < 0 ? u0 : u1, b < 0 ? v0 : v1);
      local.push((a + 1) / 2, (b + 1) / 2);
      sign.push(seed, mode, level);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const at = (x: number, y: number, z: number, turn: number) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(1, 1, 1));

  laid.forEach((l, i) => {
    const slot = slots[i];
    const t = busy(ranked[i].volume, max);
    const scale = 0.9 + 0.8 * t;
    const k = ((l.vertical ? 0.62 : 0.66) * scale) / 64;
    const bw = l.w * k;
    const bh = l.h * k;
    const seed = (hash(l.text) % 1000) / 1000;
    const mode = hash(l.text + "m") % 4;
    // the floor of light: even the quietest launch glows
    const level = l.neon ? 1.15 + 2.6 * t : 0.62 + 1.05 * t;
    if (slot.kind === "blade") {
      const x = slot.s * (FACADE - 0.38 - bw / 2);
      const y = slot.base + bh / 2;
      face(at(x, y, slot.z + 0.081, 0), bw, bh, l, seed, mode, level);
      face(at(x, y, slot.z - 0.081, Math.PI), bw, bh, l, seed, mode, level);
      pieces.push({ p: [x, y, slot.z], s: [bw + 0.16, bh + 0.16, 0.15], c: BACK });
      for (const by of [slot.base + 0.25, slot.base + bh - 0.25]) pieces.push({ p: [slot.s * (FACADE - 0.2), by, slot.z], s: [0.42, 0.07, 0.07], c: "#3a3530" });
      lights.push({ p: new THREE.Vector3(x - slot.s * 0.4, y, slot.z + 0.8), colour: l.colour, level: level * (l.neon ? 1 : 1.6) });
    } else if (slot.kind === "roof") {
      // turned 30 degrees towards people coming up the street
      const turn = -slot.s * (Math.PI / 2 - 0.52);
      const nx = Math.sin(turn);
      const nz = Math.cos(turn);
      const x = slot.s * (FACADE + 1.1);
      const y = slot.y + 0.55 + bh / 2;
      face(at(x + nx * 0.081, y, slot.z + nz * 0.081, turn), bw, bh, l, seed, mode, level);
      pieces.push({ p: [x, y, slot.z], s: [bw + 0.16, bh + 0.16, 0.15], r: turn, c: BACK });
      for (const side of [-0.36, 0.36]) {
        const px = x + Math.cos(turn) * bw * side - nx * 0.15;
        const pz = slot.z - Math.sin(turn) * bw * side - nz * 0.15;
        pieces.push({ p: [px, (slot.y + y) / 2, pz], s: [0.1, y - slot.y, 0.1], c: "#3a3530" });
      }
      lights.push({ p: new THREE.Vector3(x + nx * 1.2, y, slot.z + nz * 1.2), colour: l.colour, level: level * (l.neon ? 1 : 1.6) });
    } else {
      const y = slot.y + bh / 2;
      face(at(slot.x, y, slot.z + 0.081, 0), bw, bh, l, seed, mode, level);
      face(at(slot.x, y, slot.z - 0.081, Math.PI), bw, bh, l, seed, mode, level);
      pieces.push({ p: [slot.x, y, slot.z], s: [bw + 0.16, bh + 0.16, 0.15], c: BACK });
      lights.push({ p: new THREE.Vector3(slot.x, y, slot.z + 1), colour: l.colour, level: level * (l.neon ? 1 : 1.6) });
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aLocal", new THREE.Float32BufferAttribute(local, 2));
  geometry.setAttribute("aSign", new THREE.Float32BufferAttribute(sign, 3));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return { geometry, map, pieces, lights };
}

/**
 * How each sign is alive: 0 a steady hum, 1 hand-made neon that stutters now and then, 2 a slow blink that never
 * goes fully dark, 3 a sweep of light running across the letters.
 */
function signMaterial(map: THREE.Texture) {
  const m = new THREE.MeshBasicMaterial({ map });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = weather.time;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aSign;\nattribute vec2 aLocal;\nvarying vec3 vSign;\nvarying vec2 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSign = aSign;\nvLocal = aLocal;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vSign;\nvarying vec2 vLocal;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float t = uTime + vSign.x * 31.0;
        float k = 0.96 + 0.04 * sin(t * 41.0) * sin(t * 2.3);
        if (vSign.y > 0.5 && vSign.y < 1.5) {
          float tick = fract(sin(floor(t * 11.0) * 12.9898 + vSign.x * 78.2) * 43758.5453);
          float spell = step(0.8, fract(t * 0.11));
          k *= 1.0 - 0.55 * step(0.6, tick) * spell;
        } else if (vSign.y > 1.5 && vSign.y < 2.5) {
          k *= 0.6 + 0.4 * smoothstep(0.35, 0.45, fract(t * 0.45)) * (1.0 - smoothstep(0.9, 1.0, fract(t * 0.45)));
        } else if (vSign.y > 2.5) {
          k *= 0.82 + 0.45 * smoothstep(0.7, 1.0, sin((vLocal.x * 0.6 + vLocal.y) * 7.0 - t * 2.6));
        }
        diffuseColor.rgb *= vSign.z * k;`,
      );
  };
  return m;
}

export function Signs({ geometry, map }: { geometry: THREE.BufferGeometry; map: THREE.Texture }) {
  const material = useMemo(() => signMaterial(map), [map]);
  useEffect(() => () => void (geometry.dispose(), map.dispose(), material.dispose()), [geometry, map, material]);
  return <mesh geometry={geometry} material={material} />;
}
