import { buildApiUrl } from "../../lib/api-base-url";

export function buildArtifactViewerUrl(artifactId: string, workspaceId: string): string {
  return `/artifacts/${encodeURIComponent(artifactId)}?workspaceId=${encodeURIComponent(workspaceId)}`;
}

export function buildArtifactContentUrl(artifactId: string, workspaceId: string): string {
  return buildApiUrl(
    `/artifacts/${encodeURIComponent(artifactId)}/content?workspaceId=${encodeURIComponent(workspaceId)}`
  );
}

export function buildArtifactRevisionDiffUrl(
  artifactId: string,
  workspaceId: string,
  revisionIndex: number
): string {
  return buildApiUrl(
    `/artifacts/${encodeURIComponent(artifactId)}/revisions/${revisionIndex}/diff?workspaceId=${encodeURIComponent(workspaceId)}`
  );
}

export function buildArtifactRevisionRestoreUrl(
  artifactId: string,
  workspaceId: string,
  revisionIndex: number
): string {
  return buildApiUrl(
    `/artifacts/${encodeURIComponent(artifactId)}/revisions/${revisionIndex}/restore?workspaceId=${encodeURIComponent(workspaceId)}`
  );
}

export function buildArtifactRevisionsUrl(artifactId: string, workspaceId: string): string {
  return buildApiUrl(
    `/artifacts/${encodeURIComponent(artifactId)}/revisions?workspaceId=${encodeURIComponent(workspaceId)}`
  );
}

export function buildArtifactFileUrl(
  artifactId: string,
  workspaceId: string,
  disposition: "attachment" | "inline" = "attachment"
): string {
  return buildApiUrl(
    `/artifacts/${encodeURIComponent(artifactId)}/file?workspaceId=${encodeURIComponent(workspaceId)}&disposition=${disposition}`
  );
}
