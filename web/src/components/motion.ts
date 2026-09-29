"use client";

import { useSyncExternalStore } from "react";

const RM = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** True when the visitor asked for less motion. True on the server, so nothing moves before we know. */
export const useReducedMotion = () => useSyncExternalStore(subscribe, () => window.matchMedia(RM).matches, () => true);
