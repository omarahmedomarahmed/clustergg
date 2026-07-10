import Link from "next/link";

const TABS = [
  { key: "account", href: "/settings/account", label: "Account" },
  { key: "connections", href: "/settings/connections", label: "Connections" },
  { key: "notifications", href: "/settings/notifications", label: "Notifications" },
  { key: "privacy", href: "/settings/privacy", label: "Privacy" },
];

export default function SettingsNav({ active }: { active: string }) {
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
            active === t.key
              ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200"
              : "border-violet-400/20 text-muted hover:border-violet-400/50"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
