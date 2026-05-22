import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query
} from "@nestjs/common";

import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { WorkspaceAuditService } from "./audit.service.js";
import { WorkspaceInvitationsService } from "./invitations.service.js";
import { WorkspaceMembershipsService } from "./memberships.service.js";
import { WorkspacePermissionGuard } from "./permission.guard.js";
import { WorkspaceRoleService } from "./role.service.js";
import { WorkspacesService } from "./workspaces.service.js";

const updateRoleInputSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  role: z.enum(["owner", "admin", "member"])
});

@Controller("workspaces")
export class WorkspacesController {
  constructor(
    @Inject(WorkspaceAuditService)
    private readonly auditService: WorkspaceAuditService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspaceInvitationsService)
    private readonly invitationsService: WorkspaceInvitationsService,
    @Inject(WorkspaceMembershipsService)
    private readonly membershipsService: WorkspaceMembershipsService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard,
    @Inject(WorkspaceRoleService)
    private readonly roleService: WorkspaceRoleService,
    @Inject(WorkspacesService)
    private readonly workspacesService: WorkspacesService
  ) {}

  @Post()
  async create(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.workspacesService.create(input, user.id);
  }

  @Get()
  async list(@Headers("cookie") cookieHeader: string | undefined) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.workspacesService.list(user.id);
  }

  @Post(":workspaceId/invitations")
  async invite(
    @Param("workspaceId") workspaceId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const issued = await this.invitationsService.invite(user.id, workspaceId, input);

    return {
      invitation: issued.invitation,
      // The token is returned exactly once at issuance so the owner can hand
      // off the acceptance link. The DB only stores a SHA-256 hash.
      token: issued.token
    };
  }

  @Get(":workspaceId/invitations")
  async listInvitations(
    @Param("workspaceId") workspaceId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.invitationsService.listForWorkspace(user.id, workspaceId);
  }

  @Delete(":workspaceId/invitations/:invitationId")
  @HttpCode(200)
  async revokeInvitation(
    @Param("workspaceId") workspaceId: string,
    @Param("invitationId") invitationId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.invitationsService.revoke(user.id, workspaceId, invitationId);
  }

  @Get(":workspaceId/members")
  async listMembers(
    @Param("workspaceId") workspaceId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.membershipsService.list(user.id, workspaceId);
  }

  @Post(":workspaceId/members/:userId/role")
  @HttpCode(200)
  async updateMemberRole(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") targetUserId: string,
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const parsed = updateRoleInputSchema.parse(input);

    return this.roleService.updateMemberRole({
      actorUserId: user.id,
      nextRole: parsed.role,
      reason: parsed.reason ?? null,
      targetUserId,
      workspaceId,
      workspaceOwnerUserId: user.id
    });
  }

  @Get(":workspaceId/role-audit")
  async listRoleAudit(
    @Param("workspaceId") workspaceId: string,
    @Query("limit") limit: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    await this.permissionGuard.assert(user.id, workspaceId, "workspace.audit.read");
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.roleService.listAuditEvents(
      user.id,
      workspaceId,
      Number.isFinite(parsedLimit) ? (parsedLimit as number) : undefined
    );
  }

  @Get(":workspaceId/me")
  async describeSelf(
    @Param("workspaceId") workspaceId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const summary = await this.roleService.describe(user.id, workspaceId, user.id);
    return summary ?? { permissions: [], role: null };
  }

  @Get(":workspaceId/audit")
  async listAudit(
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    await this.permissionGuard.assert(user.id, workspaceId, "workspace.audit.read");
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.auditService.list({
      cursor: cursor ?? null,
      limit: Number.isFinite(parsedLimit) ? (parsedLimit as number) : undefined,
      workspaceId,
      workspaceOwnerUserId: user.id
    });
  }
}
