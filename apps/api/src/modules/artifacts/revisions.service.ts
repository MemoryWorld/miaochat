import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import {
  artifactRevisionSchema,
  createArtifactRevisionInputSchema,
  type ArtifactRevision
} from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";

type RevisionRow = {
  artifact_id: string;
  author_user_id: string | null;
  content_digest: string;
  created_at: Date;
  id: string;
  parent_revision_id: string | null;
  preview_url: string | null;
  revision_index: number;
  storage_key: string | null;
  summary: string | null;
  workspace_id: string;
};

@Injectable()
export class ArtifactRevisionsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async append(input: {
    artifactId: string;
    workspaceId: string;
    payload: unknown;
  }): Promise<ArtifactRevision> {
    const parsed = createArtifactRevisionInputSchema.parse(input.payload);

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const previous = await client.query<{
          id: string;
          revision_index: number;
        }>(
          `
            SELECT id, revision_index
            FROM artifact_revisions
            WHERE artifact_id = $1
            ORDER BY revision_index DESC
            LIMIT 1
            FOR UPDATE
          `,
          [input.artifactId]
        );

        const previousRow = previous.rows[0] ?? null;
        const revisionIndex = (previousRow?.revision_index ?? -1) + 1;

        const inserted = await client.query<RevisionRow>(
          `
            INSERT INTO artifact_revisions (
              id,
              artifact_id,
              workspace_id,
              revision_index,
              parent_revision_id,
              author_user_id,
              content_digest,
              preview_url,
              storage_key,
              summary
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING
              artifact_id,
              author_user_id,
              content_digest,
              created_at,
              id,
              parent_revision_id,
              preview_url,
              revision_index,
              storage_key,
              summary,
              workspace_id
          `,
          [
            randomUUID(),
            input.artifactId,
            input.workspaceId,
            revisionIndex,
            previousRow?.id ?? null,
            parsed.authorUserId ?? null,
            parsed.contentDigest,
            parsed.previewUrl ?? null,
            parsed.storageKey ?? null,
            parsed.summary ?? null
          ]
        );

        await client.query("COMMIT");
        return mapRow(inserted.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async listForArtifact(artifactId: string): Promise<ArtifactRevision[]> {
    const result = await this.database.query<RevisionRow>(
      `
        SELECT
          artifact_id,
          author_user_id,
          content_digest,
          created_at,
          id,
          parent_revision_id,
          preview_url,
          revision_index,
          storage_key,
          summary,
          workspace_id
        FROM artifact_revisions
        WHERE artifact_id = $1
        ORDER BY revision_index ASC
      `,
      [artifactId]
    );

    return result.rows.map(mapRow);
  }

  /**
   * Returns a metadata-only diff between two consecutive revisions. The
   * actual byte-for-byte diff comes from the storage layer; this helper
   * exposes the digests + metadata changes so callers can decide whether
   * fetching both blobs is necessary.
   */
  async describeDiff(
    artifactId: string,
    revisionIndex: number
  ): Promise<{
    after: ArtifactRevision;
    before: ArtifactRevision | null;
  }> {
    if (revisionIndex < 0) {
      throw new NotFoundException(`Negative revision index ${revisionIndex}.`);
    }

    const result = await this.database.query<RevisionRow>(
      `
        SELECT
          artifact_id,
          author_user_id,
          content_digest,
          created_at,
          id,
          parent_revision_id,
          preview_url,
          revision_index,
          storage_key,
          summary,
          workspace_id
        FROM artifact_revisions
        WHERE artifact_id = $1
          AND revision_index IN ($2, $3)
        ORDER BY revision_index ASC
      `,
      [artifactId, Math.max(0, revisionIndex - 1), revisionIndex]
    );

    if (!result.rows.find((row) => row.revision_index === revisionIndex)) {
      throw new NotFoundException(
        `Artifact revision ${revisionIndex} was not found for artifact ${artifactId}.`
      );
    }

    const after = mapRow(
      result.rows.find((row) => row.revision_index === revisionIndex)
    );
    const beforeRow = result.rows.find(
      (row) => row.revision_index === revisionIndex - 1
    );

    return {
      after,
      before: beforeRow ? mapRow(beforeRow) : null
    };
  }
}

function mapRow(row: RevisionRow | undefined): ArtifactRevision {
  if (!row) {
    throw new Error("Artifact revision row not found.");
  }

  return artifactRevisionSchema.parse({
    artifactId: row.artifact_id,
    authorUserId: row.author_user_id,
    contentDigest: row.content_digest,
    createdAt: row.created_at,
    id: row.id,
    parentRevisionId: row.parent_revision_id,
    previewUrl: row.preview_url,
    revisionIndex: row.revision_index,
    storageKey: row.storage_key,
    summary: row.summary,
    workspaceId: row.workspace_id
  });
}
