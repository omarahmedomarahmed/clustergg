import type { Metadata } from "next";
import "./globals.css";
import { COPY } from "../lib/content/copy.ts";

export const metadata: Metadata = {
  title: "ClusterGG",
  // ===== IMPORTED, BECAUSE IT WAS A SECOND COPY OF THE TAGLINE =====
  //
  // This string was typed out here, word for word identical to `COPY.tagline`.
  // House rule 2's shape without a figure in it: two copies of one sentence,
  // and the day somebody edits the homepage the search result still says the
  // old thing. The code default rather than the live store — metadata is read
  // on every page and a content-store round trip for a meta tag is a database
  // query on every request for a sentence nobody sees.
  description: COPY.tagline,
  icons: { icon: "/favicon.svg" },
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
