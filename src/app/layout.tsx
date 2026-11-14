import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Pixelify_Sans } from "next/font/google";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

// Open pixel face with Cyrillic (SIL OFL); stands in for Minecraftia, which has no Cyrillic and a paid licence.
const pixel = Pixelify_Sans({
  variable: "--font-pixelify",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: { default: "MineOrt IV", template: "%s · MineOrt IV" },
  description: "Сообщество MineOrt IV: сервер Minecraft, игроки и карта мира.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${pixel.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ToastProvider>
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
