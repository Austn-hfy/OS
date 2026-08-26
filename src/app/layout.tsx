import type { Metadata } from "next";
import "./hfy-design-tokens.css";
import "./globals.css";
import "./hfy-style-pilot.css";

export const metadata: Metadata = {
  title: "HFY OS",
  description: "Hear For You residency operations",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="hfy-style-system">{children}</body>
    </html>
  );
}
