// Send a client-downscaled data URL to the upload API. Returns a short hosted
// URL when Vercel Blob is configured, otherwise the data URL unchanged (so
// uploads always work). `scope` groups files and gates admin-only kinds.
export async function uploadImage(dataUrl: string, scope: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, scope }),
    });
    if (!res.ok) return dataUrl;
    const json = await res.json();
    return typeof json?.url === "string" ? json.url : dataUrl;
  } catch {
    return dataUrl;
  }
}
