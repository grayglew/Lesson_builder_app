import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Source_Serif_4,
} from "next/font/google";
import { notFound } from "next/navigation";
import { BuilderDesignReview } from "@/features/design-review/BuilderDesignReview";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  variable: "--font-atkinson",
  weight: ["400", "700"],
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: "Lesson Builder UI design review",
  description: "A fixture-only comparison of proposed Lesson Builder interfaces.",
};

export default function BuilderDesignReviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <main
      className={`${plexSans.variable} ${plexMono.variable} ${atkinson.variable} ${sourceSerif.variable}`}
    >
      <BuilderDesignReview />
    </main>
  );
}
