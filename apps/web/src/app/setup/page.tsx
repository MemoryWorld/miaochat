import { AppShell } from "../../components/app-shell";
import { Badge } from "../../components/ui/badge";
import { SetupFlow } from "../../features/setup/setup-flow";

export default function SetupPage() {
  return (
    <AppShell
      sidebar={
        <>
          <Badge className="mb-3" tone="primary">
            Release 1
          </Badge>
          <h1 className="mt-0 text-3xl font-semibold tracking-tight text-slate-950">
            BYOK Setup
          </h1>
          <p className="text-sm leading-7 text-slate-600">
            Release 1 stays BYOK-only. This flow validates a real provider key, binds it
            to the active workspace, and keeps the platform ready for later
            `platform_managed` expansion.
          </p>
          <div className="my-5 h-px bg-slate-200" />
          <div className="grid gap-2 text-sm leading-7 text-slate-600">
            <strong className="text-slate-950">Flow contract</strong>
            <p className="mb-0">
              1. Choose provider
              <br />
              2. Validate credential
              <br />
              3. Save and reuse in chat
            </p>
          </div>
        </>
      }
    >
      <SetupFlow />
    </AppShell>
  );
}
