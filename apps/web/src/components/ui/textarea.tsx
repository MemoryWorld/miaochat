import type { TextareaHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-primary/15",
        className
      )}
      {...props}
    />
  );
}
