// "Cluster" — the platform mascot: a chibi cosmic astronaut (Higgsfield art).
// Served from the CDN; used across the layout as a recurring character. Swap
// the URL here (or later from the brand kit) to restyle the whole platform.
export const CLUSTER_MASCOT_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260714_193846_b4470f5f-7f3b-4b17-a12b-7371cb5253eb.png";

export default function ClusterMascot({
  size = 44, className = "", float = false, title = "Cluster",
}: { size?: number; className?: string; float?: boolean; title?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CLUSTER_MASCOT_URL}
      alt={title}
      title={title}
      width={size}
      height={size}
      className={`${float ? "float-y" : ""} ${className}`}
      style={{ width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(139,92,246,0.45))" }}
    />
  );
}
