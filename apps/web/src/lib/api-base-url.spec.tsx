import { describe, expect, it } from "vitest";

import { apiBaseUrl, buildApiUrl } from "./api-base-url";

describe("api base url", () => {
  it("uses the same-origin API proxy by default", () => {
    expect(apiBaseUrl).toBe("/api");
  });

  it("builds API URLs without forcing localhost into the browser", () => {
    expect(buildApiUrl("/auth/session")).toBe("/api/auth/session");
    expect(buildApiUrl("auth/login")).toBe("/api/auth/login");
  });
});
