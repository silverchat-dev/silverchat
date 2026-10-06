"use client";

/**
 * Sky, sun, air and the camera's finish, shared by every stop: a physical sky for the time of day, one warm sun with
 * soft shadows, sky and ground bounce light, distance haze in the sky's own colour, then ambient occlusion, bloom on
 * what glows, a touch of grain and vignette, and AgX tone mapping over all of it.
 */
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, Noise, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { weather } from "./kit/materials";
import { PaintedSky, skyAt } from "./kit/sky";
import { labOff } from "./lab";

/**
 * The light for an hour: the sun from 6 (sunrise, east +x) to 18 (sunset, west); after dusk the moon, high and pale,
 * so night scenes still have one clear light and readable shadows.
 */
export function sunAt(hour: number) {
  if (hour > 18.6) return new THREE.Vector3(-0.35, 0.8, 0.45).normalize();
  const a = ((hour - 6) / 12) * Math.PI;
  const elevation = Math.sin(a) * 0.95;
  return new THREE.Vector3(Math.cos(a), Math.max(elevation, 0.04), 0.55).normalize();
}

/** How much of the day is left: 1 in daylight, 0 at night, for the light's strength and colour. */
export const daylight = (hour: number) => 1 - THREE.MathUtils.smoothstep(hour, 17.6, 19.6);

/**
 * `veil` (0 to 1) thickens the air until the place is gone: the walk crosses from one place to the next inside it.
 * `quality` "low" drops ambient occlusion and the soft shadows' size, for phones and slower machines.
 */
export function Stage({
  hour,
  quality = "high",
  veil,
  centre = [0, 0, 0],
}: {
  hour: number;
  quality?: "high" | "low";
  veil?: { value: number };
  /** the origin of the place in view: the sun's shadows cover the area around it */
  centre?: [number, number, number];
}) {
  const sun = useMemo(() => sunAt(hour), [hour]);
  const [cx, cy, cz] = centre;
  const aim = useMemo(() => new THREE.Object3D(), []);
  const warm = THREE.MathUtils.smoothstep(sun.y, 0.05, 0.45);
  const day = daylight(hour);
  const sunColour = useMemo(
    () => new THREE.Color("#ffb46b").lerp(new THREE.Color("#fff3df"), warm).lerp(new THREE.Color("#8fa2e8"), 1 - day),
    [warm, day],
  );
  useFrame((_, dt) => {
    weather.time.value += Math.min(dt, 0.05);
    const f = scene.fog as THREE.Fog | null;
    const v = veil?.value ?? 0;
    if (f) {
      f.near = THREE.MathUtils.lerp(240, 1, v);
      f.far = THREE.MathUtils.lerp(1200, 30, v);
    }
  });
  const sky = useMemo(() => skyAt(hour), [hour]);
  const haze = useMemo(() => new THREE.Color(sky.horizon), [sky]);
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.Fog(haze, 240, 1200);
    return () => void (scene.fog = null);
  }, [scene, haze]);

  return (
    <>
      {!labOff("sky") && <PaintedSky sun={sun} colours={sky} time={weather.time} veil={veil} />}
      <hemisphereLight args={[day > 0.5 ? "#bcd8f0" : "#3a4878", day > 0.5 ? "#4f6b33" : "#151a22", 0.12 + 0.16 * day]} />
      <primitive object={aim} position={[cx, cy, cz]} />
      <directionalLight
        target={aim}
        position={sun.clone().multiplyScalar(160).add(new THREE.Vector3(cx, cy, cz))}
        color={sunColour}
        intensity={0.5 + 4.1 * day}
        castShadow={!labOff("shadow")}
        shadow-mapSize={quality === "high" ? [4096, 4096] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
        shadow-camera-near={10}
        shadow-camera-far={420}
      />
      {/* soft image-based light made here, not downloaded: a sky dome and a warm low bounce */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={0.6} color="#cfe3f5" scale={[40, 40, 1]} position={[0, 20, 0]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={0.8} color={sunColour} scale={[30, 8, 1]} position={sun.clone().multiplyScalar(30).toArray()} />
        <Lightformer form="rect" intensity={0.35} color="#6d8a45" scale={[60, 60, 1]} position={[0, -10, 0]} rotation-x={-Math.PI / 2} />
      </Environment>
      <EffectComposer multisampling={0} enableNormalPass={false}>
        {quality === "high" && !labOff("ao") ? <N8AO aoRadius={2.2} intensity={2.2} distanceFalloff={0.6} halfRes /> : <></>}
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.85} />
        <ToneMapping mode={ToneMappingMode.AGX} />
        {/* the grade: AgX keeps highlights soft but runs grey, so colour and contrast are put back by hand */}
        <HueSaturation saturation={0.22} hue={0} />
        <BrightnessContrast brightness={0.02} contrast={0.12} />
        <Vignette offset={0.28} darkness={0.42} />
        <Noise opacity={0.028} premultiply />
        <SMAA />
      </EffectComposer>
    </>
  );
}
