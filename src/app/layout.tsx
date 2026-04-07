import type { Metadata, Viewport } from "next";
import { Roboto, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700", "900"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SwimSpa Dashboard",
  description: "Armstark Lotus 460 SwimSpa Monitoring",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${roboto.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 pb-24 sm:px-6 sm:pb-8">
          {children}
        </main>
      </body>
    </html>
  );
}
