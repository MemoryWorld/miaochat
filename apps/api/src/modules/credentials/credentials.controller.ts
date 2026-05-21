import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CredentialsService } from "./credentials.service.js";

@Controller("credentials")
export class CredentialsController {
  constructor(
    @Inject(CredentialsService)
    private readonly credentialsService: CredentialsService
  ) {}

  @Post()
  create(@Body() input: CredentialCreateInput) {
    return this.credentialsService.create(input);
  }

  @Post("validate")
  @HttpCode(200)
  validate(@Body() input: CredentialCreateInput) {
    return this.credentialsService.validate(input);
  }

  @Get()
  list(@Query() query: Record<string, string | undefined>) {
    const { workspaceId } = parseWorkspaceQuery(query);
    return this.credentialsService.list(workspaceId);
  }

  @Delete(":credentialId")
  @HttpCode(200)
  revoke(
    @Param() params: Record<string, string | undefined>,
    @Query() query: Record<string, string | undefined>
  ) {
    const { credentialId } = parseCredentialIdParams(params);
    const { workspaceId } = parseWorkspaceQuery(query);

    return this.credentialsService.revoke(credentialId, workspaceId);
  }
}
