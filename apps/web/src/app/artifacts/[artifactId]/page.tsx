import { ArtifactViewerPageClient } from "../../../features/artifacts/artifact-viewer-page";

type ArtifactViewerPageProps = {
  params: Promise<{
    artifactId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ArtifactViewerPage({
  params,
  searchParams
}: ArtifactViewerPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const workspaceId = Array.isArray(resolvedSearchParams.workspaceId)
    ? resolvedSearchParams.workspaceId[0]
    : resolvedSearchParams.workspaceId;

  return (
    <ArtifactViewerPageClient
      artifactId={resolvedParams.artifactId}
      workspaceId={workspaceId ?? "default-workspace"}
    />
  );
}
