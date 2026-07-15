"use client";

import { useFormStatus } from "react-dom";

// A submit button that shows a spinner + pending label while its form's server
// action runs — so saves never look stale. Drop-in replacement for a plain
// <button> inside any <form action={serverAction}>.
export default function SubmitButton({
  children, className = "", pendingText = "Saving…", formAction,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  formAction?: (formData: FormData) => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} formAction={formAction} className={`${className} ${pending ? "opacity-80 cursor-wait" : ""} inline-flex items-center justify-center gap-2`}>
      {pending && <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
      {pending ? pendingText : children}
    </button>
  );
}
