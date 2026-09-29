import { Archive } from "@/components/landing/archive";
import { Book } from "@/components/landing/book";
import { Close } from "@/components/landing/close";
import { Hero } from "@/components/landing/hero";
import { Line } from "@/components/landing/line";
import { Split } from "@/components/landing/split";
import { Verify } from "@/components/landing/verify";

export default function Home() {
  return (
    <>
      <Hero />
      <Line />
      <Split />
      <Book />
      <Archive />
      <Verify />
      <Close />
    </>
  );
}
