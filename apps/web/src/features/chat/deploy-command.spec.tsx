import { describe, expect, it } from "vitest";

import { parseDeployCommand } from "./deploy-command";

describe("parseDeployCommand", () => {
  it("extracts the target name from a /deploy command", () => {
    expect(parseDeployCommand("/deploy Marketing Preview")).toEqual({
      targetName: "Marketing Preview"
    });
    expect(parseDeployCommand("  /deploy   staging-container   ")).toEqual({
      targetName: "staging-container"
    });
  });

  it("ignores regular chat messages and incomplete commands", () => {
    expect(parseDeployCommand("ship this to preview")).toBeNull();
    expect(parseDeployCommand("/deploy")).toBeNull();
    expect(parseDeployCommand("/deploy   ")).toBeNull();
  });
});
