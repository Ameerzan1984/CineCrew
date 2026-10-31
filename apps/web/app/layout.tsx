import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CineMesh — Imagine. Direct. Create. Share.", description: "A home for a new generation of filmmakers." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
