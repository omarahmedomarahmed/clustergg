import { getContent, CONTENT_DEFAULTS } from "@/lib/cms";
import { saveContent } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Site content" };

const GROUPS: { title: string; note?: string; keys: { key: string; label: string; long?: boolean }[] }[] = [
  {
    title: "Homepage hero",
    keys: [
      { key: "hero.badge", label: "Badge pill text" },
      { key: "hero.title.line1", label: "Headline line 1" },
      { key: "hero.title.line2", label: "Headline line 2 (gradient)" },
      { key: "hero.subtitle", label: "Subtitle", long: true },
      { key: "hero.cta.primary", label: "Primary button" },
      { key: "hero.cta.secondary", label: "Secondary button" },
      { key: "hero.image", label: "Hero background image URL" },
    ],
  },
  {
    title: "Section headings",
    keys: [
      { key: "section.challenges.title", label: "Challenges title" },
      { key: "section.challenges.subtitle", label: "Challenges subtitle", long: true },
      { key: "section.games.title", label: "Games title" },
      { key: "section.games.subtitle", label: "Games subtitle", long: true },
      { key: "section.leaderboards.title", label: "Leaderboards title" },
      { key: "section.leaderboards.subtitle", label: "Leaderboards subtitle", long: true },
      { key: "section.badges.title", label: "Badges title" },
      { key: "section.badges.subtitle", label: "Badges subtitle", long: true },
      { key: "section.partners.title", label: "Partners strip label" },
    ],
  },
  {
    title: "Call to action & footer",
    keys: [
      { key: "section.cta.title", label: "CTA title" },
      { key: "section.cta.subtitle", label: "CTA subtitle", long: true },
      { key: "section.cta.button", label: "CTA button" },
      { key: "footer.tagline", label: "Footer tagline", long: true },
    ],
  },
  {
    title: "Background imagery",
    note: "Any hosted image URL. These back the challenges section, games pages and default profile banners.",
    keys: [
      { key: "banner.arena", label: "Challenges arena banner URL" },
      { key: "banner.games", label: "Games banner URL" },
      { key: "banner.profileDefault", label: "Default profile banner URL" },
    ],
  },
];

export default async function AdminContentPage() {
  const allKeys = GROUPS.flatMap((g) => g.keys.map((k) => k.key));
  const values = await getContent(allKeys);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Site content</h1>
      <p className="text-sm text-muted mb-6">
        Every headline, button label and background image on the public site — stored in the
        database, applied instantly. Empty field = built-in default.
      </p>

      <form action={saveContent} className="space-y-6">
        {GROUPS.map((group) => (
          <section key={group.title} className="glass p-6">
            <h2 className="font-bold mb-1">{group.title}</h2>
            {group.note && <p className="text-xs text-muted mb-4">{group.note}</p>}
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              {group.keys.map(({ key, label, long }) => (
                <div key={key} className={long ? "sm:col-span-2" : ""}>
                  <label className="text-xs text-muted block mb-1">
                    {label} <code className="text-[10px] text-cyan-300/70">{key}</code>
                  </label>
                  {long ? (
                    <textarea name={`content:${key}`} rows={2} defaultValue={values[key]} className="input-cosmic" />
                  ) : (
                    <input name={`content:${key}`} defaultValue={values[key]} className="input-cosmic" />
                  )}
                  {CONTENT_DEFAULTS[key] && values[key] !== CONTENT_DEFAULTS[key] && (
                    <div className="text-[10px] text-amber-300/70 mt-1">Customized (default: {CONTENT_DEFAULTS[key].slice(0, 60)}…)</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        <button className="glow-btn pressable rounded-full px-8 py-2.5 font-semibold text-white">
          Publish changes
        </button>
      </form>
    </div>
  );
}
