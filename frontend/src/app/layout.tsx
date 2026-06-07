import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deal Radar — AI Sales Co-Pilot",
  description: "Real-time deal activity stream with MEDDICC health scoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
