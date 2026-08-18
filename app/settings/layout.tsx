// `/settings/*` — 04 §1. Account · connections · privacy · notifications.
//
// One layout with the site nav on it, because `/settings/connections` was
// built in Sprint 4a as a redirect target for the ownership-proof and Discord
// link round trips and never got a header. A page you can only leave with the
// back button is a page somebody gets stuck on.

import Link from "next/link";
import { Nav } from "../components.tsx";

export const SETTINGS_TABS = [
  { href: "/settings", label: "Account" },
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/notifications", label: "Notifications" },
] as const;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <div className="mx-auto max-w-2xl px-6 py-12">
        <nav className="flex flex-wrap gap-4 border-b border-line pb-4 text-sm">
          {SETTINGS_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              data-testid={`settings-tab-${tab.label.toLowerCase()}`}
              className="text-mute hover:text-white"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </>
  );
}
