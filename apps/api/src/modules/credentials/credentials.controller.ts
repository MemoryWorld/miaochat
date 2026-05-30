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

import type { CredentialCreateInput, CredentialModeInput } from "./dto.js";
import {
  parseCredentialIdParams,
  parseWorkspaceQuery
} from "./dto.js";
import { AuthService } from "../auth/auth.service.js";
import { WorkspacePermissionGuard } from "../workspaces/permission.guard.js";
import { CredentialsService } from "./credentials.service.js";

@Controller("credentials")
export class CredentialsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(CredentialsService)
    private readonly credentialsService: CredentialsService,
    @Inject(WorkspacePermissionGuard)
    private readonly permissionGuard: WorkspacePermissionGuard
  ) {}

  @Post()
  async create(
    @Body() input: CredentialCreateInput,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId =
      (input as { workspaceId?: string })?.workspaceId ?? "default-workspace";
    await this.permissionGuard.assert(user.id, workspaceId, "credential.manage");
    return this.credentialsService.create(input, user.id);
  }

  @Post("validate")
  @HttpCode(200)
  async validate(
    @Body() input: CredentialCreateInput,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    await this.authService.requireAuthenticatedUser(cookieHeader);
    return this.credentialsService.validate(input);
  }

  @Get("modes")
  async listModes(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = parseWorkspaceQuery(query);
    await this.permissionGuard.assert(user.id, workspaceId, "credential.read");
    return this.credentialsService.listModes(workspaceId, user.id);
  }

  @Post("modes")
  @HttpCode(200)
  async setMode(
    @Body() input: CredentialModeInput,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId =
      (input as { workspaceId?: string })?.workspaceId ?? "default-workspace";
    await this.permissionGuard.assert(user.id, workspaceId, "credential.manage");
    return this.credentialsService.setMode(input, user.id);
  }

  @Get()
  async list(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = parseWorkspaceQuery(query);
    await this.permissionGuard.assert(user.id, workspaceId, "credential.read");
    return this.credentialsService.list(workspaceId, user.id);
  }

  @Get("/model-connections")
  async listModelConnections(
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { workspaceId } = parseWorkspaceQuery(query);
    await this.permissionGuard.assert(user.id, workspaceId, "credential.read");
    return this.credentialsService.listModelConnections(workspaceId, user.id);
  }

  @Post("/model-connections/validate")
  @HttpCode(200)
  async validateModelConnection(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId =
      (input as { workspaceId?: string } | null)?.workspaceId ?? "default-workspace";
    await this.permissionGuard.assert(user.id, workspaceId, "credential.manage");
    return this.credentialsService.validateModelConnection(input);
  }

  @Post("/model-connections")
  async createModelConnection(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const workspaceId =
      (input as { workspaceId?: string } | null)?.workspaceId ?? "default-workspace";
    await this.permissionGuard.assert(user.id, workspaceId, "credential.manage");
    return this.credentialsService.createModelConnection(input, user.id);
  }

  @Delete(":credentialId")
  @HttpCode(200)
  async revoke(
    @Param() params: Record<string, string | undefined>,
    @Query() query: Record<string, string | undefined>,
    @Headers("cookie") cookieHeader?: string
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { credentialId } = parseCredentialIdParams(params);
    const { workspaceId } = parseWorkspaceQuery(query);
    await this.permissionGuard.assert(user.id, workspaceId, "credential.manage");
    return this.credentialsService.revoke(credentialId, workspaceId, user.id);
  }
}
