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
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible" });
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.viewport + 2);
  }

  await context.close();
});

test("application shell and operational layout primitives fit the configured viewport", async () => {
  const { context, page } = await pageForTest();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator(".auth-form").waitFor({ state: "visible" });
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    document.body.innerHTML = `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">LeaveCtrl</div>
          <div class="mobile-header-actions"><button class="mobile-nav-toggle" aria-label="Open navigation">Menu</button></div>
          <nav class="nav-list"><a class="nav-item active">My Leave</a><a class="nav-item">Team</a></nav>
          <div class="sidebar-foot">Account</div>
        </aside>
        <main class="app-main">
          <header class="topbar">Desktop topbar</header>
          <div class="page-wrap">
            <div class="page-head"><h1>Responsive release fixture</h1></div>
            <section class="summary-grid">
              <div class="summary-card">Balance</div><div class="summary-card">Pending</div>
              <div class="summary-card">Next away</div><div class="summary-card">Team</div>
            </section>
            <section class="booking-grid">
              <div class="card leave-form">Booking form</div><div class="card booking-side">Booking context</div>
            </section>
            <section class="people-admin-grid">
              <div class="card invite-card">Invite</div><div class="card manager-card">Manager</div>
            </section>
            <section class="billing-fields"><label>Plan<input value="Standard" /></label><label>Seats<input value="10" /></label></section>
            <div class="table-scroll" data-test="wide-table"><table style="min-width:900px"><tbody><tr><td>Wide operational table remains contained</td></tr></tbody></table></div>
            <div class="company-calendar-scroll" data-test="wide-calendar"><div style="min-width:1100px;height:40px">Wide calendar remains contained</div></div>
          </div>
        </main>
      </div>
    `;
  });

  const shell = page.locator(".app-shell");
  const sidebar = page.locator(".sidebar");
  const topbar = page.locator(".topbar");
  const toggle = page.locator(".mobile-nav-toggle");

  if (width <= 900) {
    await expect(shell).toHaveCSS("display", "block");
    await expect(sidebar).toHaveCSS("height", "60px");
    await expect(topbar).toHaveCSS("display", "none");
    await expect(toggle).toHaveCSS("display", "grid");
  } else {
    await expect(shell).toHaveCSS("display", "grid");
    await expect(topbar).toHaveCSS("display", "flex");
    await expect(toggle).toHaveCSS("display", "none");
  }

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    tableContained:
      document.querySelector('[data-test="wide-table"]').scrollWidth >
      document.querySelector('[data-test="wide-table"]').clientWidth,
    calendarContained:
      document.querySelector('[data-test="wide-calendar"]').scrollWidth >
      document.querySelector('[data-test="wide-calendar"]').clientWidth,
  }));

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 2);
  if (width < 900) {
    expect(layout.tableContained).toBe(true);
    expect(layout.calendarContained).toBe(true);
  }

  await context.close();
});

test("keyboard focus becomes visibly apparent on the login surface", async () => {
  const { context, page } = await pageForTest();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible" });

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
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible" });
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
