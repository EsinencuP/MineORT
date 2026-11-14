import { expect, test } from "@playwright/test";

test("home renders with main CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MineOrt IV" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Начать играть" }).first(),
  ).toBeVisible();
});

test("P0 pages open", async ({ page }) => {
  for (const path of ["/guide", "/dashboard", "/start", "/login"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test("flagged routes are 404 when waves are off", async ({ request }) => {
  for (const path of ["/social", "/players", "/map", "/social/polls"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
});

test("no horizontal scroll at 320 px", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile-320");
  await page.goto("/");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("menu hides unavailable items and has no dead links", async ({
  page,
  request,
}, info) => {
  await page.goto("/");
  if (info.project.name === "mobile-320") {
    await page.getByRole("button", { name: "Меню" }).click();
  }
  const nav = page
    .getByRole("navigation", { name: "Главное меню" })
    .filter({ visible: true });
  await expect(nav.getByRole("link", { name: "Карта" })).toHaveCount(0);
  const hrefs = await nav
    .getByRole("link")
    .evaluateAll((a) => a.map((x) => x.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect((await request.get(href)).status(), href).toBe(200);
  }
});
