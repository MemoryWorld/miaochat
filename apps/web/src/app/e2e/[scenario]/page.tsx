import { notFound } from "next/navigation";

import { E2eScenarioRenderer } from "./scenario-renderer";

const scenarios = new Set([
  "artifact-edit",
  "conversation-list",
  "diff-cards",
  "heavy-agent",
  "inline-attachments",
  "message-actions",
  "share-conversation",
  "shared-audit",
  "workspace-audit",
  "workspace-membership"
]);

export default async function E2eScenarioPage({
  params
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario } = await params;

  if (!scenarios.has(scenario)) {
    notFound();
  }

  return <E2eScenarioRenderer scenario={scenario} />;
}
