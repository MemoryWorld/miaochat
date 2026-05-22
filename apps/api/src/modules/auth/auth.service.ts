import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";

import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";

import type { PoolClient } from "pg";

import { DatabaseService } from "../database/database.service.js";
import { AuthAuditService } from "./auth-audit.service.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import {
  authResponseSchema,
  authUserSchema,
  parseLoginInput,
  parsePasswordResetRequestInput,
  parseSignupInput,
  type AuthResponse,
  type AuthUser
} from "./dto.js";

const scrypt = promisify(scryptCallback);

const SESSION_COOKIE_NAME = "agenthub_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const DEFAULT_WORKSPACE_ID = "default-workspace";
const DEFAULT_WORKSPACE_NAME = "Default Workspace";

type AuthRequestContext = {
  ipAddress?: string;
};

type UserRow = {
  display_name: string;
  email: string;
  id: string;
};

type LoginRow = UserRow & {
  password_hash: string;
};

type SessionRecord = {
  expiresAt: Date;
  setCookie: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthAuditService) private readonly authAuditService: AuthAuditService,
    @Inject(AuthRateLimitService)
    private readonly authRateLimitService: AuthRateLimitService,
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async signup(input: unknown): Promise<AuthResponse & { setCookie: string }> {
    const parsed = parseSignupInput(input);
    const displayName = parsed.displayName ?? deriveDisplayName(parsed.email);
    const passwordHash = await hashSecret(parsed.password);

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        const userId = randomUUID();
        const insertedUsers = await client.query<UserRow>(
          `
            INSERT INTO users (
              id,
              email,
              display_name
            )
            VALUES ($1, $2, $3)
            RETURNING id, email, display_name
          `,
          [userId, parsed.email, displayName]
        );

        await client.query(
          `
            INSERT INTO auth_credentials (
              user_id,
              password_hash
            )
            VALUES ($1, $2)
          `,
          [userId, passwordHash]
        );

        // Provision the default workspace so that the workspace entity is
        // immediately reachable for the newly registered user. Avoids a
        // circular import with WorkspacesModule by issuing the SQL inline.
        await client.query(
          `
            INSERT INTO workspaces (
              id,
              owner_user_id,
              name
            )
            VALUES ($1, $2, $3)
            ON CONFLICT (owner_user_id, id) DO NOTHING
          `,
          [DEFAULT_WORKSPACE_ID, userId, DEFAULT_WORKSPACE_NAME]
        );

        // Record the user as the owner-member of their default workspace so
        // the membership table is consistent with the workspaces registry.
        await client.query(
          `
            INSERT INTO workspace_members (
              workspace_id,
              workspace_owner_user_id,
              user_id,
              role
            )
            VALUES ($1, $2, $2, 'owner')
            ON CONFLICT (workspace_owner_user_id, workspace_id, user_id) DO NOTHING
          `,
          [DEFAULT_WORKSPACE_ID, userId]
        );

        const session = await this.issueSession(client, userId);
        await client.query("COMMIT");

        return buildAuthResponse(insertedUsers.rows[0], session);
      } catch (error) {
        await client.query("ROLLBACK");

        if (isUniqueViolation(error)) {
          throw new ConflictException(`User ${parsed.email} already exists.`);
        }

        throw error;
      }
    });
  }

  async login(
    input: unknown,
    context: AuthRequestContext = {}
  ): Promise<AuthResponse & { setCookie: string }> {
    const parsed = parseLoginInput(input);
    const ipAddress = normalizeIpAddress(context.ipAddress);

    try {
      this.authRateLimitService.enforceLoginLimit(parsed.email, ipAddress);
    } catch (error) {
      await this.authAuditService.recordLoginAttempt({
        email: parsed.email,
        failureReason: "rate_limited",
        ipAddress,
        outcome: "rate_limited"
      });
      throw error;
    }

    const result = await this.database.query<LoginRow>(
      `
        SELECT
          users.id,
          users.email,
          users.display_name,
          auth_credentials.password_hash
        FROM users
        JOIN auth_credentials ON auth_credentials.user_id = users.id
        WHERE users.email = $1
      `,
      [parsed.email]
    );

    const row = result.rows[0];
    if (!row || !(await verifySecret(parsed.password, row.password_hash))) {
      await this.authAuditService.recordLoginAttempt({
        email: parsed.email,
        failureReason: "invalid_credentials",
        ipAddress,
        outcome: "failed",
        userId: row?.id ?? null
      });
      throw new UnauthorizedException("Invalid email or password.");
    }

    return this.database.withClient(async (client) => {
      await client.query("BEGIN");

      try {
        await revokeActiveSessions(client, row.id);
        const session = await this.issueSession(client, row.id);
        await this.authAuditService.recordLoginAttempt(
          {
            email: row.email,
            ipAddress,
            outcome: "succeeded",
            userId: row.id
          },
          client
        );
        await client.query("COMMIT");

        return buildAuthResponse(row, session);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  }

  async logout(cookieHeader: string | undefined): Promise<{ loggedOut: true; setCookie: string }> {
    const sessionToken = readCookie(cookieHeader, SESSION_COOKIE_NAME);

    if (sessionToken) {
      await this.database.query(
        `
          UPDATE auth_sessions
          SET
            revoked_at = now(),
            updated_at = now()
          WHERE session_token_hash = $1 AND revoked_at IS NULL
        `,
        [hashToken(sessionToken)]
      );
    }

    return {
      loggedOut: true,
      setCookie: buildExpiredSessionCookie()
    };
  }

  async getAuthenticatedUser(cookieHeader: string | undefined): Promise<AuthUser | null> {
    const sessionToken = readCookie(cookieHeader, SESSION_COOKIE_NAME);

    if (!sessionToken) {
      return null;
    }

    const result = await this.database.query<UserRow>(
      `
        SELECT
          users.id,
          users.email,
          users.display_name
        FROM auth_sessions
        INNER JOIN users
          ON users.id = auth_sessions.user_id
        WHERE auth_sessions.session_token_hash = $1
          AND auth_sessions.revoked_at IS NULL
          AND auth_sessions.expires_at > now()
      `,
      [hashToken(sessionToken)]
    );

    return result.rows[0] ? mapAuthUser(result.rows[0]) : null;
  }

  async requireAuthenticatedUser(cookieHeader: string | undefined): Promise<AuthUser> {
    const user = await this.getAuthenticatedUser(cookieHeader);

    if (!user) {
      throw new UnauthorizedException("Authentication is required.");
    }

    return user;
  }

  async getSession(cookieHeader: string | undefined): Promise<
    | {
        authenticated: false;
      }
    | {
        authenticated: true;
        user: AuthUser;
      }
  > {
    const user = await this.getAuthenticatedUser(cookieHeader);

    if (!user) {
      return {
        authenticated: false
      };
    }

    return {
      authenticated: true,
      user
    };
  }

  async requestPasswordReset(
    input: unknown,
    context: AuthRequestContext = {}
  ): Promise<{ accepted: true }> {
    const parsed = parsePasswordResetRequestInput(input);
    const ipAddress = normalizeIpAddress(context.ipAddress);

    this.authRateLimitService.enforcePasswordResetLimit(parsed.email, ipAddress);

    const result = await this.database.query<UserRow>(
      `
        SELECT id, email, display_name
        FROM users
        WHERE email = $1
      `,
      [parsed.email]
    );

    const user = result.rows[0];
    if (!user) {
      return { accepted: true };
    }

    const resetToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.database.query(
      `
        UPDATE auth_credentials
        SET
          password_reset_requested_at = now(),
          password_reset_token_hash = $2,
          password_reset_token_expires_at = $3,
          updated_at = now()
        WHERE user_id = $1
      `,
      [user.id, hashToken(resetToken), expiresAt]
    );

    return { accepted: true };
  }

  private async issueSession(
    client: PoolClient,
    userId: string
  ): Promise<SessionRecord> {
    const rawToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await client.query(
      `
        INSERT INTO auth_sessions (
          id,
          user_id,
          session_token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
      `,
      [randomUUID(), userId, hashToken(rawToken), expiresAt]
    );

    return {
      expiresAt,
      setCookie: buildSessionCookie(rawToken, expiresAt)
    };
  }
}

function buildAuthResponse(
  userRow: UserRow | LoginRow | undefined,
  session: SessionRecord
): AuthResponse & { setCookie: string } {
  if (!userRow) {
    throw new Error("Expected an authenticated user row when building auth response.");
  }

  const user = mapAuthUser(userRow);

  const response = authResponseSchema.parse({
    session: {
      expiresAt: session.expiresAt
    },
    user
  });

  return {
    ...response,
    setCookie: session.setCookie
  };
}

function mapAuthUser(userRow: UserRow | LoginRow): AuthUser {
  return authUserSchema.parse({
    displayName: userRow.display_name,
    email: userRow.email,
    id: userRow.id
  });
}

function buildExpiredSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function buildSessionCookie(sessionToken: string, expiresAt: Date): string {
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  return `${SESSION_COOKIE_NAME}=${sessionToken}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function normalizeIpAddress(ipAddress: string | undefined): string {
  const normalized = ipAddress?.trim();

  return normalized && normalized.length > 0 ? normalized : "unknown";
}

function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function deriveDisplayName(email: string): string {
  const [localPart = "User"] = email.split("@");
  return localPart.slice(0, 80);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(secret, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const [key, ...rawValue] = segment.trim().split("=");
    if (key === name) {
      return rawValue.join("=");
    }
  }

  return null;
}

async function revokeActiveSessions(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `
      UPDATE auth_sessions
      SET
        revoked_at = now(),
        updated_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
    `,
    [userId]
  );
}

async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) {
    return false;
  }

  const derivedKey = (await scrypt(secret, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");

  if (expected.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(expected, derivedKey);
}
