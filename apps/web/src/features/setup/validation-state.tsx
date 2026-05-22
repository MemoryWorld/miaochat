type ValidationStatus = "idle" | "invalid" | "saved" | "saving" | "valid" | "validating";

type ValidationStateProps = {
  message?: string;
  providerAccountId?: string;
  status: ValidationStatus;
};

const statusCopy: Record<
  ValidationStatus,
  { accent: string; label: string; tone: string }
> = {
  idle: {
    accent: "rgba(15, 23, 42, 0.08)",
    label: "Awaiting validation",
    tone: "#667085"
  },
  invalid: {
    accent: "rgba(220, 38, 38, 0.16)",
    label: "Validation failed",
    tone: "#b42318"
  },
  saved: {
    accent: "rgba(34, 197, 94, 0.18)",
    label: "Credential saved",
    tone: "#027a48"
  },
  saving: {
    accent: "rgba(37, 99, 235, 0.16)",
    label: "Saving credential",
    tone: "#175cd3"
  },
  valid: {
    accent: "rgba(34, 197, 94, 0.18)",
    label: "Validation passed",
    tone: "#027a48"
  },
  validating: {
    accent: "rgba(37, 99, 235, 0.16)",
    label: "Checking credential",
    tone: "#175cd3"
  }
};

export function ValidationState({
  message,
  providerAccountId,
  status
}: ValidationStateProps) {
  const state = statusCopy[status];

  return (
    <section
      aria-live="polite"
      className="min-h-[116px] rounded-3xl bg-slate-50 p-4"
      style={{ border: `1px solid ${state.accent}` }}
    >
      <div
        className="mb-3 text-xs font-bold uppercase tracking-[0.12em]"
        style={{ color: state.tone }}
      >
        {state.label}
      </div>
      <p className="m-0 text-sm leading-7 text-slate-700">
        {message ?? "Select a provider, validate the secret, then bind it for future sessions."}
      </p>
      {providerAccountId ? (
        <div className="mt-3 text-sm text-slate-600">
          Provider account: <strong>{providerAccountId}</strong>
        </div>
      ) : null}
    </section>
  );
}
