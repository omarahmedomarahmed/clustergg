"use client";

import EntityImg from "@/components/EntityImg";

// A card cover that shows the FULL image (never cropped): a blurred, zoomed copy
// fills the whole area so there are no empty bars, and the real image sits on top
// with object-contain so the entire hero / champion / weapon / challenge art is
// visible. Used anywhere a cover previously cropped with object-cover.
export default function CoverImage({
  src, name, kind, heightClass = "h-40", rounded = "", padded = true, children,
}: {
  src?: string | null; name: string; kind?: string | null;
  heightClass?: string; rounded?: string; padded?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden ${heightClass} ${rounded}`}>
      {src && <div className="absolute inset-0 bg-cover bg-center scale-125 blur-2xl opacity-45" style={{ backgroundImage: `url(${src})` }} />}
      <div className="absolute inset-0 bg-[#04051a]/20" />
      <EntityImg src={src} name={name} kind={kind} className={`relative h-full w-full object-contain ${padded ? "p-2" : ""}`} />
      {children}
    </div>
  );
}
