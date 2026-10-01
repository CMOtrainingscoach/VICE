import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("login page loads and has accessible title", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();
  await expect(page.getByText("VICE").first()).toBeVisible();
});

test("login page has no critical a11y violations", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(critical).toEqual([]);
});
