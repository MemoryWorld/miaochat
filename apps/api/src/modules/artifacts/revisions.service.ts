import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";

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
    ownerUserId: string;
    workspaceId: string;
    payload: unknown;
  }): Promise<ArtifactRevision> {
    const parsed = createArtifactRevisionInputSchema.parse(input.payload);
    await this.assertArtifactOwnedBy(input.artifactId, input.workspaceId, input.ownerUserId);

    return this.database.transaction(async (tx) => {
      const previous = await tx.execute<{
        id: string;
        revision_index: number;
      }>(sql`
        SELECT id, revision_index
        FROM artifact_revisions
        WHERE artifact_id = ${input.artifactId}
        ORDER BY revision_index DESC
        LIMIT 1
        FOR UPDATE
      `);

      const previousRow = previous.rows[0] ?? null;
      const revisionIndex = (previousRow?.revision_index ?? -1) + 1;

      const inserted = await tx.execute<RevisionRow>(sql`
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
        VALUES (
          ${randomUUID()},
          ${input.artifactId},
          ${input.workspaceId},
          ${revisionIndex},
          ${previousRow?.id ?? null},
          ${parsed.authorUserId ?? null},
          ${parsed.contentDigest},
          ${parsed.previewUrl ?? null},
          ${parsed.storageKey ?? null},
          ${parsed.summary ?? null}
        )
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
      `);

      return mapRow(inserted.rows[0]);
    });
  }

  async listForArtifact(input: {
    artifactId: string;
    ownerUserId: string;
    workspaceId: string;
  }): Promise<ArtifactRevision[]> {
    await this.assertArtifactOwnedBy(input.artifactId, input.workspaceId, input.ownerUserId);
    const result = await this.database.execute<RevisionRow>(sql`
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
      WHERE artifact_id = ${input.artifactId}
        AND workspace_id = ${input.workspaceId}
      ORDER BY revision_index ASC
    `);

    return result.rows.map(mapRow);
  }

  /**
   * Returns a metadata-only diff between two consecutive revisions. The
   * actual byte-for-byte diff comes from the storage layer; this helper
   * exposes the digests + metadata changes so callers can decide whether
   * fetching both blobs is necessary.
   */
  async describeDiff(
    input: {
      artifactId: string;
      ownerUserId: string;
      revisionIndex: number;
      workspaceId: string;
    }
  ): Promise<{
    after: ArtifactRevision;
    before: ArtifactRevision | null;
  }> {
    if (input.revisionIndex < 0) {
      throw new NotFoundException(`Negative revision index ${input.revisionIndex}.`);
    }
    await this.assertArtifactOwnedBy(input.artifactId, input.workspaceId, input.ownerUserId);

    const result = await this.database.execute<RevisionRow>(sql`
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
      WHERE artifact_id = ${input.artifactId}
        AND workspace_id = ${input.workspaceId}
        AND revision_index IN (${Math.max(0, input.revisionIndex - 1)}, ${input.revisionIndex})
      ORDER BY revision_index ASC
    `);

    if (!result.rows.find((row) => row.revision_index === input.revisionIndex)) {
      throw new NotFoundException(
        `Artifact revision ${input.revisionIndex} was not found for artifact ${input.artifactId}.`
      );
    }

    const after = mapRow(
      result.rows.find((row) => row.revision_index === input.revisionIndex)
    );
    const beforeRow = result.rows.find(
      (row) => row.revision_index === input.revisionIndex - 1
    );

    return {
      after,
      before: beforeRow ? mapRow(beforeRow) : null
    };
  }

  private async assertArtifactOwnedBy(
    artifactId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<void> {
    const result = await this.database.execute<{ id: string }>(sql`
      SELECT artifacts.id
      FROM artifacts
      INNER JOIN messages
        ON messages.id = artifacts.message_id
        AND messages.workspace_id = artifacts.workspace_id
      WHERE artifacts.id = ${artifactId}
        AND artifacts.workspace_id = ${workspaceId}
        AND messages.owner_user_id = ${ownerUserId}
    `);

    if (!result.rows[0]) {
      throw new NotFoundException(
        `Artifact ${artifactId} was not found in workspace ${workspaceId}.`
      );
    }
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
