import { forwardRef, Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { WorkspaceAuditService } from "./audit.service.js";
import { InvitationsController } from "./invitations.controller.js";
import { WorkspaceInvitationsService } from "./invitations.service.js";
import { WorkspaceMembershipsService } from "./memberships.service.js";
import { WorkspacePermissionGuard } from "./permission.guard.js";
import { WorkspaceRoleService } from "./role.service.js";
import { WorkspacesController } from "./workspaces.controller.js";
import { WorkspacesService } from "./workspaces.service.js";

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [InvitationsController, WorkspacesController],
  exports: [
    WorkspaceAuditService,
    WorkspaceInvitationsService,
    WorkspaceMembershipsService,
    WorkspacePermissionGuard,
    WorkspaceRoleService,
    WorkspacesService
  ],
  providers: [
    WorkspaceAuditService,
    WorkspaceInvitationsService,
    WorkspaceMembershipsService,
    WorkspacePermissionGuard,
    WorkspaceRoleService,
    WorkspacesService
  ]
})
export class WorkspacesModule {}
