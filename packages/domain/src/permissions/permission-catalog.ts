/**
 * Permission catalog for workspace-scoped resources.
 *
 * The matrix is intentionally code-driven so that updates ship as deploys and
 * stay in sync with the controllers that enforce them. The database persists
 * which `WorkspaceRole` is assigned to each member, and this file is the
 * single source of truth for translating that role into capabilities.
 */

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspacePermission =
  | "workspace.audit.read"
  | "workspace.invitations.manage"
  | "workspace.members.manage"
  | "workspace.role.manage"
  | "workspace.update"
  | "conversation.create"
  | "conversation.read"
  | "conversation.share"
  | "conversation.update"
  | "message.read"
  | "message.send"
  | "credential.manage"
  | "credential.read"
  | "custom_agent.manage"
  | "custom_agent.read"
  | "artifact.create"
  | "artifact.read";

const memberPermissions: ReadonlySet<WorkspacePermission> = new Set([
  "conversation.create",
  "conversation.read",
  "conversation.update",
  "message.read",
  "message.send",
  "credential.read",
  "custom_agent.read",
  "artifact.create",
  "artifact.read"
]);

const adminPermissions: ReadonlySet<WorkspacePermission> = new Set([
  ...memberPermissions,
  "workspace.audit.read",
  "workspace.invitations.manage",
  "workspace.members.manage",
  "workspace.update",
  "conversation.share",
  "credential.manage",
  "custom_agent.manage"
]);

const ownerPermissions: ReadonlySet<WorkspacePermission> = new Set([
  ...adminPermissions,
  "workspace.role.manage"
]);

const ROLE_PERMISSIONS: Readonly<
  Record<WorkspaceRole, ReadonlySet<WorkspacePermission>>
> = {
  admin: adminPermissions,
  member: memberPermissions,
  owner: ownerPermissions
};

export function permissionsForRole(role: WorkspaceRole): readonly WorkspacePermission[] {
  return Array.from(ROLE_PERMISSIONS[role]);
}

export function roleHasPermission(
  role: WorkspaceRole,
  permission: WorkspacePermission
): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

/**
 * Returns the highest-privilege role that includes the given permission. The
 * iteration order is deterministic — `owner` first, then `admin`, then
 * `member` — so callers receive the most permissive label.
 */
export function minimumRoleFor(
  permission: WorkspacePermission
): WorkspaceRole | null {
  const orderedRoles: readonly WorkspaceRole[] = ["member", "admin", "owner"];
  for (const role of orderedRoles) {
    if (roleHasPermission(role, permission)) {
      return role;
    }
  }
  return null;
}

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member"];
