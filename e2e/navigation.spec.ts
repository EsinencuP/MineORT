import { expect, test } from "@playwright/test";

// Navigation feedback and orientation (audit N-01, N-03): a pressed link answers at once, the menu
// and the section bar mark where you are, and a hostile "back" address never becomes a link.

test("a pressed link answers at once and the menu marks the new section", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "the wide menu is desktop only");
  // Hold every page request for 1.5 s, like a slow connection.
  await page.route(/\/guide(\?|$)/, async (route) => {
    if (route.request().headers()["rsc"])
      await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.goto("/rules");
  const menu = page.getByRole("navigation", { name: "Главное меню" });
  await menu.getByRole("link", { name: "Как играть" }).click();

  // Within a fraction of a second the bar is shown and the page is marked as busy.
  await expect(page.locator("[data-nav-progress]")).toBeVisible({
    timeout: 600,
  });
  await expect(page.locator("html")).toHaveAttribute("data-nav-pending", "1");

  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Как играть",
  );
  await expect(page.locator("[data-nav-progress]")).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Как играть" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(menu.getByRole("link", { name: "Главная" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the section bar sits on the guide page and marks it", async ({
  page,
}) => {
  await page.goto("/guide");
  const bar = page.getByRole("navigation", { name: "Разделы портала" });
  await expect(bar).toBeVisible();
  await expect(bar.locator("a[aria-current=page]")).toHaveCount(1);
  await expect(bar.locator("a[aria-current=page]")).toHaveText("Гайдбук");
});

test("a back address that points off the site is ignored", async ({ page }) => {
  // The article page is a 404 for an unknown slug, so use the list; it must not echo the value.
  const res = await page.goto("/guide?back=//evil.test");
  expect(res?.status()).toBe(200);
  await expect(page.locator('a[href*="evil.test"]')).toHaveCount(0);
});

test("the mobile menu closes once the new page has arrived", async ({
  page,
}, info) => {
  test.skip(info.project.name === "desktop", "the burger is a phone control");
  await page.goto("/rules");
  await page.getByRole("button", { name: "Меню" }).click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await page
    .locator("#mobile-menu")
    .getByRole("link", { name: "Как играть" })
    .click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.locator("#mobile-menu")).toBeHidden();
  await expect(page.getByRole("button", { name: "Меню" })).toBeVisible();
});

test("the section bar is short: sections in one row, the pages of the open one below", async ({
  page,
}) => {
  test.skip(process.env.FF_P1A !== "true", "needs the social wave");
  await page.goto("/social/gallery");
  const bar = page.getByRole("navigation", { name: "Разделы портала" });
  // first row: at most five sections, none of them hidden behind a scroll
  const top = bar.locator("> div > ul").first().getByRole("link");
  expect(await top.count()).toBeLessThanOrEqual(5);
  for (const link of await top.all()) await expect(link).toBeVisible();
  // second row: the pages of «Общение», the gallery is the current one
  const sub = bar.getByRole("list", { name: "Общение" });
  await expect(sub.getByRole("link", { name: "Галерея" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(sub.getByRole("link", { name: "Проекты" })).toBeVisible();
});

test("reading text is not set in the pixel face", async ({ page }) => {
  await page.goto("/");
  const fonts = await page.evaluate(() => {
    const ff = (sel: string) =>
      getComputedStyle(document.querySelector(sel)!).fontFamily;
    return {
      p: ff("main p:not(.eyebrow)"),
      h2: ff("main h2"),
      button: ff("header a"),
    };
  });
  expect(fonts.p).toMatch(/inter/i);
  expect(fonts.h2).toMatch(/modula/i);
});
