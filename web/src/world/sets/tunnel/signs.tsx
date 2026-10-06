"use client";

/**
 * What tells the two ways apart at a glance: a lit sign over each mouth (silver-blue with cars changing cabins to the
 * left, gold with a speech mark and a coin to the right), and the green circle at each mouth where the walker acts.
 * The old Arctic poster taped to the fork (ch. 3) is here too. Signs are drawn with plain canvas shapes, no text.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

import { weather } from "../../kit/materials";

/** the reserved colour: a green circle means "tap here", and nothing else in Meldan glows this green */
export const TAP_GREEN = "#38ff86";

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const roundRect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
};

/** An arrow pointing left (dir -1) or right (dir 1), centred on (x, y). */
function arrow(g: CanvasRenderingContext2D, x: number, y: number, dir: number, size: number) {
  g.beginPath();
  g.moveTo(x + dir * size, y);
  g.lineTo(x + dir * size * 0.1, y - size * 0.75);
  g.lineTo(x + dir * size * 0.1, y - size * 0.3);
  g.lineTo(x - dir * size, y - size * 0.3);
  g.lineTo(x - dir * size, y + size * 0.3);
  g.lineTo(x + dir * size * 0.1, y + size * 0.3);
  g.lineTo(x + dir * size * 0.1, y + size * 0.75);
  g.closePath();
  g.fill();
}

/** Left: cool silver-blue. An arrow, and two cabins trading places over two cars (the swap). */
function cashSign() {
  return canvas(1024, 330, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 330);
    bg.addColorStop(0, "#c9d9ec");
    bg.addColorStop(1, "#8fa9c8");
    g.fillStyle = bg;
    roundRect(g, 0, 0, 1024, 330, 40);
    g.fill();
    g.fillStyle = "#1b2a3e";
    arrow(g, 150, 165, -1, 95);
    // two cars, their cabins lifted and crossing
    const cabin = (x: number, y: number, c: string) => {
      g.fillStyle = c;
      roundRect(g, x, y, 150, 74, 22);
      g.fill();
      g.fillStyle = "#1b2a3e";
      roundRect(g, x + 14, y + 22, 122, 18, 8);
      g.fill();
    };
    for (const x of [380, 690]) {
      g.fillStyle = "#1b2a3e";
      roundRect(g, x - 20, 240, 190, 40, 14);
      g.fill();
      g.beginPath();
      g.arc(x + 20, 284, 18, 0, Math.PI * 2);
      g.arc(x + 130, 284, 18, 0, Math.PI * 2);
      g.fill();
    }
    cabin(380, 40, "#d0553f");
    cabin(690, 40, "#3f7fb0");
    g.strokeStyle = "#1b2a3e";
    g.lineWidth = 16;
    g.lineCap = "round";
    // the crossing paths
    g.beginPath();
    g.moveTo(455, 128);
    g.bezierCurveTo(455, 200, 765, 160, 765, 226);
    g.moveTo(765, 128);
    g.bezierCurveTo(765, 200, 455, 160, 455, 226);
    g.stroke();
  });
}

/** Right: warm gold. A speech mark with a coin inside it, and an arrow. */
function zincSign() {
  return canvas(1024, 330, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 330);
    bg.addColorStop(0, "#ffd77a");
    bg.addColorStop(1, "#e3a63a");
    g.fillStyle = bg;
    roundRect(g, 0, 0, 1024, 330, 40);
    g.fill();
    g.fillStyle = "#3b2508";
    arrow(g, 874, 165, 1, 95);
    // the speech mark
    roundRect(g, 220, 50, 420, 200, 70);
    g.fill();
    g.beginPath();
    g.moveTo(300, 230);
    g.lineTo(260, 300);
    g.lineTo(380, 240);
    g.fill();
    // a coin with a Z cut through it
    g.fillStyle = "#ffd77a";
    g.beginPath();
    g.arc(430, 150, 72, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#3b2508";
    g.lineWidth = 20;
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(398, 112);
    g.lineTo(462, 112);
    g.lineTo(398, 188);
    g.lineTo(462, 188);
    g.stroke();
    g.beginPath();
    g.moveTo(430, 92);
    g.lineTo(430, 112);
    g.moveTo(430, 188);
    g.lineTo(430, 208);
    g.stroke();
  });
}

/** The taped Arctic poster: a white peak, a pale sun, a red band, faded and taped at the corners. */
function posterTexture() {
  return canvas(512, 720, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 720);
    sky.addColorStop(0, "#9fc3d8");
    sky.addColorStop(1, "#e4eef0");
    g.fillStyle = sky;
    g.fillRect(0, 0, 512, 720);
    g.fillStyle = "#f6f1df";
    g.beginPath();
    g.arc(256, 220, 92, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(-20, 560);
    g.lineTo(170, 300);
    g.lineTo(250, 400);
    g.lineTo(330, 270);
    g.lineTo(540, 560);
    g.fill();
    g.fillStyle = "#6f93ad";
    g.beginPath();
    g.moveTo(170, 300);
    g.lineTo(205, 420);
    g.lineTo(140, 560);
    g.lineTo(-20, 560);
    g.fill();
    g.fillStyle = "#b8312f";
    g.fillRect(0, 560, 512, 90);
    g.fillStyle = "#f6f1df";
    for (let i = 0; i < 5; i++) g.fillRect(60 + i * 86, 592, 50, 26);
    g.fillStyle = "#24364a";
    g.fillRect(0, 650, 512, 70);
    // age: a wash of paper and a few scuffs
    g.fillStyle = "rgba(225, 205, 160, 0.22)";
    g.fillRect(0, 0, 512, 720);
    g.fillStyle = "rgba(255, 255, 255, 0.25)";
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 512, (i * 173) % 720, 20 + (i % 5) * 9, 2);
    g.fillStyle = "rgba(232, 214, 160, 0.85)";
    for (const [x, y, a] of [
      [20, 20, -0.6],
      [492, 20, 0.6],
      [20, 700, 0.6],
      [492, 700, -0.6],
    ] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.fillRect(-55, -16, 110, 32);
      g.restore();
    }
  });
}

/** A lightbox sign hung from the vault on two rods, facing the hall. */
export function Sign({ kind }: { kind: "cash" | "zinc" }) {
  const map = useMemo(() => (kind === "cash" ? cashSign() : zincSign()), [kind]);
  const w = 3.3;
  const h = (w * 330) / 1024;
  return (
    <group>
      <mesh position={[0, 0, -0.08]} castShadow>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.14]} />
        <meshStandardMaterial color="#2c3036" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.55} roughness={0.5} />
      </mesh>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[k * (w / 2 - 0.3), h / 2 + 0.7, -0.08]}>
          <cylinderGeometry args={[0.025, 0.025, 1.4, 6]} />
          <meshStandardMaterial color="#2c3036" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function Poster() {
  const map = useMemo(() => posterTexture(), []);
  return (
    <mesh>
      <planeGeometry args={[1.25, 1.76]} />
      <meshStandardMaterial map={map} roughness={0.85} />
    </mesh>
  );
}

/** A green circle in the floor: the spot where the walker acts. It breathes a little. */
export function GreenCircle({ phase = 0 }: { phase?: number }) {
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (ring.current) ring.current.emissiveIntensity = 2.4 + Math.sin(weather.time.value * 2.2 + phase) * 0.6;
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[1.05, 1.32, 96]} />
        <meshStandardMaterial ref={ring} color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.055, 0]}>
        <circleGeometry args={[1.05, 64]} />
        <meshStandardMaterial color="#13261a" emissive={TAP_GREEN} emissiveIntensity={0.18} roughness={0.4} />
      </mesh>
    </group>
  );
}
