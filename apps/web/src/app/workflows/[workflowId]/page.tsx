import { WorkflowDetailPageClient } from "../../../features/workflows/workflow-pages";

type WorkflowDetailPageProps = {
  params: Promise<{
    workflowId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkflowDetailPage({
  params,
  searchParams
}: WorkflowDetailPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const workspaceId = Array.isArray(resolvedSearchParams.workspaceId)
    ? resolvedSearchParams.workspaceId[0]
    : resolvedSearchParams.workspaceId;

  return (
    <WorkflowDetailPageClient
      initialWorkspaceId={workspaceId ?? ""}
      workflowId={resolvedParams.workflowId}
    />
  );
}
