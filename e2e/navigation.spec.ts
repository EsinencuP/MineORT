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
