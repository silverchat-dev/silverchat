"use client";

/**
 * What surrounds the library, for the walk in: a paved square with a ring of street lamps, trees along its sides, the
 * copper roof and the glass lantern over the skylight, glowing warm at dusk from the lamps inside.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { barkMaterial, foliageMaterial } from "../../kit/materials";
import { rng } from "../../kit/noise";
import { scatter, treeGeometry } from "../../kit/vegetation";
import { Instances } from "./props";

/** One kind of tree, instanced at the given spots (as on the hill, lighter crowns: these are seen from afar). */
function Trees({ spots, seed }: { spots: [number, number][]; seed: number }) {
  const wood = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const cards = useRef<THREE.InstancedMesh>(null);
  const tree = useMemo(() => treeGeometry("broadleaf", seed, false), [seed]);
  const mats = useMemo(() => ({ wood: barkMaterial(), leaves: foliageMaterial(tree.crownBase), cards: foliageMaterial(tree.crownBase, true) }), [tree]);
  useLayoutEffect(() => {
    const r = rng(seed * 13);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const k = 1.3 + r() * 0.5;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
      m.compose(new THREE.Vector3(x, -0.65, z), q, new THREE.Vector3(k, k * (0.9 + r() * 0.25), k));
      for (const mesh of [wood.current, leaves.current, cards.current]) mesh?.setMatrixAt(i, m);
      c.setRGB(1, 1, 1).multiplyScalar(0.8 + r() * 0.3);
      leaves.current!.setColorAt(i, c);
      cards.current?.setColorAt(i, c);
    });
    for (const mesh of [wood.current, leaves.current, cards.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [spots, seed]);
  return (
    <>
      <instancedMesh ref={wood} args={[tree.wood, mats.wood, spots.length]} castShadow receiveShadow />
      <instancedMesh ref={leaves} args={[tree.leaves, mats.leaves, spots.length]} castShadow receiveShadow />
      {tree.cards && <instancedMesh ref={cards} args={[tree.cards, mats.cards, spots.length]} receiveShadow />}
    </>
  );
}

/**
 * The square and the roof. `hall` gives the hall's half-width, front, back and roof height; `sky` the skylight's
 * half-width and its two ends.
 */
export function Outside({ hall, sky }: { hall: { w: number; front: number; back: number; h: number }; sky: { x: number; z0: number; z1: number } }) {
  const parts = useMemo(() => {
    // trees down both sides of the square and behind the hall, kept clear of the facade
    const spots: [number, number][] = [];
    const r = rng(61);
    for (let z = hall.front + 6; z < hall.front + 60; z += 7 + r() * 3) {
      for (const s of [-1, 1]) spots.push([s * (26 + r() * 4), z + r() * 2]);
    }
    for (let z = hall.back - 2; z < hall.front - 2; z += 8 + r() * 3) {
      for (const s of [-1, 1]) spots.push([s * (hall.w + 7 + r() * 4), z]);
    }
    const square = (x: number, z: number) => Math.abs(x) < 33 && z > hall.back - 8 && z < hall.front + 66;
    spots.push(...scatter(62, 100, [-150, -90, 150, 150], 10, (x, z) => !square(x, z) && Math.hypot(x, z) > 30));
    // street lamps around the square: posts and glowing heads
    const posts: THREE.Matrix4[] = [];
    const heads: THREE.Matrix4[] = [];
    for (let z = hall.front + 10; z < hall.front + 50; z += 13) {
      for (const s of [-1, 1]) {
        posts.push(new THREE.Matrix4().makeTranslation(s * 20, -0.5, z));
        heads.push(new THREE.Matrix4().makeTranslation(s * 20, 3.4, z));
      }
    }
    const post = mergeGeometries([
      new THREE.CylinderGeometry(0.07, 0.11, 3.6, 8).translate(0, 1.8, 0),
      new THREE.CylinderGeometry(0.22, 0.26, 0.2, 8).translate(0, 0.1, 0),
      new THREE.ConeGeometry(0.34, 0.3, 4).rotateY(Math.PI / 4).translate(0, 4.4, 0),
    ]);
    const head = new THREE.BoxGeometry(0.34, 0.5, 0.34);
    // the copper roof over the hall, open over the skylight
    const top = hall.h + 0.55;
    const roof = mergeGeometries([
      new THREE.BoxGeometry(hall.w + 0.8 - sky.x, 0.2, hall.front - hall.back + 0.8).translate(-(hall.w + 0.8 + sky.x) / 2, top, (hall.back - 0.8 + hall.front) / 2),
      new THREE.BoxGeometry(hall.w + 0.8 - sky.x, 0.2, hall.front - hall.back + 0.8).translate((hall.w + 0.8 + sky.x) / 2, top, (hall.back - 0.8 + hall.front) / 2),
      new THREE.BoxGeometry(2 * sky.x, 0.2, hall.front - sky.z1).translate(0, top, (sky.z1 + hall.front) / 2),
      new THREE.BoxGeometry(2 * sky.x, 0.2, sky.z0 - hall.back + 0.8).translate(0, top, (sky.z0 + hall.back - 0.8) / 2),
    ]);
    // the lantern: a pitched glass roof over the skylight with glass gable ends
    const len = sky.z1 - sky.z0;
    const rise = 1.6;
    const slope = Math.hypot(sky.x, rise);
    const tilt = Math.atan2(rise, sky.x);
    const gable = new THREE.Shape([new THREE.Vector2(-sky.x, 0), new THREE.Vector2(sky.x, 0), new THREE.Vector2(0, rise)]);
    const glass = mergeGeometries([
      new THREE.PlaneGeometry(slope, len).rotateX(-Math.PI / 2).rotateZ(tilt).translate(-sky.x / 2, top + rise / 2, (sky.z0 + sky.z1) / 2),
      new THREE.PlaneGeometry(slope, len).rotateX(-Math.PI / 2).rotateZ(-tilt).translate(sky.x / 2, top + rise / 2, (sky.z0 + sky.z1) / 2),
      new THREE.ShapeGeometry(gable).translate(0, top, sky.z1),
      new THREE.ShapeGeometry(gable).translate(0, top, sky.z0),
    ]);
    // its ribs
    const ribs: THREE.BufferGeometry[] = [new THREE.BoxGeometry(0.12, 0.12, len).translate(0, top + rise, (sky.z0 + sky.z1) / 2)];
    for (let z = sky.z0; z <= sky.z1 + 0.01; z += len / 10) {
      for (const s of [-1, 1]) ribs.push(new THREE.BoxGeometry(slope, 0.08, 0.08).rotateZ(-s * tilt).translate((s * sky.x) / 2, top + rise / 2, z));
    }
    return { spots, posts, heads, post, head, roof, glass, ribs: mergeGeometries(ribs) };
  }, [hall, sky]);
  const mats = useMemo(
    () => ({
      post: new THREE.MeshStandardMaterial({ color: "#2e2a26", roughness: 0.6, metalness: 0.4 }),
      head: new THREE.MeshStandardMaterial({ color: "#ffe2a8", emissive: "#ffb35c", emissiveIntensity: 2.4, toneMapped: false }),
    }),
    [],
  );
  const pediment = useMemo(() => {
    const shape = new THREE.Shape([new THREE.Vector2(-8, 0), new THREE.Vector2(8, 0), new THREE.Vector2(0, 3.4)]);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1 });
  }, []);
  return (
    <>
      <mesh geometry={pediment} position={[0, 14.15, hall.front + 0.5]} castShadow receiveShadow>
        <meshStandardMaterial color="#c9b48f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 15.35, hall.front + 1.25]}>
        <circleGeometry args={[0.85, 48]} />
        <meshStandardMaterial color="#e8c25f" emissive="#c9973e" emissiveIntensity={0.4} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 15.35, hall.front + 1.27]}>
        <circleGeometry args={[0.6, 48]} />
        <meshStandardMaterial color="#1f2c55" roughness={0.6} />
      </mesh>
      <Trees spots={parts.spots} seed={808} />
      <Instances geometry={parts.post} material={mats.post} matrices={parts.posts} cast />
      <Instances geometry={parts.head} material={mats.head} matrices={parts.heads} />
      <mesh geometry={parts.roof} castShadow receiveShadow>
        <meshStandardMaterial color="#5f8f78" metalness={0.55} roughness={0.45} />
      </mesh>
      <mesh geometry={parts.ribs} castShadow>
        <meshStandardMaterial color="#3e4a44" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* warm light from the hall shows through the glass */}
      <mesh geometry={parts.glass}>
        <meshStandardMaterial color="#ffe6b8" emissive="#ffb766" emissiveIntensity={0.55} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  );
}
