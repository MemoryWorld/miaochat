import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  Res
} from "@nestjs/common";

import { AuthService } from "./auth.service.js";

type HeaderWritableResponse = {
  header: (name: string, value: string) => unknown;
};

type AuthRequest = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("signup")
  async signup(
    @Body() input: unknown,
    @Res({ passthrough: true }) response?: HeaderWritableResponse
  ) {
    const result = await this.authService.signup(input);
    response?.header("Set-Cookie", result.setCookie);

    return {
      session: result.session,
      user: result.user
    };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() input: unknown,
    @Req() request?: AuthRequest,
    @Res({ passthrough: true }) response?: HeaderWritableResponse
  ) {
    const result = await this.authService.login(input, {
      ipAddress: resolveClientIp(request)
    });
    response?.header("Set-Cookie", result.setCookie);

    return {
      session: result.session,
      user: result.user
    };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) response?: HeaderWritableResponse
  ) {
    const result = await this.authService.logout(cookieHeader);
    response?.header("Set-Cookie", result.setCookie);

    return {
      loggedOut: result.loggedOut
    };
  }

  @Get("session")
  @HttpCode(200)
  session(@Headers("cookie") cookieHeader: string | undefined) {
    return this.authService.getSession(cookieHeader);
  }

  @Post("password-reset/request")
  @HttpCode(202)
  requestPasswordReset(@Body() input: unknown, @Req() request?: AuthRequest) {
    return this.authService.requestPasswordReset(input, {
      ipAddress: resolveClientIp(request)
    });
  }
}

function resolveClientIp(request: AuthRequest | undefined): string {
  const forwarded = request?.headers?.["x-forwarded-for"];
  const headerValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstForwardedIp = headerValue?.split(",")[0]?.trim();

  if (firstForwardedIp) {
    return firstForwardedIp;
  }

  return request?.ip?.trim() || "unknown";
}
