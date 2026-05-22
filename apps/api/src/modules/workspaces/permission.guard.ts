import { ForbiddenException, Inject, Injectable } from "@nestjs/common";

import { roleHasPermission, type WorkspacePermission } from "@agenthub/domain";

import { WorkspaceMembershipsService } from "./memberships.service.js";
import { WorkspaceRoleService } from "./role.service.js";
import { WorkspacesService } from "./workspaces.service.js";

/**
 * Centralizes the per-request permission check for workspace-scoped resources.
 *
 * In the current single-tenant-per-user data model, the workspace owner is
 * always the calling user. The first time a caller references a workspace ID
 * within their own namespace we auto-provision the workspace + owner-member
 * row so that downstream queries scoped by `(workspace_owner_user_id, id)`
 * have a concrete record to anchor against. Once shared workspaces (Task 46)
 * introduce a path for non-owner members to access someone else's workspace,
 * this guard is the single hook that needs to translate from `workspaceId`
 * to the actual `workspaceOwnerUserId`.
 */
@Injectable()
export class WorkspacePermissionGuard {
  constructor(
    @Inject(WorkspaceMembershipsService)
    private readonly memberships: WorkspaceMembershipsService,
    @Inject(WorkspaceRoleService)
    private readonly roleService: WorkspaceRoleService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService
  ) {}

  async assert(
    userId: string,
    workspaceId: string,
    permission: WorkspacePermission
  ): Promise<void> {
    let role = await this.roleService.getRole(userId, workspaceId, userId);

    if (!role) {
      // Auto-provision the caller's own workspace + owner-member row so that
      // first-touch operations succeed without an explicit POST /workspaces.
      // This preserves the Release-1 ergonomics where any workspace ID the
      // caller chooses is treated as living in their own namespace.
      await this.workspacesService.ensureWorkspace(workspaceId, userId);
      await this.memberships.upsertOwner(userId, workspaceId);
      role = "owner";
    }

    if (!roleHasPermission(role, permission)) {
      throw new ForbiddenException(
        `Role ${role} does not have permission ${permission}.`
      );
    }
  }
}
