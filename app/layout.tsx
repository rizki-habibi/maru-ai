import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maru AI",
  description: "AI workspace untuk chat, model, dan koneksi MAX Router.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}