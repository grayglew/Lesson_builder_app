import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { CompactConsoleReview } from "@/features/design-review/CompactConsoleReview";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Compact Console focused review",
  description: "An interactive, fixture-only review of the selected Lesson Builder direction.",
};

export default function CompactConsoleReviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <main className={`${plexSans.variable} ${plexMono.variable}`}>
      <CompactConsoleReview />
    </main>
  );
}
