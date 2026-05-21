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
      style={{
        background: "#f8fafc",
        border: `1px solid ${state.accent}`,
        borderRadius: "18px",
        minHeight: "116px",
        padding: "1rem"
      }}
    >
      <div
        style={{
          color: state.tone,
          fontSize: "0.85rem",
          fontWeight: 700,
          letterSpacing: "0.02em",
          marginBottom: "0.65rem",
          textTransform: "uppercase"
        }}
      >
        {state.label}
      </div>
      <p style={{ color: "#344054", lineHeight: 1.6, margin: 0 }}>
        {message ?? "Select a provider, validate the secret, then bind it for future sessions."}
      </p>
      {providerAccountId ? (
        <div
          style={{
            color: "#475467",
            fontSize: "0.9rem",
            marginTop: "0.75rem"
          }}
        >
          Provider account: <strong>{providerAccountId}</strong>
        </div>
      ) : null}
    </section>
  );
}
