import type { Metadata } from "next";
import { isStagingEnvironment } from "@/lib/deployment-environment";
import "./hfy-design-tokens.css";
import "./globals.css";
import "./hfy-style-pilot.css";

const isStaging = isStagingEnvironment();

export const metadata: Metadata = {
  title: isStaging ? "STAGING · HFY OS" : "HFY OS",
  description: "Hear For You residency operations",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`hfy-style-system${isStaging ? " staging-environment" : ""}`}>
        {isStaging ? <div className="environment-banner" role="status">STAGING ENVIRONMENT</div> : null}
        {children}
      </body>
    </html>
  );
}
