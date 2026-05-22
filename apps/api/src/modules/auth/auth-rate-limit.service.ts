import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";

import { RateLimitService, type RateLimitConfig } from "../limits/rate-limit.service.js";

export type AuthRateLimitWindowConfig = RateLimitConfig;

export type AuthRateLimitConfig = {
  login: {
    email: AuthRateLimitWindowConfig;
    ip: AuthRateLimitWindowConfig;
  };
  passwordReset: {
    email: AuthRateLimitWindowConfig;
    ip: AuthRateLimitWindowConfig;
  };
};

export type AuthRateLimitConfigOverrides = {
  login?: Partial<AuthRateLimitConfig["login"]>;
  passwordReset?: Partial<AuthRateLimitConfig["passwordReset"]>;
};

type Scope = "email" | "ip";

type ConsumeResult = {
  allowed: boolean;
  retryAfterMs: number;
  scope: Scope;
};

const defaultConfig: AuthRateLimitConfig = {
  login: {
    email: {
      limit: Number(process.env.AUTH_LOGIN_EMAIL_RATE_LIMIT ?? 10),
      windowMs: Number(process.env.AUTH_LOGIN_EMAIL_RATE_LIMIT_WINDOW_MS ?? 60_000)
    },
    ip: {
      limit: Number(process.env.AUTH_LOGIN_IP_RATE_LIMIT ?? 20),
      windowMs: Number(process.env.AUTH_LOGIN_IP_RATE_LIMIT_WINDOW_MS ?? 60_000)
    }
  },
  passwordReset: {
    email: {
      limit: Number(process.env.AUTH_PASSWORD_RESET_EMAIL_RATE_LIMIT ?? 5),
      windowMs: Number(
        process.env.AUTH_PASSWORD_RESET_EMAIL_RATE_LIMIT_WINDOW_MS ?? 300_000
      )
    },
    ip: {
      limit: Number(process.env.AUTH_PASSWORD_RESET_IP_RATE_LIMIT ?? 20),
      windowMs: Number(process.env.AUTH_PASSWORD_RESET_IP_RATE_LIMIT_WINDOW_MS ?? 300_000)
    }
  }
};

@Injectable()
export class AuthRateLimitService {
  private config = cloneConfig(defaultConfig);

  constructor(
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService
  ) {}

  getConfig(): AuthRateLimitConfig {
    return cloneConfig(this.config);
  }

  configure(overrides: AuthRateLimitConfigOverrides): void {
    this.config = {
      login: {
        email: {
          ...this.config.login.email,
          ...overrides.login?.email
        },
        ip: {
          ...this.config.login.ip,
          ...overrides.login?.ip
        }
      },
      passwordReset: {
        email: {
          ...this.config.passwordReset.email,
          ...overrides.passwordReset?.email
        },
        ip: {
          ...this.config.passwordReset.ip,
          ...overrides.passwordReset?.ip
        }
      }
    };
  }

  reset(): void {
    this.rateLimitService.reset();
    this.config = cloneConfig(defaultConfig);
  }

  enforceLoginLimit(email: string, ipAddress: string): void {
    const result = this.consumePair("auth.login", email, ipAddress, this.config.login);

    if (!result.allowed) {
      throw buildRateLimitException(result);
    }
  }

  enforcePasswordResetLimit(email: string, ipAddress: string): void {
    const result = this.consumePair(
      "auth.password-reset",
      email,
      ipAddress,
      this.config.passwordReset
    );

    if (!result.allowed) {
      throw buildRateLimitException(result);
    }
  }

  private consumePair(
    namespace: string,
    email: string,
    ipAddress: string,
    config: AuthRateLimitConfig["login"] | AuthRateLimitConfig["passwordReset"]
  ): ConsumeResult {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedIpAddress = normalizeIpAddress(ipAddress);

    const emailResult = this.rateLimitService.consume({
      key: `${namespace}:email:${normalizedEmail}`,
      ...config.email
    });
    if (!emailResult.allowed) {
      return {
        allowed: false,
        retryAfterMs: emailResult.retryAfterMs,
        scope: "email"
      };
    }

    const ipResult = this.rateLimitService.consume({
      key: `${namespace}:ip:${normalizedIpAddress}`,
      ...config.ip
    });
    if (!ipResult.allowed) {
      return {
        allowed: false,
        retryAfterMs: ipResult.retryAfterMs,
        scope: "ip"
      };
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      scope: "ip"
    };
  }
}

function buildRateLimitException(result: ConsumeResult): HttpException {
  const message =
    result.scope === "email"
      ? "Too many authentication attempts for this account. Wait before trying again."
      : "Too many authentication attempts from this network. Wait before trying again.";

  return new HttpException(
    {
      code: "rate_limited",
      message,
      retryAfterMs: result.retryAfterMs
    },
    HttpStatus.TOO_MANY_REQUESTS
  );
}

function cloneConfig(config: AuthRateLimitConfig): AuthRateLimitConfig {
  return {
    login: {
      email: { ...config.login.email },
      ip: { ...config.login.ip }
    },
    passwordReset: {
      email: { ...config.passwordReset.email },
      ip: { ...config.passwordReset.ip }
    }
  };
}

function normalizeIpAddress(ipAddress: string): string {
  const normalized = ipAddress.trim();

  return normalized.length > 0 ? normalized : "unknown";
}
