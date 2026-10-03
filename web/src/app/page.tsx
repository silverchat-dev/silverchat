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

export default function Home() {
  return (
    <>
      <Hero />
      <Line />
      <Split />
      <Predict />
      <Realm />
      <Cash />
      <Burns />
      <Book />
      <Archive />
      <Verify />
      <Close />
    </>
  );
}
