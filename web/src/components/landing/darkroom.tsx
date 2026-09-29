"use client";

import Image from "next/image";
import { useState } from "react";

import { Exposure } from "./exposure";
import { PrintCard } from "./print-card";

/** The developer tray with the example print, and the exposure dial under it. */
export function Darkroom() {
  const [step, setStep] = useState(2);

  return (
    <div className="space-y-4">
      <div className="@container relative w-full overflow-hidden" style={{ aspectRatio: "3 / 2" }}>
        <Image src="/plates/tray.webp" alt="" fill priority sizes="(min-width: 1024px) 48vw, 100vw" className="object-cover" />
        <PrintCard />
      </div>
      <Exposure step={step} onStep={setStep} />
    </div>
  );
}
