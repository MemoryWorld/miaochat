import { describe, expect, it } from "vitest";

import { mapToPublicError } from "../src/errors/public-error-mapper.js";

describe("public error mapper", () => {
  it("maps missing runtime errors to a public service-unavailable error", () => {
    expect(mapToPublicError({ code: "missing_runtime" })).toMatchObject({
      code: "missing_runtime",
      status: 503
    });
  });
});
