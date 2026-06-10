import { randomUUID } from "node:crypto";

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";

import {
  artifactRevisionDiffSchema,
  artifactRevisionSchema,
  createArtifactRevisionInputSchema,
  restoreArtifactRevisionInputSchema,
  type ArtifactRevision,
  type ArtifactRevisionDiff
} from "@agenthub/contracts";

import { DatabaseService } from "../database/database.service.js";
import { StorageService } from "./storage.service.js";

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
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StorageService) private readonly storageService: StorageService
  ) {}

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

  async describeDiff(
    input: {
      artifactId: string;
      ownerUserId: string;
      revisionIndex: number;
      workspaceId: string;
    }
  ): Promise<ArtifactRevisionDiff> {
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
    const before = beforeRow ? mapRow(beforeRow) : null;
    const beforeContent = before
      ? await this.readRevisionText(before)
      : { content: "", truncated: false };
    const afterContent = await this.readRevisionText(after);

    return artifactRevisionDiffSchema.parse({
      after,
      before,
      patch: buildUnifiedDiff({
        afterContent,
        afterLabel: `revision-${after.revisionIndex}`,
        beforeContent,
        beforeLabel: before ? `revision-${before.revisionIndex}` : "empty"
      }),
      truncated: beforeContent.truncated || afterContent.truncated
    });
  }

  async restore(input: {
    artifactId: string;
    ownerUserId: string;
    payload: unknown;
    revisionIndex: number;
    workspaceId: string;
  }): Promise<ArtifactRevision> {
    if (input.revisionIndex < 0) {
      throw new NotFoundException(`Negative revision index ${input.revisionIndex}.`);
    }
    const parsed = restoreArtifactRevisionInputSchema.parse(input.payload ?? {});
    await this.assertArtifactOwnedBy(input.artifactId, input.workspaceId, input.ownerUserId);

    return this.database.transaction(async (tx) => {
      const targetResult = await tx.execute<RevisionRow>(sql`
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
          AND revision_index = ${input.revisionIndex}
        LIMIT 1
      `);
      const target = targetResult.rows[0];

      if (!target) {
        throw new NotFoundException(
          `Artifact revision ${input.revisionIndex} was not found for artifact ${input.artifactId}.`
        );
      }

      const previous = await tx.execute<{
        id: string;
        revision_index: number;
      }>(sql`
        SELECT id, revision_index
        FROM artifact_revisions
        WHERE artifact_id = ${input.artifactId}
          AND workspace_id = ${input.workspaceId}
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
          ${parsed.authorUserId ?? input.ownerUserId},
          ${target.content_digest},
          ${target.preview_url},
          ${target.storage_key},
          ${parsed.summary ?? `Restore revision ${input.revisionIndex}.`}
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

      await tx.execute(sql`
        UPDATE artifacts
        SET preview_url = ${target.preview_url},
            storage_key = ${target.storage_key}
        WHERE id = ${input.artifactId}
          AND workspace_id = ${input.workspaceId}
      `);

      return mapRow(inserted.rows[0]);
    });
  }

  private async readRevisionText(revision: ArtifactRevision): Promise<{
    content: string;
    truncated: boolean;
  }> {
    if (!revision.storageKey) {
      return {
        content: "",
        truncated: false
      };
    }

    return this.storageService.readTextObject({
      maxBytes: 512 * 1024,
      storageKey: revision.storageKey
    });
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

function buildUnifiedDiff(input: {
  afterContent: {
    content: string;
    truncated: boolean;
  };
  afterLabel: string;
  beforeContent: {
    content: string;
    truncated: boolean;
  };
  beforeLabel: string;
}): string {
  const beforeLines = splitDiffLines(input.beforeContent.content);
  const afterLines = splitDiffLines(input.afterContent.content);
  const maxComparableLines = 1600;

  if (beforeLines.length + afterLines.length > maxComparableLines) {
    return [
      `--- ${input.beforeLabel}`,
      `+++ ${input.afterLabel}`,
      "@@",
      ...beforeLines.slice(0, 400).map((line) => `-${line}`),
      ...afterLines.slice(0, 400).map((line) => `+${line}`),
      "# Diff truncated because the artifact is too large."
    ].join("\n");
  }

  const lcs = buildLcsMatrix(beforeLines, afterLines);
  const output = [
    `--- ${input.beforeLabel}`,
    `+++ ${input.afterLabel}`,
    "@@"
  ];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (beforeLines[beforeIndex] === afterLines[afterIndex]) {
      output.push(` ${beforeLines[beforeIndex]}`);
      beforeIndex += 1;
      afterIndex += 1;
    } else if (
      (lcs[beforeIndex + 1]?.[afterIndex] ?? 0) >=
      (lcs[beforeIndex]?.[afterIndex + 1] ?? 0)
    ) {
      output.push(`-${beforeLines[beforeIndex]}`);
      beforeIndex += 1;
    } else {
      output.push(`+${afterLines[afterIndex]}`);
      afterIndex += 1;
    }
  }

  while (beforeIndex < beforeLines.length) {
    output.push(`-${beforeLines[beforeIndex]}`);
    beforeIndex += 1;
  }

  while (afterIndex < afterLines.length) {
    output.push(`+${afterLines[afterIndex]}`);
    afterIndex += 1;
  }

  if (input.beforeContent.truncated || input.afterContent.truncated) {
    output.push("# Diff truncated because one revision preview was truncated.");
  }

  return output.join("\n");
}

function buildLcsMatrix(beforeLines: string[], afterLines: string[]): number[][] {
  const matrix = Array.from({ length: beforeLines.length + 1 }, () =>
    Array.from({ length: afterLines.length + 1 }, () => 0)
  );

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      const currentRow = matrix[beforeIndex]!;
      const nextRow = matrix[beforeIndex + 1]!;

      currentRow[afterIndex] =
        beforeLines[beforeIndex] === afterLines[afterIndex]
          ? (nextRow[afterIndex + 1] ?? 0) + 1
          : Math.max(nextRow[afterIndex] ?? 0, currentRow[afterIndex + 1] ?? 0);
    }
  }

  return matrix;
}

function splitDiffLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  return content.replace(/\r\n/g, "\n").split("\n");
}
