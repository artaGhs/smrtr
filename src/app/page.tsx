import type { Metadata } from "next";
import localFont from "next/font/local";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/LandingPage";

const landingSerif = localFont({
  src: [
    { path: "../../public/fonts/instrument-serif-regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/instrument-serif-italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-landing-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const metadata: Metadata = {
  title: "SMRTR — Make the difficult click",
  description: "Turn dense notes and difficult topics into visual lessons you can explore. Less memorizing. More understanding.",
};

export default async function Home({ searchParams }: {
  searchParams: Promise<{ request?: string | string[] }>;
}) {
  const { request } = await searchParams;
  // Preserve existing lesson links now that the home page is the landing page.
  if (typeof request === "string" && request) redirect(`/study?request=${encodeURIComponent(request)}`);
  return <div className={landingSerif.variable}><LandingPage /></div>;
}
