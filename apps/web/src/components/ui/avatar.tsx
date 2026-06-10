import { cn } from "../../lib/cn";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg"
};

const gradientPalette = [
  "from-sky-400 to-blue-600",
  "from-violet-400 to-purple-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-indigo-400 to-blue-700",
  "from-cyan-400 to-sky-600",
  "from-fuchsia-400 to-purple-700"
] as const;

function gradientForName(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return gradientPalette[Math.abs(hash) % gradientPalette.length]!;
}

export function Avatar({
  className,
  imageUrl,
  name,
  size = "md"
}: {
  className?: string;
  imageUrl?: string | null;
  name: string;
  size?: AvatarSize;
}) {
  if (imageUrl) {
    return (
      <img
        alt={name}
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]",
          sizeClasses[size],
          className
        )}
        src={imageUrl}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-black/[0.06]",
        gradientForName(name),
        sizeClasses[size],
        className
      )}
    >
      {initialOf(name)}
    </span>
  );
}

/** 群聊组合头像：两个成员斜向堆叠，多于两个时显示 +N。 */
export function AvatarGroup({
  className,
  names,
  size = "md"
}: {
  className?: string;
  names: string[];
  size?: AvatarSize;
}) {
  if (names.length === 0) {
    return <Avatar className={className} name="?" size={size} />;
  }

  if (names.length === 1) {
    return <Avatar className={className} name={names[0]!} size={size} />;
  }

  const overflow = names.length - 2;
  const stackedSize: AvatarSize = size === "lg" ? "sm" : "xs";
  const boxClass = sizeClasses[size].split(" ").slice(0, 2).join(" ");

  return (
    <span className={cn("relative inline-block shrink-0", boxClass, className)}>
      <Avatar className="absolute left-0 top-0" name={names[0]!} size={stackedSize} />
      <Avatar
        className="absolute bottom-0 right-0 ring-2 ring-white"
        name={names[1]!}
        size={stackedSize}
      />
      {overflow > 0 ? (
        <span className="absolute -right-1 -top-1 rounded-full bg-muted px-1 text-[9px] font-semibold leading-4 text-muted-foreground ring-1 ring-white">
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "?";
  }
  // 中文取首字，拉丁取首字母大写
  const first = [...trimmed][0]!;
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}
