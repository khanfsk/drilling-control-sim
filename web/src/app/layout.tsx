import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoDriller | Torsional Vibration Mitigation — Volve 15/9-F-9 A",
  description:
    "Closed-loop auto-driller simulation for stick-slip detection and mitigation " +
    "using real drilling telemetry from Equinor's Volve field (Well 15/9-F-9 A, 2009).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
