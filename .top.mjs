import { chromium } from "playwright-core";
const B = process.env.BASE_URL || "http://localhost:3031";
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await br.newContext()).newPage();
await p.goto(`${B}/login`, { waitUntil: "networkidle" });
await p.fill('input[name="email"]', "admin@clustergg.com"); await p.fill('input[name="password"]', "cluster-admin");
await p.locator("form button.glow-btn").first().click(); await p.waitForTimeout(3000);
for (const path of ["/admin", "/", "/brands/nebulatech?key=DEMO-NEBULATECH"]) {
  await p.goto(B + path, { waitUntil: "networkidle" }).catch(()=>{});
  await p.request.get(`${B}/api/perf-count?reset=1`);
  await p.goto(B + path, { waitUntil: "networkidle" }).catch(()=>{});
  const r = await (await p.request.get(`${B}/api/perf-count`)).json();
  console.log(`\n=== ${path} — ${r.queries} queries ===`);
  for (const t of (r.top ?? []).slice(0, 8)) console.log(`  ${String(t.n).padStart(4)}×  ${t.q.slice(0, 100)}`);
}
await br.close();
