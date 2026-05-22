import { describe, expect, it } from "vitest";

import {
  buildPublicError,
  mapToPublicError
} from "../../packages/domain/src/errors/public-error-mapper.js";

describe("publicErrorMapper", () => {
  it("maps rate-limit signals to a 429 surface", () => {
    expect(mapToPublicError({ code: "rate_limited" })).toEqual({
      code: "rate_limited",
      message: expect.stringContaining("too quickly"),
      status: 429
    });
    expect(mapToPublicError(new Error("Hit rate limit on conversation"))).toEqual(
      expect.objectContaining({ code: "rate_limited", status: 429 })
    );
  });

  it("maps timeouts and provider failures to safe 5xx surfaces", () => {
    expect(
      mapToPublicError(new Error("Mock dispatch timed out before completion"))
    ).toEqual(expect.objectContaining({ code: "provider_timeout", status: 504 }));
    expect(mapToPublicError(new Error("Provider error from upstream"))).toEqual(
      expect.objectContaining({ code: "provider_failed", status: 502 })
    );
  });

  it("maps validation failures to a 400 surface", () => {
    expect(
      mapToPublicError(Object.assign(new Error("validation failed"), { name: "ZodError" }))
    ).toEqual(expect.objectContaining({ code: "validation", status: 400 }));
  });

  it("maps not-found and credential errors to safe surfaces", () => {
    expect(mapToPublicError(new Error("Message not found"))).toEqual(
      expect.objectContaining({ code: "not_found", status: 404 })
    );
    expect(mapToPublicError(new Error("Credential validation failed"))).toEqual(
      expect.objectContaining({ code: "credential_invalid", status: 400 })
    );
  });

  it("falls back to a generic internal error for unrecognized inputs", () => {
    expect(mapToPublicError("boom")).toEqual(
      expect.objectContaining({ code: "internal", status: 500 })
    );
    expect(mapToPublicError(null)).toEqual(
      expect.objectContaining({ code: "internal", status: 500 })
    );
  });

  it("attaches a retryAfterMs hint when explicitly built", () => {
    expect(buildPublicError("rate_limited", { retryAfterMs: 1500 })).toEqual({
      code: "rate_limited",
      message: expect.any(String),
      retryAfterMs: 1500,
      status: 429
    });
  });
});
