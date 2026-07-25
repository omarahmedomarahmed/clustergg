"use client";

import { useActionState } from "react";
import { registerCommands, repostGuides, runOnboarding, type BotActionState } from "@/app/actions/discord";

// The operational buttons for the bot. Everything here is deliberately a form
// with a button — running the platform should never require a terminal.

function Result({ state }: { state: BotActionState }) {
  if (!state) return null;
  const bad = !!state.error;
  return (
    <div className={`mt-3 text-sm rounded-xl px-4 py-3 border ${bad ? "border-red-400/30 bg-red-500/10 text-red-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>
      {state.error ?? state.ok}
    </div>
  );
}

export function RegisterCommands({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState(registerCommands, undefined);
  return (
    <form action={action} className="glass p-6">
      <h2 className="font-bold mb-1">Register the /cluster command</h2>
      <p className="text-xs text-muted mb-4">
        Run this once now, and again any time the command list changes. Leave the server ID blank to
        register globally (can take up to an hour to appear); fill it in to register to one server,
        where it works <strong>immediately</strong> — that&apos;s what you want for testing.
      </p>
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[240px]">
          <span className="block text-xs text-muted mb-1">Server (guild) ID — optional</span>
          <input name="guildId" placeholder="e.g. 1123581321345589" className="input-cosmic w-full" />
        </label>
        <button disabled={!ready || pending} className="grad-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-50">
          {pending ? "Registering…" : "Register /cluster"}
        </button>
      </div>
      <p className="text-[11px] text-muted mt-2">
        To find your server ID: Discord → Settings → Advanced → turn on Developer Mode, then
        right-click your server icon → Copy Server ID.
      </p>
      <Result state={state} />
    </form>
  );
}

export function GuideTools({ ready }: { ready: boolean }) {
  const [postState, postAction, posting] = useActionState(repostGuides, undefined);
  const [onboardState, onboardAction, onboarding] = useActionState(runOnboarding, undefined);
  return (
    <div className="grid md:grid-cols-2 gap-5">
      <form action={onboardAction} className="glass p-6">
        <h2 className="font-bold mb-1">Set up a server manually</h2>
        <p className="text-xs text-muted mb-4">
          Creates <code className="text-cyan-300">#clustergg</code>, posts and pins every how-to
          guide, and DMs the owner — the same thing that runs automatically on install. Use it if an
          install half-finished, or if the bot was added with Discord&apos;s own button.
        </p>
        <input name="guildId" placeholder="Server (guild) ID" className="input-cosmic w-full mb-3" />
        <button disabled={!ready || onboarding} className="ghost-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-50">
          {onboarding ? "Setting up…" : "Run setup"}
        </button>
        <Result state={onboardState} />
      </form>

      <form action={postAction} className="glass p-6">
        <h2 className="font-bold mb-1">Re-post the guides</h2>
        <p className="text-xs text-muted mb-4">
          Posts a fresh, pinned set of guide cards into an existing server. Use after editing guide
          copy or artwork so servers pick up the new version.
        </p>
        <input name="guildId" placeholder="Server (guild) ID" className="input-cosmic w-full mb-3" />
        <button disabled={!ready || posting} className="ghost-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-50">
          {posting ? "Posting…" : "Re-post guides"}
        </button>
        <Result state={postState} />
      </form>
    </div>
  );
}
