import { AppShell } from "../../components/app-shell";
import { SetupFlow } from "../../features/setup/setup-flow";

export default function SetupPage() {
  return (
    <AppShell
      sidebar={
        <>
          <h1 style={{ marginTop: 0 }}>BYOK Setup</h1>
          <p style={{ color: "#475467", lineHeight: 1.6 }}>
            Release 1 stays BYOK-only. This flow validates a real provider key, binds it
            to the active workspace, and keeps the platform ready for later
            `platform_managed` expansion.
          </p>
          <hr style={{ border: 0, borderTop: "1px solid rgba(15, 23, 42, 0.08)" }} />
          <div style={{ color: "#475467", lineHeight: 1.7 }}>
            <strong style={{ color: "#101828" }}>Flow contract</strong>
            <p style={{ marginBottom: 0 }}>
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
