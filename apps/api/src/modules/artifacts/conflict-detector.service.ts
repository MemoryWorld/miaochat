import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service.js";

export type ArtifactConflict = {
  artifactId: string;
  branches: Array<{
    authorUserId: string | null;
    contentDigest: string;
    revisionId: string;
    revisionIndex: number;
  }>;
  hasConflict: boolean;
};

/**
 * Detects concurrent edits on the same artifact by inspecting the recent
 * revision chain. A conflict is declared when two distinct authors append
 * revisions whose `parent_revision_id` points at the same ancestor — the
 * classic "lost update" pattern.
 */
@Injectable()
export class ArtifactConflictDetectorService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async detect(artifactId: string): Promise<ArtifactConflict> {
    const result = await this.database.query<{
      author_user_id: string | null;
      content_digest: string;
      id: string;
      parent_revision_id: string | null;
      revision_index: number;
    }>(
      `
        SELECT author_user_id, content_digest, id, parent_revision_id, revision_index
        FROM artifact_revisions
        WHERE artifact_id = $1
        ORDER BY revision_index DESC
        LIMIT 50
      `,
      [artifactId]
    );

    const groups = new Map<
      string,
      Array<{
        authorUserId: string | null;
        contentDigest: string;
        revisionId: string;
        revisionIndex: number;
      }>
    >();

    for (const row of result.rows) {
      const key = row.parent_revision_id ?? "__root__";
      const list = groups.get(key) ?? [];
      list.push({
        authorUserId: row.author_user_id,
        contentDigest: row.content_digest,
        revisionId: row.id,
        revisionIndex: row.revision_index
      });
      groups.set(key, list);
    }

    let conflicting: ArtifactConflict["branches"] = [];
    for (const branches of groups.values()) {
      const distinctAuthors = new Set(branches.map((entry) => entry.authorUserId));
      const distinctDigests = new Set(branches.map((entry) => entry.contentDigest));
      if (
        branches.length > 1 &&
        distinctAuthors.size > 1 &&
        distinctDigests.size > 1
      ) {
        conflicting = branches;
        break;
      }
    }

    return {
      artifactId,
      branches: conflicting,
      hasConflict: conflicting.length > 0
    };
  }
}
