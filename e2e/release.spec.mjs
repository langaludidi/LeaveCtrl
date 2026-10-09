import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const publicPages = [
  { path: "/login", name: "login" },
  { path: "/reset-password", name: "reset password" },
];

async function expectNoHorizontalOverflow(page) {
  const fits = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= window.innerWidth + 1;
  });
  expect(fits).toBe(true);
}

async function expectWcagAA(page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    results.violations,
    results.violations
      .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`)
      .join("\n"),
  ).toEqual([]);
}

for (const target of publicPages) {
  test(`${target.name}: phone responsive and WCAG 2.1 A/AA`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const response = await page.goto(target.path, { waitUntil: "domcontentloaded" });
    expect(response?.status() ?? 500).toBeLessThan(500);
    await page.waitForTimeout(750);
    await expectNoHorizontalOverflow(page);
    await expectWcagAA(page);
  });

  test(`${target.name}: desktop responsive and WCAG 2.1 A/AA`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.goto(target.path, { waitUntil: "domcontentloaded" });
    expect(response?.status() ?? 500).toBeLessThan(500);
    await page.waitForTimeout(750);
    await expectNoHorizontalOverflow(page);
    await expectWcagAA(page);
  });
}

test("narrow 320px login remains usable without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await expectNoHorizontalOverflow(page);

  const email = page.locator('input[type="email"]');
  const password = page.locator('input[type="password"]');
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
});

test("protected application routes redirect anonymous users to authentication", async ({ page }) => {
  for (const path of ["/my-leave", "/team", "/billing", "/reports", "/audit"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login|\/access\//);
  }
});

test("keyboard focus is visible on login controls", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.keyboard.press("Tab");

  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();

  const focusEvidence = await focused.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });

  expect(
    focusEvidence.outlineStyle !== "none" ||
      focusEvidence.outlineWidth !== "0px" ||
      focusEvidence.boxShadow !== "none",
  ).toBe(true);
});
