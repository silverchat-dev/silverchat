import { notFound } from "next/navigation";

import { LabLoader } from "./loader";

// a bench for building the world's stops: only in development
export default function WorldLab() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LabLoader />;
}
