import { expect, test } from "@playwright/test";

const store = {
  version: 3,
  activeProjectId: "project-1",
  projects: [
    {
      id: "project-1",
      name: "Demo Workspace",
      repoPath: "/Users/demo",
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      tiles: [
        {
          id: "tile-1",
          name: "Agent A",
          agentId: "agent-1",
          role: "coding",
          sessionKey: "agent:agent-1:main",
          workspacePath: "/Users/demo",
          archivedAt: null,
          model: null,
          thinkingLevel: "low",
          position: { x: 300, y: 260 },
          size: { width: 420, height: 520 },
        },
        {
          id: "tile-2",
          name: "Agent B",
          agentId: "agent-2",
          role: "coding",
          sessionKey: "agent:agent-2:main",
          workspacePath: "/Users/demo",
          archivedAt: null,
          model: null,
          thinkingLevel: "low",
          position: { x: 900, y: 320 },
          size: { width: 420, height: 520 },
        },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/projects", async (route, request) => {
    if (request.method() !== "GET" && request.method() !== "PUT") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(store),
    });
  });
});

test("inspect panel opens on demand and closes on selection", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("agent-inspect-panel")).toHaveCount(0);

  await page.getByTestId("agent-inspect-toggle").first().click();
  await expect(page.getByTestId("agent-inspect-panel")).toBeVisible();

  await page.locator("[data-tile]").nth(1).click({ force: true });
  await expect(page.getByTestId("agent-inspect-panel")).toHaveCount(0);

  await page.getByTestId("agent-inspect-toggle").nth(1).click();
  await expect(page.getByTestId("agent-inspect-panel")).toBeVisible();
  await page.getByTestId("agent-inspect-close").click();
  await expect(page.getByTestId("agent-inspect-panel")).toHaveCount(0);
});
