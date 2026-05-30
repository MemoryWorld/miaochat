import { Suspense } from "react";

import { TeammateCreateWizard } from "../../../features/teammates/teammate-create-wizard";

export default function NewTeammatePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">正在加载新建同事...</div>}>
      <TeammateCreateWizard />
    </Suspense>
  );
}
