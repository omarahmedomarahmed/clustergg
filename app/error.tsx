"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <div className="glass p-10">
        <h1 className="text-2xl font-bold grad-text">Lost in space</h1>
        <p className="text-muted mt-3 text-sm leading-relaxed">
          Something went wrong on our side — usually a momentary hiccup while the database
          warms up. One retry almost always fixes it.
        </p>
        <button onClick={reset} className="glow-btn pressable mt-6 rounded-full px-8 py-2.5 font-semibold text-white">
          Retry
        </button>
      </div>
    </div>
  );
}
