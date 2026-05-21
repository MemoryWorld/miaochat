"use client";

type PinMessageActionProps = {
  disabled?: boolean;
  isPending?: boolean;
  isPinned: boolean;
  onPin?: () => void;
  tone?: "dark" | "light";
};

export function PinMessageAction({
  disabled = false,
  isPending = false,
  isPinned,
  onPin,
  tone = "light"
}: PinMessageActionProps) {
  if (isPinned) {
    return (
      <span
        style={{
          ...baseChipStyle,
          background: tone === "dark" ? "rgba(255, 255, 255, 0.16)" : "rgba(16, 24, 40, 0.08)",
          color: tone === "dark" ? "#fff" : "#101828"
        }}
      >
        Pinned
      </span>
    );
  }

  return (
    <button
      disabled={disabled || isPending}
      onClick={() => {
        onPin?.();
      }}
      style={{
        ...baseChipStyle,
        background: tone === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(11, 110, 255, 0.08)",
        color: tone === "dark" ? "#fff" : "#175cd3",
        cursor: disabled || isPending ? "default" : "pointer"
      }}
      type="button"
    >
      {isPending ? "Pinning..." : "Pin message"}
    </button>
  );
}

const baseChipStyle = {
  border: 0,
  borderRadius: "999px",
  display: "inline-flex",
  font: "inherit",
  fontSize: "0.78rem",
  fontWeight: 600,
  marginTop: "0.75rem",
  padding: "0.4rem 0.7rem"
} as const;
