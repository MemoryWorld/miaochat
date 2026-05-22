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

import type { CredentialCreateInput } from "./dto.js";
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
