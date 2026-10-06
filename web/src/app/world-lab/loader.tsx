"use client";

import dynamic from "next/dynamic";

export const LabLoader = dynamic(() => import("@/world/lab").then((m) => m.Lab), { ssr: false });
