"use client";

import { Button } from "../../components/ui/button";

export type CredentialMode = "platform_managed" | "user_provided";

type CredentialModeToggleProps = {
  mode: CredentialMode;
  onChange: (mode: CredentialMode) => void;
};

export function CredentialModeToggle({
  mode,
  onChange
}: CredentialModeToggleProps) {
  return (
    <section className="rounded-[28px] border border-white/70 bg-slate-50/80 p-5 shadow-sm">
      <div>
        <h3 className="m-0 text-xl font-semibold text-slate-950">Credential mode</h3>
        <p className="mb-0 mt-2 text-sm leading-7 text-slate-600">
          BYOK stays the default. Platform-managed mode is available only when the
          provider is backed by the current workspace policy.
        </p>
      </div>
      <div className="mt-4 inline-flex flex-wrap gap-2">
        <Button
          aria-pressed={mode === "user_provided"}
          onClick={() => onChange("user_provided")}
          type="button"
          variant={mode === "user_provided" ? "default" : "outline"}
        >
          Bring your own key
        </Button>
        <Button
          aria-pressed={mode === "platform_managed"}
          onClick={() => onChange("platform_managed")}
          type="button"
          variant={mode === "platform_managed" ? "default" : "outline"}
        >
          Platform-managed
        </Button>
      </div>
    </section>
  );
}
