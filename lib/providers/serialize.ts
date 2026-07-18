import { PROVIDERS, isProviderLive } from "@/lib/providers/registry";
import { isOAuthLinkProvider } from "@/lib/oauth";
import type { ProviderInfo } from "@/components/LinkAccountForm";

// The connect-eligible providers, before any admin hide list is applied. Every
// provider — API-based, OAuth, and identity-only — is offered so gamers can link
// their whole identity; admins choose which to show via the hide list.
export function connectableProviders() {
  return PROVIDERS;
}

// `hidden` is the set of provider ids an admin has switched off for the connect
// + onboarding pickers (persisted in the CMS as `connect.hidden`).
export function providerInfoList(hidden: string[] = []): ProviderInfo[] {
  const hide = new Set(hidden);
  return connectableProviders()
    .filter((p) => !hide.has(p.id))
    .map((p) => ({
      oauth: isOAuthLinkProvider(p.id),
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
