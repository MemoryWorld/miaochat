import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="grid justify-items-center gap-3 text-center">
        <p className="m-0 text-5xl font-bold tracking-tight text-foreground">404</p>
        <p className="m-0 text-sm text-muted-foreground">页面不存在或已被移动。</p>
        <Link
          className="mt-2 rounded-full bg-[#007aff] px-4 py-2 text-sm font-semibold text-white no-underline transition hover:bg-[#0070eb]"
          href="/"
        >
          回到会话
        </Link>
      </div>
    </main>
  );
}
