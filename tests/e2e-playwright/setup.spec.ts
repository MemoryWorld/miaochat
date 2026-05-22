import { expect, test } from "@playwright/test";

function json(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    contentType: "application/json",
    status
  };
}

test("selects a provider, validates credentials, and shows the bound credential list", async ({
  page
}) => {
  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();

    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([]));
      return;
    }

    if (url === "http://localhost:3001/credentials/modes?workspaceId=default-workspace") {
      await route.fulfill(json([]));
      return;
    }

    if (url === "http://localhost:3001/credentials?workspaceId=default-workspace") {
      const hasSavedCredential = route.request().method() === "GET" && seenSave;
      await route.fulfill(
        json(
          hasSavedCredential
            ? [
                {
                  credentialSource: "user_provided",
                  id: "cred_openclaw",
                  label: "OpenClaw ops",
                  provider: "openclaw",
                  providerAccountId: "acct_openclaw",
                  validationState: "valid",
                  workspaceId: "default-workspace"
                }
              ]
            : []
        )
      );
      return;
    }

    if (url === "http://localhost:3001/credentials/validate") {
      seenValidate = true;
      await route.fulfill(
        json({
          message: "OpenClaw credential passed local format validation.",
          providerAccountId: "acct_openclaw",
          valid: true
        })
      );
      return;
    }

    if (url === "http://localhost:3001/credentials") {
      seenSave = true;
      await route.fulfill(
        json(
          {
            credentialSource: "user_provided",
            id: "cred_openclaw",
            label: "OpenClaw ops",
            provider: "openclaw",
            providerAccountId: "acct_openclaw",
            validationState: "valid",
            workspaceId: "default-workspace"
          },
          201
        )
      );
      return;
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  let seenSave = false;
  let seenValidate = false;

  await page.goto("/setup");

  await expect(
    page.getByText("Nothing has been saved in the default workspace yet.")
  ).toBeVisible();

  await page.getByRole("button", { name: /OpenClaw/i }).click();
  await page.getByLabel("Credential label").fill("OpenClaw ops");
  await page.getByLabel("Provider account identifier").fill("acct_openclaw");
  await page.getByLabel("Provider secret").fill("openclaw_demo_secret");
  await page.getByRole("button", { name: "Validate credential" }).click();

  await expect(page.getByText("Validation passed")).toBeVisible();

  await page.getByRole("button", { name: "Save and bind" }).click();

  await expect(page.getByText("OpenClaw ops", { exact: true })).toBeVisible();
  await expect(page.getByText(/acct_openclaw · valid/)).toBeVisible();
  expect(seenValidate).toBe(true);
  expect(seenSave).toBe(true);
});

test("switches the selected provider into platform-managed mode", async ({ page }) => {
  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();

    if (url === "http://localhost:3001/workspaces") {
      await route.fulfill(json([]));
      return;
    }

    if (
      url === "http://localhost:3001/credentials/modes?workspaceId=default-workspace" ||
      url === "http://localhost:3001/credentials?workspaceId=default-workspace"
    ) {
      await route.fulfill(json([]));
      return;
    }

    if (url === "http://localhost:3001/credentials/modes") {
      await route.fulfill(
        json({
          credentialSource: "platform_managed",
          provider: "codex",
          workspaceId: "default-workspace"
        })
      );
      return;
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/setup");

  await expect(
    page.getByText("Nothing has been saved in the default workspace yet.")
  ).toBeVisible();

  await page.getByRole("button", { name: "Platform-managed" }).click();
  await page
    .getByRole("button", { name: "Enable platform-managed mode" })
    .click();

  await expect(page.getByText("Platform-managed mode enabled")).toBeVisible();
});
