import { Nav } from "@/components/site/nav";
import { Footer } from "@/components/site/footer";
import { Hero } from "@/components/landing/hero";
import { Problem } from "@/components/landing/problem";
import { Swarm } from "@/components/landing/swarm";
import { Loop } from "@/components/landing/loop";
import { Specialists } from "@/components/landing/specialists";
import { WorldModel } from "@/components/landing/world-model";
import { Incident } from "@/components/landing/incident";
import { Safeguards } from "@/components/landing/safeguards";
import { Closing } from "@/components/landing/closing";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Specialists />
        <Swarm />
        <Problem />
        <Loop />
        <WorldModel />
        <Incident />
        <Safeguards />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
