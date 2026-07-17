import { CP_ICON } from "@/lib/quests";

// The glorified Cluster Points currency icon (art), shown next to CP values.
export default function CpIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={CP_ICON} alt="CP" className={`inline-block shrink-0 object-contain align-[-0.15em] ${className}`} style={{ width: size, height: size }} />
  );
}
