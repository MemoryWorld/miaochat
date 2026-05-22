import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "default" | "sm" | "lg";
  variant?: "default" | "ghost" | "outline" | "secondary";
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-11 px-4 py-2 text-sm",
  lg: "h-12 px-5 py-3 text-sm",
  sm: "h-9 px-3 py-2 text-sm"
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-slate-950 text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-400 disabled:text-white",
  ghost:
    "bg-transparent text-slate-700 hover:bg-white/70 disabled:text-slate-400",
  outline:
    "border border-slate-200 bg-white/80 text-slate-900 hover:bg-white disabled:text-slate-400",
  secondary:
    "border border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100 disabled:text-slate-400"
};

export function Button({
  className,
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      type={type}
      {...props}
    />
  );
}
