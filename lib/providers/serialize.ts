import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import type { ProviderInfo } from "@/components/LinkAccountForm";

// The connect-eligible providers, before any admin hide list is applied. This
// is the full universe an admin can choose to show or hide on the connect /
// onboarding pickers.
export function connectableProviders() {
  return PROVIDERS
    .filter((p) => !["discord", "epic", "battlenet", "psn", "activision"].includes(p.id))
    .filter((p) => !p.identityOnly || p.id === "riot-valorant");
}

// `hidden` is the set of provider ids an admin has switched off for the connect
// + onboarding pickers (persisted in the CMS as `connect.hidden`).
export function providerInfoList(hidden: string[] = []): ProviderInfo[] {
  const hide = new Set(hidden);
  return connectableProviders()
    .filter((p) => !hide.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      game: p.game,
      glyph: p.glyph,
      live: isProviderLive(p),
      identifierLabel: p.identifierLabel,
      identifierHint: p.identifierHint,
      needsRegion: p.id.startsWith("riot-"),
      envVars: p.envVars,
      legalFlag: p.legalFlag,
      linkFlow: p.linkFlow,
    }));
}
