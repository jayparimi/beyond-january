import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "./ui/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ✅ Add viewport so mobile layouts render correctly
export const metadata: Metadata = {
  title: "Beyond January",
  description: "Consistency after motivation fades.",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full bg-neutral-950 text-neutral-100`}
      >
        {/* AppShell controls auth layout + nav */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
