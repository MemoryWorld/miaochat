import { Suspense } from "react";

import { TeammateCreateWizard } from "../../features/teammates/teammate-create-wizard";

export default function AgentsPage() {
  return (
    <Suspense fallback={<AgentsPageFallback />}>
      <TeammateCreateWizard />
    </Suspense>
  );
}

function AgentsPageFallback() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-700">
      <p className="m-0 text-sm font-medium">正在加载 Agent 创建器...</p>
    </main>
  );
}
