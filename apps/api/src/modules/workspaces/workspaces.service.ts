import { randomUUID } from "node:crypto";

import { ConflictException, Inject, Injectable } from "@nestjs/common";

import type { PoolClient } from "pg";
import { z } from "zod";

import { DatabaseService } from "../database/database.service.js";

export const defaultWorkspaceId = "default-workspace";
export const defaultWorkspaceName = "Default Workspace";

const createWorkspaceInputSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(120)
});

const workspaceSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.string().min(1),
  name: z.string().min(1),
  ownerUserId: z.string().min(1),
  updatedAt: z.coerce.date()
});

export type Workspace = z.infer<typeof workspaceSchema>;

type WorkspaceRow = {
  created_at: Date;
  id: string;
  name: string;
  owner_user_id: string;
  updated_at: Date;
};

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(input: unknown, ownerUserId: string): Promise<Workspace> {
    const parsed = createWorkspaceInputSchema.parse(input);

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const result = await client.query<WorkspaceRow>(
          `
            INSERT INTO workspaces (
              id,
              owner_user_id,
              name
            )
            VALUES ($1, $2, $3)
            RETURNING
              created_at,
              id,
              name,
              owner_user_id,
              updated_at
          `,
          [parsed.id ?? randomUUID(), ownerUserId, parsed.name]
        );

        const workspace = mapWorkspaceRow(result.rows[0]);

        // Record the owner as an implicit member with the 'owner' role so the
        // membership table is the canonical source of truth for participation.
        await client.query(
          `
            INSERT INTO workspace_members (
              workspace_id,
              workspace_owner_user_id,
              user_id,
              role
            )
            VALUES ($1, $2, $2, 'owner')
            ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO NOTHING
          `,
          [workspace.id, ownerUserId]
        );

        await client.query("COMMIT");
        return workspace;
      } catch (error) {
        await client.query("ROLLBACK");

        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `Workspace ${parsed.id ?? parsed.name} already exists for this user.`
          );
        }

        throw error;
      }
    });
  }

  async list(ownerUserId: string): Promise<Workspace[]> {
    // Defensive guarantee: every authenticated user always has at least the
    // default workspace surfaced through the API. Signup also provisions this
    // row, but listing covers the case where data was created out-of-band.
    await this.ensureWorkspace(defaultWorkspaceId, ownerUserId, defaultWorkspaceName);

    const result = await this.database.query<WorkspaceRow>(
      `
        SELECT
          created_at,
          id,
          name,
          owner_user_id,
          updated_at
        FROM workspaces
        WHERE owner_user_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [ownerUserId]
    );

    return result.rows.map(mapWorkspaceRow);
  }

  async ensureWorkspace(
    workspaceId: string,
    ownerUserId: string,
    name = defaultWorkspaceName,
    client?: PoolClient
  ): Promise<void> {
    const query = client?.query.bind(client) ?? this.database.query.bind(this.database);

    await query(
      `
        INSERT INTO workspaces (
          id,
          owner_user_id,
          name
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (owner_user_id, id) DO NOTHING
      `,
      [workspaceId, ownerUserId, name]
    );
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function mapWorkspaceRow(row: WorkspaceRow | undefined): Workspace {
  if (!row) {
    throw new Error("Workspace row was not returned.");
  }

  return workspaceSchema.parse({
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    ownerUserId: row.owner_user_id,
    updatedAt: row.updated_at
  });
}
