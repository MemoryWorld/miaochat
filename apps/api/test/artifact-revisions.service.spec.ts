import { describe, expect, it, vi } from "vitest";

import { ArtifactRevisionsService } from "../src/modules/artifacts/revisions.service.js";

const createdAt = new Date("2026-06-10T00:00:00.000Z");

function buildRevisionRow(overrides: Record<string, unknown> = {}) {
  return {
    artifact_id: "artifact_1",
    author_user_id: "user_1",
    content_digest: "a".repeat(64),
    created_at: createdAt,
    id: "revision_0",
    parent_revision_id: null,
    preview_url: null,
    revision_index: 0,
    storage_key: "artifacts/default-workspace/msg/page-v1.html",
    summary: "Initial webpage artifact.",
    workspace_id: "default-workspace",
    ...overrides
  };
}

function createService(input?: {
  database?: {
    execute: ReturnType<typeof vi.fn>;
    transaction?: ReturnType<typeof vi.fn>;
  };
  storage?: {
    readTextObject: ReturnType<typeof vi.fn>;
  };
}) {
  const database = input?.database ?? {
    execute: vi.fn()
  };
  const storage = input?.storage ?? {
    readTextObject: vi.fn()
  };

  return {
    database,
    service: new ArtifactRevisionsService(database as never, storage as never),
    storage
  };
}

describe("ArtifactRevisionsService", () => {
  it("returns a unified diff built from stored revision content", async () => {
    const database = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "artifact_1" }] })
        .mockResolvedValueOnce({
          rows: [
            buildRevisionRow(),
            buildRevisionRow({
              content_digest: "b".repeat(64),
              id: "revision_1",
              parent_revision_id: "revision_0",
              revision_index: 1,
              storage_key: "artifacts/default-workspace/msg/page-v2.html",
              summary: "Edited through chat."
            })
          ]
        })
    };
    const storage = {
      readTextObject: vi.fn()
        .mockResolvedValueOnce({ content: "<h1>old</h1>", truncated: false })
        .mockResolvedValueOnce({ content: "<h1>new</h1>", truncated: false })
    };
    const { service } = createService({ database, storage });

    const diff = await service.describeDiff({
      artifactId: "artifact_1",
      ownerUserId: "user_1",
      revisionIndex: 1,
      workspaceId: "default-workspace"
    });

    expect(diff.before?.revisionIndex).toBe(0);
    expect(diff.after.revisionIndex).toBe(1);
    expect(diff.patch).toContain("-<h1>old</h1>");
    expect(diff.patch).toContain("+<h1>new</h1>");
    expect(diff.truncated).toBe(false);
  });

  it("restores a revision by appending a new revision and repointing the artifact", async () => {
    const tx = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [buildRevisionRow()] })
        .mockResolvedValueOnce({ rows: [{ id: "revision_1", revision_index: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            buildRevisionRow({
              id: "revision_2",
              parent_revision_id: "revision_1",
              revision_index: 2,
              summary: "Restore revision 0."
            })
          ]
        })
        .mockResolvedValueOnce({ rows: [] })
    };
    const database = {
      execute: vi.fn().mockResolvedValueOnce({ rows: [{ id: "artifact_1" }] }),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx))
    };
    const storage = {
      readTextObject: vi.fn()
    };
    const { service } = createService({ database, storage });

    const restored = await service.restore({
      artifactId: "artifact_1",
      ownerUserId: "user_1",
      payload: { summary: "Restore revision 0." },
      revisionIndex: 0,
      workspaceId: "default-workspace"
    });

    expect(restored.revisionIndex).toBe(2);
    expect(restored.parentRevisionId).toBe("revision_1");
    expect(restored.summary).toBe("Restore revision 0.");
    expect(tx.execute).toHaveBeenCalledTimes(4);
  });
});
