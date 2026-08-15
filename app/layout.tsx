import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClusterGG",
  description:
    "An automated weekly gaming competition that runs inside the Discord servers gamers already sit in.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
