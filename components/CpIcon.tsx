// The glorified Cluster Points currency icon (art), shown next to CP values.
// The image URL comes from the `--cp-icon` CSS variable set on <body> by the
// root layout from the CMS (`brand.cpIcon`), so admins can swap it globally.
export default function CpIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-contain bg-center bg-no-repeat align-[-0.15em] ${className}`}
      style={{ width: size, height: size, backgroundImage: "var(--cp-icon)" }}
    />
  );
}
