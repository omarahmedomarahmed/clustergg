import AdSlot from "@/components/AdSlot";

// The slim global sponsor strip, styled to sit *over* a page's hero artwork
// rather than on the plain site backdrop. Drop it in at the top of a hero
// section (above the content, over the -z-10 background layer). Renders nothing
// until a creative is served, so it never leaves an empty gap.
export default function TopBannerAd({ className = "" }: { className?: string }) {
  return (
    <div className={`relative z-20 mx-auto w-full max-w-4xl px-4 ${className}`}>
      <AdSlot placement="top_banner" />
    </div>
  );
}
