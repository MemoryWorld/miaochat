import { expect, test } from "@playwright/test";

function json(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    contentType: "application/json",
    status
  };
}

test("creates a custom agent and renders it in the saved agent list", async ({ page }) => {
  const createdAgent = {
    avatarUrl: null,
    capabilityTags: ["release", "writing"],
    id: "agent_release_drafter",
    name: "Release Drafter",
    provider: "codex",
    systemPrompt: "Draft release notes and changelog summaries.",
    toolBindings: [],
    workspaceId: "default-workspace"
  };

  let created = false;

  await page.route("http://localhost:3001/**", async (route) => {
    const url = route.request().url();

    if (url === "http://localhost:3001/custom-agents?workspaceId=default-workspace") {
      await route.fulfill(json(created ? [createdAgent] : []));
      return;
    }

    if (url === "http://localhost:3001/custom-agents") {
      created = true;
      await route.fulfill(json(createdAgent, 201));
      return;
    }

    throw new Error(`Unexpected request: ${url}`);
  });

  await page.goto("/agents");

  await expect(page.getByText("No custom agents have been saved yet.")).toBeVisible();

  await page.getByLabel("Agent name").fill("Release Drafter");
  await page.getByLabel("Provider").selectOption("codex");
  await page.getByLabel("Capability tags").fill("release, writing");
  await page
    .getByLabel("System prompt")
    .fill("Draft release notes and changelog summaries.");

  await page.getByRole("button", { name: "Create agent" }).click();

  await expect(page.getByText("Release Drafter")).toBeVisible();
});
