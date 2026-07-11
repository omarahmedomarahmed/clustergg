import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import type { ProviderInfo } from "@/components/LinkAccountForm";

export function providerInfoList(): ProviderInfo[] {
  return PROVIDERS
    .filter((p) => !["discord", "epic", "battlenet", "psn", "activision"].includes(p.id))
    .filter((p) => !p.identityOnly || p.id === "riot-valorant")
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
