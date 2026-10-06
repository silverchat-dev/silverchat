"use client";

/**
 * Evelor's hill, Silverchat's home in the book (ch. 27): a path through Kalimar's meadow to what looks like a natural
 * hill, a stone arch where the path goes in, cottages at its foot, and on the summit a round open-sky room with a bench
 * all the way around and a roof that closes "for privacy". Everything here is made by code from one seed.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { barkMaterial, foliageMaterial, grassMaterial, groundMaterial, stoneMaterial, weather } from "../kit/materials";
import { fbm, rng, simplex2, smoothstep } from "../kit/noise";
import { landGeometry, makeLand, type Land } from "../kit/terrain";
import { labOff } from "../lab";
import { useWorld } from "../state";
import type { SetModule, SetProps } from "./types";
import { BurnBowl, Embers, SkyDial, TeaRobot } from "./room";
import { bladeGeometry, scatter, treeGeometry, type Kind } from "../kit/vegetation";

export const ROOM = { radius: 9, wall: 2.6, thick: 0.8 };
export const HILL = { x: 0, z: 0, height: 27, radius: 34, plateau: 15, room: ROOM.radius };
/** the reserved colour: a green circle means "tap here", and nothing else in Meldan glows this green */
export const TAP_GREEN = "#38ff86";

// one land for the scene and for the camera poses, which are placed by the path itself
const LAND = makeLand({
  seed: 27,
  size: 560,
  hill: HILL,
  path: [
    [-14, 190],
    [6, 150],
    [-8, 118],
    [7, 88],
    [-2, 62],
    [0, 44],
  ],
});

export const useHillLand = () => LAND;

// where the gate and the Pulse post stand on the path, and the side of it the post is on
const GATE_T = 0.07;
const POST_T = 0.42;
const onPath = (t: number) => {
  const p = LAND.path.getPointAt(t);
  const tan = LAND.path.getTangentAt(t);
  return { p, tan, side: new THREE.Vector3(-tan.z, 0, tan.x).normalize() };
};

/** A camera pose standing `back` metres down the path from point t, `up` metres high, looking at `look`. */
function poseBehind(t: number, back: number, up: number, look: THREE.Vector3, sideways = 0) {
  const { p, tan, side } = onPath(t);
  const at = p.clone().addScaledVector(tan, -back).addScaledVector(side, sideways);
  at.y = LAND.height(at.x, at.z) + up;
  return { position: at.toArray() as [number, number, number], target: look.toArray() as [number, number, number] };
}

function Ground({ land }: { land: Land }) {
  const geometry = useMemo(() => landGeometry(land, 420), [land]);
  const material = useMemo(() => groundMaterial(), []);
  return (
    <mesh geometry={geometry} material={material} receiveShadow />
  );
}

/** A field of instanced blades near the path and around the foot of the hill. */
function Grass({ land, count }: { land: Land; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => bladeGeometry(), []);
  const material = useMemo(() => grassMaterial(), []);
  useLayoutEffect(() => {
    const mesh = ref.current!;
    const r = rng(11);
    const n = simplex2(5);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    let i = 0;
    let guard = 0;
    // grass grows in tufts: a centre, then several blades leaning out from it at different heights
    while (i < count && guard < count * 6) {
      guard++;
      const cx = -80 + r() * 160;
      const cz = -60 + r() * 230;
      const d = land.toPath(cx, cz);
      if (d < 1.5 + r() * 0.8) continue;
      // thick where the camera walks (along the path and around the room), thin far from it
      const fromRoom = Math.abs(Math.hypot(cx - HILL.x, cz - HILL.z) - ROOM.radius - 6);
      const near = Math.max(1 - smoothstep(6, 30, d), 1 - smoothstep(4, 16, fromRoom));
      if (r() > 0.08 + 0.92 * near) continue;
      if (Math.hypot(cx - HILL.x, cz - HILL.z) < ROOM.radius + 0.3) continue;
      const patch = fbm(n, cx / 12, cz / 12, 2);
      if (r() > 0.35 + 0.65 * smoothstep(-0.4, 0.3, patch)) continue;
      const blades = 5 + Math.floor(r() * 5);
      const tall = 0.5 + r() * 0.6 + smoothstep(2, 6, d) * 0.3;
      const hue = 0.22 + r() * 0.05 + patch * 0.02;
      for (let k = 0; k < blades && i < count; k++) {
        const a = r() * Math.PI * 2;
        const rr = r() * 0.22;
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        p.set(x, land.height(x, z) - 0.04, z);
        // each blade turns to face out of the tuft and leans away from its centre
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.35, a + Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.5));
        s.set(0.8 + r() * 0.6, tall * (0.6 + r() * 0.6), 1);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        c.setHSL(hue + (r() - 0.5) * 0.02, 0.3 + r() * 0.15, 0.42 + r() * 0.18);
        mesh.setColorAt(i, c);
        i++;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }, [land, count]);
  return <instancedMesh ref={ref} args={[geometry, material, count]} receiveShadow frustumCulled={false} />;
}

/** One kind of tree, instanced at the given spots. */
function Trees({ land, kind, spots, seed, near = true }: { land: Land; kind: Kind; spots: [number, number][]; seed: number; near?: boolean }) {
  const wood = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const cards = useRef<THREE.InstancedMesh>(null);
  const tree = useMemo(() => treeGeometry(kind, seed, near), [kind, seed, near]);
  const mats = useMemo(
    () => ({ wood: barkMaterial(), leaves: foliageMaterial(tree.crownBase), cards: foliageMaterial(tree.crownBase, true) }),
    [tree],
  );
  useLayoutEffect(() => {
    const r = rng(seed * 13);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const k = kind === "tall" ? 1.2 + r() * 0.6 : 1.05 + r() * 0.6;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, land.height(x, z) - 0.15, z), q, new THREE.Vector3(k, k * (0.9 + r() * 0.25), k));
      wood.current!.setMatrixAt(i, m);
      leaves.current!.setMatrixAt(i, m);
      cards.current?.setMatrixAt(i, m);
      c.setRGB(1, 1, 1).multiplyScalar(0.85 + r() * 0.3);
      c.offsetHSL((r() - 0.5) * 0.03, 0, 0);
      leaves.current!.setColorAt(i, c);
      cards.current?.setColorAt(i, c);
    });
    for (const mesh of [wood.current, leaves.current, cards.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [land, spots, kind, seed]);
  return (
    <>
      <instancedMesh ref={wood} args={[tree.wood, mats.wood, spots.length]} castShadow receiveShadow />
      <instancedMesh ref={leaves} args={[tree.leaves, mats.leaves, spots.length]} castShadow receiveShadow />
      {tree.cards && !labOff("cards") && <instancedMesh ref={cards} args={[tree.cards, mats.cards, spots.length]} receiveShadow />}
    </>
  );
}

function Forest({ land }: { land: Land }) {
  const spots = useMemo(() => {
    const n = simplex2(41);
    // the walk is the camera: a wide meadow along the path keeps every tree a good distance from the lens
    const clear = (x: number, z: number) => land.toPath(x, z) > 16 && Math.hypot(x - HILL.x, z - HILL.z) > HILL.plateau + 4;
    // the meadow in front stays open so the hill can be seen; the woods thicken on the slopes and behind
    const density = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      const meadow = z > 60 && Math.abs(x) < 40 ? 0.25 : 1;
      return meadow * (0.25 + 0.75 * smoothstep(-0.25, 0.35, fbm(n, x / 45, z / 45, 3))) * (r < HILL.radius * 1.9 ? 1.25 : 1);
    };
    const accept = (x: number, z: number, r: () => number) => clear(x, z) && r() < density(x, z);
    const box: [number, number, number, number] = [-200, -180, 200, 210];
    return {
      broadleaf: scatter(1, 520, box, 6.5, accept),
      tall: scatter(2, 220, box, 7.5, accept),
      pine: scatter(3, 120, [-200, -180, 200, 40], 7, (x, z, r) => accept(x, z, r) && Math.hypot(x, z) > HILL.radius * 0.9),
      blossom: scatter(4, 7, [-60, 40, 60, 92], 14, (x, z, r) => Math.hypot(x, z) > HILL.plateau + 4 && land.toPath(x, z) > 12 && land.toPath(x, z) < 26 && r() < 0.7),
    };
  }, [land]);
  // full leaves only where the camera passes (near the path and the room); lighter crowns further out
  const close = ([x, z]: [number, number]) => land.toPath(x, z) < 42 || Math.hypot(x - HILL.x, z - HILL.z) < 46;
  return (
    <>
      {(["broadleaf", "tall", "pine", "blossom"] as const).map((kind, k) => (
        <group key={kind}>
          <Trees land={land} kind={kind} spots={spots[kind].filter(close)} seed={101 * (k + 1)} />
          <Trees land={land} kind={kind} spots={spots[kind].filter((p) => !close(p))} seed={101 * (k + 1)} near={false} />
        </group>
      ))}
    </>
  );
}

/** A Kalimar cottage: stone walls, a steep clay roof, round warm windows, half sunk into the green. */
function Cottage({ land, x, z, turn, seed }: { land: Land; x: number; z: number; turn: number; seed: number }) {
  const r = rng(seed);
  const w = 4.2 + r() * 1.6;
  const d = 3.6 + r() * 1.2;
  const h = 2.6 + r() * 0.8;
  const y = land.height(x, z) - 0.3;
  const stone = useMemo(() => stoneMaterial({ moss: 0.7 }), []);
  const roof = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.45, 0);
    shape.lineTo(0, h * 0.95);
    shape.lineTo(w / 2 + 0.45, 0);
    shape.lineTo(-w / 2 - 0.45, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: d + 0.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
    g.translate(0, 0, -(d + 0.7) / 2);
    return g;
  }, [w, d, h]);
  const clay = ["#a8492f", "#b5573a", "#8e3f2a"][seed % 3];
  return (
    <group position={[x, y, z]} rotation={[0, turn, 0]}>
      <mesh material={stone} castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      <mesh geometry={roof} position={[0, h, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={clay} roughness={0.75} />
      </mesh>
      {[-w / 4, w / 4].map((wx) => (
        <group key={wx} position={[wx * 1.25, h * 0.58, d / 2 + 0.01]}>
          <mesh>
            <circleGeometry args={[0.36, 24]} />
            <meshStandardMaterial color="#ffd48a" emissive="#ffb85c" emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0, 0, 0.04]}>
            <torusGeometry args={[0.4, 0.07, 8, 28]} />
            <meshStandardMaterial color="#6b4a2c" roughness={0.7} />
          </mesh>
          {/* a window box of flowers */}
          <mesh position={[0, -0.55, 0.16]} castShadow>
            <boxGeometry args={[0.95, 0.2, 0.3]} />
            <meshStandardMaterial color="#6b4a2c" roughness={0.8} />
          </mesh>
          {[-0.3, -0.1, 0.1, 0.3].map((fx, k) => (
            <mesh key={fx} position={[fx, -0.4, 0.18]}>
              <icosahedronGeometry args={[0.11, 1]} />
              <meshStandardMaterial color={["#e8475f", "#f4c542", "#f7f2e8", "#d95fa6"][(k + seed) % 4]} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 1, d / 2 + 0.03]}>
        <planeGeometry args={[1, 2]} />
        <meshStandardMaterial color="#5c3b22" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.02, d / 2 + 0.06]} castShadow>
        <torusGeometry args={[0.55, 0.09, 6, 20, Math.PI]} />
        <meshStandardMaterial color="#4a3320" roughness={0.8} />
      </mesh>
      <mesh material={stone} position={[w * 0.28, h + h * 0.62, -d * 0.15]} castShadow>
        <boxGeometry args={[0.6, h * 0.75, 0.6]} />
      </mesh>
    </group>
  );
}

/** The stone arch where the path goes into the hill, with the dark of the tunnel behind it. */
function Arch({ land }: { land: Land }) {
  const end = land.path.getPointAt(1);
  const stone = useMemo(() => stoneMaterial({ a: "#c2b49a", b: "#978a74", brick: [0.5, 0.3], moss: 0.85 }), []);
  const geometry = useMemo(() => {
    const outer = new THREE.Shape();
    outer.moveTo(-3.2, 0);
    outer.lineTo(-3.2, 2.6);
    outer.absarc(0, 2.6, 3.2, Math.PI, 0, true);
    outer.lineTo(3.2, 0);
    outer.lineTo(-3.2, 0);
    const hole = new THREE.Path();
    hole.moveTo(-2, 0);
    hole.lineTo(-2, 2.6);
    hole.absarc(0, 2.6, 2, Math.PI, 0, true);
    hole.lineTo(2, 0);
    hole.lineTo(-2, 0);
    outer.holes.push(hole);
    return new THREE.ExtrudeGeometry(outer, { depth: 2.2, bevelEnabled: false });
  }, []);
  return (
    <group position={[end.x, land.height(end.x, end.z) - 0.2, end.z - 1.5]}>
      <mesh geometry={geometry} material={stone} castShadow receiveShadow />
      <mesh position={[0, 2.2, -0.2]}>
        <planeGeometry args={[4.2, 5]} />
        <meshBasicMaterial color="#0b0906" />
      </mesh>
      {/* a lamp inside, so the tunnel reads as a way in, not a hole */}
      <pointLight position={[0, 2.4, 0.4]} color="#ffbf73" intensity={6} distance={9} />
    </group>
  );
}

const PETALS = 12;

/**
 * The round room on the summit: a ring wall, a bench all around inside, a stone floor, the green circle in the middle,
 * and a roof of twelve copper petals hinged on the rim. `closed` 0 is open sky, 1 the roof fully closed.
 */
function Room({ land, closed, burst, result }: { land: Land; closed: React.RefObject<number>; burst: React.RefObject<number>; result: { shares: number[]; colours: string[] } }) {
  const y = land.summit;
  const stone = useMemo(() => stoneMaterial({ a: "#cdbf9f", b: "#958670", brick: [1.05, 0.46], moss: 0.45 }), []);
  const floorStone = useMemo(() => stoneMaterial({ a: "#c9bca0", b: "#9a8d76", brick: [1.0, 0.85], moss: 0.12, radial: new THREE.Vector3(HILL.x, 0, HILL.z) }), []);
  const ring = useMemo(() => {
    const { radius: R, wall: H, thick: T } = ROOM;
    const profile = [
      new THREE.Vector2(R - T, -1.2),
      new THREE.Vector2(R, -1.2),
      new THREE.Vector2(R + 0.12, H - 0.25),
      new THREE.Vector2(R + 0.12, H),
      new THREE.Vector2(R - T - 0.1, H),
      new THREE.Vector2(R - T - 0.1, H - 0.25),
      new THREE.Vector2(R - T, H - 0.3),
      new THREE.Vector2(R - T, -1.2),
    ];
    return new THREE.LatheGeometry(profile, 96);
  }, []);
  const bench = useMemo(() => {
    const R = ROOM.radius - ROOM.thick;
    const profile = [
      new THREE.Vector2(R, 0),
      new THREE.Vector2(R - 0.95, 0),
      new THREE.Vector2(R - 0.95, 0.42),
      new THREE.Vector2(R - 1.05, 0.48),
      new THREE.Vector2(R, 0.48),
      new THREE.Vector2(R, 0),
    ];
    return new THREE.LatheGeometry(profile, 96);
  }, []);
  // the roof is an aperture: twelve blades of a shallow cone that slide out of the copper rim and meet at the centre
  const blades = useMemo(() => {
    const R = ROOM.radius - 0.05;
    const rise = 1.7;
    const step = (2 * Math.PI) / PETALS;
    return Array.from({ length: PETALS }, (_, i) => {
      const mid = i * step;
      const g = new THREE.ConeGeometry(R, rise, 6, 6, true, mid - step * 0.56, step * 1.12);
      const rim = new THREE.Vector3(R * Math.sin(mid), -rise / 2, R * Math.cos(mid));
      g.translate(-rim.x, -rim.y, -rim.z);
      g.computeVertexNormals();
      return { geometry: g, at: rim.clone().setY(ROOM.wall + 0.3) };
    });
  }, []);
  const rimCap = useMemo(() => {
    const R = ROOM.radius;
    return new THREE.LatheGeometry(
      [
        new THREE.Vector2(R - ROOM.thick - 0.06, 0),
        new THREE.Vector2(R + 0.16, 0),
        new THREE.Vector2(R + 0.16, 0.16),
        new THREE.Vector2(R + 0.04, 0.22),
        new THREE.Vector2(R - ROOM.thick + 0.06, 0.22),
        new THREE.Vector2(R - ROOM.thick - 0.06, 0.16),
        new THREE.Vector2(R - ROOM.thick - 0.06, 0),
      ],
      96,
    );
  }, []);
  const seat = useMemo(() => {
    const R = ROOM.radius - ROOM.thick;
    return new THREE.LatheGeometry(
      [
        [R + 0.02, 0], [R - 1.08, 0], [R - 1.12, 0.05], [R - 1.08, 0.1], [R + 0.02, 0.1], [R + 0.02, 0],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      120,
    );
  }, []);
  const petals = useRef<THREE.Group[]>([]);
  const circle = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const t = closed.current ?? 0;
    // blades grow out of the rim towards the centre; a little stagger makes it read as one mechanism turning
    petals.current.forEach((p, i) => {
      if (!p) return;
      const k = THREE.MathUtils.clamp(t * 1.12 - (i % 2) * 0.06, 0, 1);
      const e = k * k * (3 - 2 * k);
      p.scale.setScalar(Math.max(e, 0.0001));
      p.visible = e > 0.002;
    });
    if (circle.current) circle.current.emissiveIntensity = 2.4 + Math.sin(clock.elapsedTime * 2.2) * 0.6;
  });

  const floor = useMemo(() => {
    const g = new THREE.CircleGeometry(ROOM.radius - ROOM.thick + 0.05, 96);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  return (
    <group position={[HILL.x, y, HILL.z]}>
      <mesh geometry={ring} material={stone} castShadow receiveShadow />
      <mesh geometry={bench} material={stone} castShadow receiveShadow />
      <mesh geometry={seat} position={[0, 0.48, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#8c5f3b" roughness={0.7} />
      </mesh>
      <mesh geometry={floor} material={floorStone} receiveShadow position={[0, 0.02, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[1.05, 1.32, 96]} />
        <meshStandardMaterial ref={circle} color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
        <circleGeometry args={[1.05, 64]} />
        <meshStandardMaterial color="#13261a" emissive={TAP_GREEN} emissiveIntensity={0.18} roughness={0.4} />
      </mesh>
      <BurnBowl stone={stone} />
      <Embers burst={burst} />
      <SkyDial shares={result.shares} colours={result.colours} height={ROOM.wall + 6} />
      <group position={[-5.6, 0, 3.4]} rotation={[0, 2.2, 0]}>
        <TeaRobot />
      </group>
      {/* the room is lived in: warm light from inside rises over the rim */}
      <pointLight position={[0, 2.2, 0]} color="#ffc27a" intensity={40} distance={22} decay={1.6} />
      <mesh geometry={rimCap} position={[0, ROOM.wall, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#7c8f74" metalness={0.55} roughness={0.5} />
      </mesh>
      {blades.map((b, i) => (
        <group key={i} position={b.at} ref={(g) => void (petals.current[i] = g!)}>
          <mesh geometry={b.geometry} castShadow receiveShadow>
            <meshStandardMaterial color="#5f8f78" metalness={0.6} roughness={0.36} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Loose stones in the meadow, so the ground has things in it at every scale. */
function Rocks({ land }: { land: Land }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.DodecahedronGeometry(1, 1);
    const r = rng(70);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), p.getY(i) * (0.45 + r() * 0.2), p.getZ(i) * (0.8 + r() * 0.4));
    g.computeVertexNormals();
    return g;
  }, []);
  const spots = useMemo(() => scatter(9, 70, [-90, 10, 90, 190], 5, (x, z) => land.toPath(x, z) > 2.8), [land]);
  useLayoutEffect(() => {
    const r = rng(77);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const k = 0.25 + r() * r() * 1.1;
      m.compose(new THREE.Vector3(x, land.height(x, z) - k * 0.15, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), new THREE.Vector3(k, k, k));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [land, spots]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, spots.length]} castShadow receiveShadow>
      <meshStandardMaterial color="#9b9282" roughness={0.95} />
    </instancedMesh>
  );
}

/** A green circle in the ground: the reserved glow that marks where the visitor acts, breathing slowly. */
function TapCircle({ position, radius = 1.2 }: { position: [number, number, number]; radius?: number }) {
  const ring = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (ring.current) ring.current.emissiveIntensity = 2.2 + Math.sin(weather.time.value * 2.2) * 0.6;
  });
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh position={[0, 0, 0.03]}>
        <ringGeometry args={[radius * 0.8, radius, 72]} />
        <meshStandardMaterial ref={ring} color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={2.2} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[radius * 0.8, 48]} />
        <meshStandardMaterial color="#20301f" emissive={TAP_GREEN} emissiveIntensity={0.12} roughness={0.6} />
      </mesh>
    </group>
  );
}

/**
 * The gate where the walk starts (ch. 1: a gate with a glowing green circle): two stone posts with caps, a timber beam
 * across them with a board hanging from it and a lantern on each post, and the circle on the path before it, where you
 * tap to come in.
 */
function Gate({ land }: { land: Land }) {
  const stone = useMemo(() => stoneMaterial({ a: "#c9bb9d", b: "#968873", brick: [0.55, 0.32], moss: 0.6 }), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5a3d26", roughness: 0.85 }), []);
  const board = useRef<THREE.Group>(null);
  const at = land.path.getPointAt(GATE_T);
  const tan = land.path.getTangentAt(GATE_T);
  const y = land.height(at.x, at.z);
  const turn = Math.atan2(tan.x, tan.z);
  // the board swings a little in the wind
  useFrame(() => {
    if (board.current) board.current.rotation.x = Math.sin(weather.time.value * 1.3) * 0.05;
  });
  return (
    <group position={[at.x, y, at.z]} rotation={[0, turn, 0]}>
      {[-2.5, 2.5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh material={stone} position={[0, 1.9, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.95, 3.8, 0.95]} />
          </mesh>
          <mesh material={stone} position={[0, 3.92, 0]} castShadow>
            <boxGeometry args={[1.15, 0.24, 1.15]} />
          </mesh>
          <mesh position={[0, 4.28, 0]} castShadow>
            <coneGeometry args={[0.62, 0.5, 4]} />
            <meshStandardMaterial color="#8f3f2a" roughness={0.75} />
          </mesh>
          {/* a lantern on the inner face of the post */}
          <mesh position={[-Math.sign(x) * 0.6, 3.1, -0.1]}>
            <boxGeometry args={[0.24, 0.34, 0.24]} />
            <meshStandardMaterial color="#ffe2a8" emissive="#ffb35c" emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* the beam, resting on the caps and running past them */}
      <mesh material={wood} position={[0, 4.1, 0]} castShadow>
        <boxGeometry args={[7.2, 0.34, 0.42]} />
      </mesh>
      {[-3.45, 3.45].map((x) => (
        <mesh key={x} material={wood} position={[x, 4.1, 0]} rotation={[0, 0, Math.sign(x) * 0.5]}>
          <boxGeometry args={[0.36, 0.3, 0.44]} />
        </mesh>
      ))}
      <group ref={board} position={[0, 3.93, 0]}>
        {[-0.75, 0.75].map((x) => (
          <mesh key={x} position={[x, -0.25, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.5, 4]} />
            <meshStandardMaterial color="#2c2620" metalness={0.6} roughness={0.5} />
          </mesh>
        ))}
        <mesh material={wood} position={[0, -0.78, 0]} castShadow>
          <boxGeometry args={[2.1, 0.62, 0.1]} />
        </mesh>
        {/* the board shows the circle you are about to step into */}
        {[1, -1].map((side) => (
          <mesh key={side} position={[0, -0.78, side * 0.056]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
            <ringGeometry args={[0.15, 0.21, 32]} />
            <meshStandardMaterial color="#0f2a18" emissive={TAP_GREEN} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        ))}
      </group>
      <TapCircle position={[0, 0.14, 1.1]} radius={1.3} />
    </group>
  );
}

/**
 * Pulse's post beside the path: the street vote of ch. 1 (your watch buzzes, a slider from -5 to 5, "Select") as a
 * small board on a post, five knobs along a bar glowing in turn, and the green circle before it.
 */
function PollPost({ land }: { land: Land }) {
  const knobs = useRef<THREE.MeshStandardMaterial[]>([]);
  const at = land.path.getPointAt(POST_T);
  const tan = land.path.getTangentAt(POST_T);
  const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(-4.2);
  const x = at.x + side.x;
  const z = at.z + side.z;
  const y = land.height(x, z);
  useFrame(() => {
    const t = weather.time.value;
    knobs.current.forEach((m, i) => {
      if (m) m.emissiveIntensity = 0.4 + 2.2 * Math.max(0, Math.cos((t * 1.4 - i * 0.6) % (Math.PI * 2)));
    });
  });
  return (
    // the board turns to the path and down it, so the walker coming up reads it
    <group position={[x, y, z]} rotation={[0, Math.atan2(-side.x / 4.2 - tan.x * 1.3, -side.z / 4.2 - tan.z * 1.3), 0]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 2.2, 8]} />
        <meshStandardMaterial color="#4e3925" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.25, 0.05]} castShadow>
        <boxGeometry args={[1.9, 1.05, 0.12]} />
        <meshStandardMaterial color="#e9dfc8" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.25, 0.12]}>
        <boxGeometry args={[1.45, 0.05, 0.02]} />
        <meshStandardMaterial color="#5a4a36" />
      </mesh>
      {["#e8605a", "#efa25a", "#e9d66b", "#9fd36a", "#5bc98a"].map((c, i) => (
        <mesh key={c} position={[-0.68 + i * 0.34, 2.25, 0.14]}>
          <sphereGeometry args={[0.08, 16, 12]} />
          <meshStandardMaterial ref={(m) => void (knobs.current[i] = m!)} color={c} emissive={c} emissiveIntensity={0.6} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 2.86, 0.02]} rotation={[0, 0, Math.PI / 4]} castShadow>
        <boxGeometry args={[0.32, 0.32, 0.16]} />
        <meshStandardMaterial color="#a8492f" roughness={0.75} />
      </mesh>
      <TapCircle position={[0, 0.06, 1.5]} radius={1.1} />
    </group>
  );
}

/** Lanterns on wooden posts along the path, alternating sides: they lead the eye and glow at dusk. */
function Lanterns({ land }: { land: Land }) {
  const spots = useMemo(() => {
    const out: { p: THREE.Vector3; side: number }[] = [];
    const n = 16;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = land.path.getPointAt(t);
      const tan = land.path.getTangentAt(t);
      const side = i % 2 ? 1 : -1;
      const off = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(2.6 * side);
      const at = p.clone().add(off);
      at.y = land.height(at.x, at.z);
      out.push({ p: at, side });
    }
    return out;
  }, [land]);
  return (
    <>
      {spots.map(({ p }, i) => (
        <group key={i} position={p}>
          <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 1.7, 6]} />
            <meshStandardMaterial color="#4e3925" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.78, 0]}>
            <boxGeometry args={[0.26, 0.32, 0.26]} />
            <meshStandardMaterial color="#ffe2a8" emissive="#ffb35c" emissiveIntensity={2.2} toneMapped={false} />
          </mesh>
          <mesh position={[0, 1.98, 0]} castShadow>
            <coneGeometry args={[0.24, 0.16, 4]} />
            <meshStandardMaterial color="#3a2a1c" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * Far ranges all around in three layers, each paler and bluer with distance (the air between), with soft ridges:
 * they give the hill its scale without competing with it.
 */
function Mountains() {
  const layers = useMemo(
    () =>
      [
        { r: 760, h: 150, base: "#7d9aa6", top: "#a9bfc8", seed: 93 },
        { r: 620, h: 110, base: "#5f8279", top: "#8fa9a4", seed: 92 },
        { r: 500, h: 60, base: "#4b6f55", top: "#6f8f6c", seed: 91 },
      ].map(({ r, h, base, top, seed }) => {
        const n = simplex2(seed);
        const g = new THREE.CylinderGeometry(1, 1, 1, 720, 8, true);
        const pos = g.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const lo = new THREE.Color(base);
        const hi = new THREE.Color(top);
        for (let i = 0; i < pos.count; i++) {
          const a = Math.atan2(pos.getZ(i), pos.getX(i));
          const v = pos.getY(i) + 0.5;
          const ridge = Math.pow(0.5 + 0.5 * fbm(n, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 6), 1.6);
          const height = (h * 0.25 + ridge * h) * v;
          const rr = r - v * r * 0.18;
          pos.setXYZ(i, Math.cos(a) * rr, height - 10, Math.sin(a) * rr);
          const c = lo.clone().lerp(hi, Math.pow(v, 0.7));
          colors.set([c.r, c.g, c.b], i * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        return g;
      }),
    [],
  );
  return (
    <>
      {layers.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} fog={false} />
        </mesh>
      ))}
    </>
  );
}

const STILL = { current: 0 };
const DEMO_RESULT = { shares: [46, 31, 15, 8], colours: ["#f2c14e", "#7fc8f8", "#f78c6b", "#b8a1e8"] };

function EvelorHill({ live }: SetProps) {
  const land = useHillLand();
  // fewer blades on slower devices: grass is the easiest place to spend less
  const tier = useWorld((s) => s.tier);
  const cottages = useMemo(
    () => [
      { x: -17, z: 58, turn: 0.5 },
      { x: 18, z: 64, turn: -0.6 },
      { x: -26, z: 84, turn: 0.9 },
      { x: 24, z: 96, turn: -1.1 },
      { x: -12, z: 132, turn: 0.2 },
    ],
    [],
  );
  return (
    <group>
      <Ground land={land} />
      <Grass land={land} count={[40000, 60000, 110000, 150000][tier]} />
      <Lanterns land={land} />
      <Mountains />
      <Forest land={land} />
      <Rocks land={land} />
      {cottages.map((c, i) => (
        <Cottage key={i} land={land} {...c} seed={i + 1} />
      ))}
      <Arch land={land} />
      <Gate land={land} />
      <PollPost land={land} />
      <Room land={land} closed={live.roof ?? STILL} burst={live.burst ?? STILL} result={live.result ?? DEMO_RESULT} />
    </group>
  );
}

/** Stops 0 to 2: the gate where the walk starts, the Kalimar path (Pulse), and the round room on the hill (Ask). */
export const hillSet: SetModule = {
  id: "hill",
  origin: [0, 0, 0],
  hour: 8.5,
  poses: {
    // just outside the gate: its posts and circle in the left part of the view, the hill beyond
    gate: poseBehind(GATE_T, 16, 3.2, onPath(GATE_T).p.clone().add(new THREE.Vector3(5, 5, -30)), 3),
    // a few steps before the post: the post and its circle on the left, the path winding up to the hill behind
    pulse: (() => {
      const { p, tan, side } = onPath(POST_T);
      const post = p.clone().addScaledVector(side, -4.2);
      const look = post.clone().addScaledVector(tan, 10).addScaledVector(side, 4.5);
      look.y = LAND.height(post.x, post.z) + 2.4;
      return poseBehind(POST_T, 15, 3.6, look, 0);
    })(),
    // the panel takes the right half: the bowl and its green circle sit in the left part of the view
    ask: { position: [7.2, 29.6, 5.8], target: [2.6, 26.3, -2.2] },
  },
  ground: LAND.height,
  Scene: EvelorHill,
};
