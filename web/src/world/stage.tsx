"use client";

/**
 * Sky, sun, air and the camera's finish, shared by every stop: a physical sky for the time of day, one warm sun with
 * soft shadows, sky and ground bounce light, distance haze in the sky's own colour, then ambient occlusion, bloom on
 * what glows, a touch of grain and vignette, and AgX tone mapping over all of it.
 */
import { Environment, Lightformer } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, Noise, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { weather } from "./kit/materials";
import { PaintedSky, skyAt } from "./kit/sky";
import { labOff } from "./lab";

/** The sun for an hour of the day, 6 (sunrise) to 18 (sunset), coming up in the east (+x) and setting in the west. */
export function sunAt(hour: number) {
  const a = ((hour - 6) / 12) * Math.PI;
  const elevation = Math.sin(a) * 0.95;
  return new THREE.Vector3(Math.cos(a), Math.max(elevation, -0.1), 0.55).normalize();
}

export function Stage({ hour, quality = "high" }: { hour: number; quality?: "high" | "low" }) {
  const sun = useMemo(() => sunAt(hour), [hour]);
  const warm = THREE.MathUtils.smoothstep(sun.y, 0.05, 0.45);
  const sunColour = useMemo(() => new THREE.Color("#ffb46b").lerp(new THREE.Color("#fff3df"), warm), [warm]);
  const sky = useMemo(() => skyAt(hour), [hour]);
  const haze = useMemo(() => new THREE.Color(sky.horizon), [sky]);
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.Fog(haze, 240, 1200);
    return () => void (scene.fog = null);
  }, [scene, haze]);

  return (
    <>
      {!labOff("sky") && <PaintedSky sun={sun} colours={sky} time={weather.time} />}
      <hemisphereLight args={["#bcd8f0", "#4f6b33", 0.28]} />
      <directionalLight
        position={sun.clone().multiplyScalar(160)}
        color={sunColour}
        intensity={4.6}
        castShadow={!labOff("shadow")}
        shadow-mapSize={[4096, 4096]}
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
