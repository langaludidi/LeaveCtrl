import { test, expect, chromium, webkit } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const baseURL = process.env.LEAVECTRL_BASE_URL ?? "https://app.leavectrl.co.za";
const browserName = process.env.E2E_BROWSER ?? "chromium";
const width = Number(process.env.E2E_WIDTH ?? "1440");
const height = Number(process.env.E2E_HEIGHT ?? "1000");

let browser;

test.beforeAll(async () => {
  browser = browserName === "webkit" ? await webkit.launch() : await chromium.launch();
});

test.afterAll(async () => {
  await browser.close();
});

async function pageForTest() {
  const context = await browser.newContext({
    viewport: { width, height },
    baseURL,
  });
  const page = await context.newPage();
  return { context, page };
}

test("production health endpoint is available", async () => {
  const { context, page } = await pageForTest();
  const response = await page.goto("/api/health", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(await page.locator("body").innerText()).toContain("LeaveCtrl");
  await context.close();
});

test("protected routes redirect unauthenticated users to login", async () => {
  const { context, page } = await pageForTest();

  for (const path of ["/", "/team", "/reports", "/audit", "/setup", "/billing"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  }

  await context.close();
});

test("login and recovery surfaces fit the viewport without document overflow", async () => {
  const { context, page } = await pageForTest();

  for (const path of ["/login", "/reset-password"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 2);
  }

  await context.close();
});

test("keyboard focus becomes visibly apparent on the login surface", async () => {
  const { context, page } = await pageForTest();
  await page.goto("/login", { waitUntil: "networkidle" });

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow,
      };
    });

    if (
      focus &&
      ((focus.outlineStyle !== "none" && focus.outlineWidth !== "0px") ||
        focus.boxShadow !== "none")
    ) {
      await context.close();
      return;
    }
  }

  await context.close();
  throw new Error("No visibly focused keyboard target found within the first eight Tab stops");
});

test("login and recovery surfaces have no serious or critical axe violations", async () => {
  const { context, page } = await pageForTest();

  for (const path of ["/login", "/reset-password"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );

    expect(
      blocking,
      blocking.map((violation) => `${violation.id}: ${violation.help}`).join("\n"),
    ).toEqual([]);
  }

  await context.close();
});
