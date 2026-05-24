import { expect, test } from "@playwright/test";

import type { ProviderKey } from "../e2e/real-provider-test-support.js";

import {
  cleanupStagingCredential,
  createAuthenticatedStagingSession,
  getStagingCredentialDraft
} from "./support/byok-test-support.js";

const providers: Array<{ name: string; provider: ProviderKey }> = [
  { name: "Codex", provider: "codex" },
  { name: "Claude Code", provider: "claude-code" },
  { name: "Hermes", provider: "hermes" },
  { name: "OpenClaw", provider: "openclaw" }
];

test.describe.configure({ mode: "serial" });

for (const { name, provider } of providers) {
  test(`binds a ${name} credential through the setup flow`, async ({
    context,
    page,
    request
  }) => {
    const session = await createAuthenticatedStagingSession(request, context);
    const credential = getStagingCredentialDraft(provider);

    try {
      await page.goto("/setup");

      await page.getByRole("button", { name }).click();
      await page.getByLabel("Credential label").fill(credential.label);
      await page
        .getByLabel("Provider account identifier")
        .fill(credential.providerAccountId);
      await page.getByLabel("Provider secret").fill(credential.secret);
      await page.getByRole("button", { name: "Validate credential" }).click();

      await expect(page.getByText("Validation passed")).toBeVisible();

      await page.getByRole("button", { name: "Save and bind" }).click();

      await expect(page.getByText("Credential saved")).toBeVisible();
      await expect(page.getByText(credential.label, { exact: true })).toBeVisible();
      await expect(
        page.getByText(new RegExp(`${credential.providerAccountId}.*valid`, "i"))
      ).toBeVisible();
    } finally {
      await cleanupStagingCredential(request, session, provider, credential.label);
    }
  });
}
