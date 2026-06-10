"use client";

import { cn } from "../../lib/cn";

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
  const isDisabled = disabled || isPending;

  return (
    <button
      className={cn(
        "rounded-full px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default disabled:opacity-50",
        tone === "dark"
          ? "text-white/80 hover:bg-white/15 hover:text-white"
          : isPinned
            ? "text-foreground hover:bg-black/[0.06]"
            : "text-[#007aff] hover:bg-[#007aff]/10"
      )}
      disabled={isDisabled}
      onClick={() => {
        onPin?.();
      }}
      type="button"
    >
      {isPinned
        ? isPending
          ? "取消中..."
          : "取消置顶"
        : isPending
          ? "Pinning..."
          : "Pin message"}
    </button>
  );
}
