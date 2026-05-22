import { Body, Controller, Headers, HttpCode, Inject, Post } from "@nestjs/common";

import { z } from "zod";

import { AuthService } from "../auth/auth.service.js";
import { WorkspaceInvitationsService } from "./invitations.service.js";

const acceptInvitationInputSchema = z.object({
  token: z.string().trim().min(1)
});

@Controller("invitations")
export class InvitationsController {
  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(WorkspaceInvitationsService)
    private readonly invitationsService: WorkspaceInvitationsService
  ) {}

  @Post("accept")
  @HttpCode(200)
  async accept(
    @Body() input: unknown,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const user = await this.authService.requireAuthenticatedUser(cookieHeader);
    const { token } = acceptInvitationInputSchema.parse(input);
    return this.invitationsService.accept(token, user.id, user.email);
  }
}
