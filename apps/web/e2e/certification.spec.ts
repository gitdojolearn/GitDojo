import { expect, test } from "@playwright/test";

// These projects run without accounts; the signed-out and signed-in states are covered by unit
// tests, and the signed-out path to sign-in by auth-flow.spec.ts.
test("anyone can read the whole track before starting", async ({ page }) => {
  await page.goto("/certification");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Git Foundations completion certificate",
  );
  await expect(page.getByText("Completion certificate", { exact: true })).toBeVisible();

  // Every requirement, in order, linked to real content, before the learner starts.
  const requirements = page.getByTestId("track-requirement");
  await expect(requirements).toHaveCount(11);
  await expect(requirements.first().getByRole("link")).toHaveAttribute(
    "href",
    "/learn/git-basics/what-is-git",
  );
  await expect(requirements.last().getByRole("link")).toHaveAttribute(
    "href",
    "/practice/commit-one-change",
  );
  // No invented progress without an account.
  await expect(page.getByTestId("requirement-status")).toHaveCount(0);
  await expect(page.getByTestId("track-unconfigured")).toContainText(
    "accounts aren't set up on this site",
  );
  await expect(page.getByRole("region", { name: "What the certificate means" })).toContainText(
    "not proof of assessed Git skill",
  );
});

test("the track is in the main navigation and on the dashboard", async ({ page, isMobile }) => {
  await page.goto("/learn");
  if (isMobile) await page.getByRole("button", { name: /menu/i }).click();
  await page.getByRole("link", { name: "Certification" }).first().click();
  await expect(page).toHaveURL(/\/certification$/);

  await page.goto("/dashboard");
  const card = page.getByTestId("track-card");
  await expect(card).toContainText("Git Foundations completion certificate");
  await expect(card).toContainText("Certificates need accounts");
  await card.getByRole("link", { name: "View all criteria" }).click();
  await expect(page).toHaveURL(/\/certification$/);
});
