import { Archive } from "@/components/landing/archive";
import { Book } from "@/components/landing/book";
import { Burns } from "@/components/landing/burns";
import { Cash } from "@/components/landing/cash";
import { Close } from "@/components/landing/close";
import { Hero } from "@/components/landing/hero";
import { Line } from "@/components/landing/line";
import { Predict } from "@/components/landing/predict";
import { Realm } from "@/components/landing/realm";
import { Split } from "@/components/landing/split";
import { Verify } from "@/components/landing/verify";
import { CASH_LIVE, WORLD_LIVE } from "@/lib/config";
import { Gate } from "@/world/gate";
import { Walk } from "@/world/walk";

export default function Home() {
  if (WORLD_LIVE)
    return (
      <>
        <Walk />
        <Gate />
      </>
    );
  return (
    <>
      <Hero />
      <Line />
      <Split />
      <Predict />
      <Realm />
      {CASH_LIVE && <Cash />}
      <Burns />
      <Book />
      <Archive />
      <Verify />
      <Close />
    </>
  );
}
