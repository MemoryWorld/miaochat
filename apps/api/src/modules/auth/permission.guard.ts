/**
 * Permission guard surface used by every workspace-scoped controller. The
 * implementation lives next to the role/membership services in the workspaces
 * module so the guard owns its dependency wiring; this module-level
 * re-export keeps the path predictable from the auth side of the import
 * graph.
 */
export { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
