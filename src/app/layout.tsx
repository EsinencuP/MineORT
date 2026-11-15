import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Suspense } from "react";
import { NavProgress } from "@/components/layout/nav-progress";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { THEME_INIT_SCRIPT } from "@/components/layout/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Main face: Modula (a pixel face that reads well in Cyrillic and Latin). Display face: Pixar One.
// Both were supplied by the owner; see THIRD_PARTY_NOTICES.md for their licence terms.
const modula = localFont({
  src: "../fonts/Modula.woff2",
  variable: "--font-modula",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

const pixar = localFont({
  src: [
    { path: "../fonts/PixarOne-Regular.woff2", weight: "400" },
    { path: "../fonts/PixarOne-Bold.woff2", weight: "700" },
  ],
  variable: "--font-pixar",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "MineOrt V", template: "%s · MineOrt V" },
  description: "Сообщество MineOrt V: сервер Minecraft, игроки и карта мира.",
  openGraph: {
    title: "MineOrt V",
    description: "Сообщество MineOrt V: сервер Minecraft, игроки и карта мира.",
    images: [
      { url: "/brand/og.png", width: 1200, height: 630, alt: "MineOrt V" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      data-theme="dark"
      suppressHydrationWarning
      className={`${modula.variable} ${pixar.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ToastProvider>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          {/* Blurred voxel leaves and clouds frame the page card, like the reference background. */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/leaves.svg"
              alt=""
              className="absolute -top-16 -right-24 w-[26rem] max-w-none rotate-12 opacity-90 blur-[3px]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/leaves.svg"
              alt=""
              className="absolute top-[38%] -left-40 w-[22rem] max-w-none -rotate-12 opacity-60 blur-[6px]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/clouds.svg"
              alt=""
              className="absolute top-24 -left-10 w-72 max-w-none opacity-80 blur-[1px]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/art/clouds.svg"
              alt=""
              className="absolute right-[8%] bottom-24 w-64 max-w-none opacity-70 blur-[2px]"
            />
          </div>
          <div className="relative mx-auto w-full max-w-[1180px] px-2 py-3 sm:px-6 sm:py-8">
            <div className="page-card">
              <SiteHeader />
              <main>{children}</main>
              <SiteFooter />
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
