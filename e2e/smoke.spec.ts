import { expect, test } from "@playwright/test";

test("home renders with main CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Исследуй",
  );
  await expect(
    page.getByRole("link", { name: "Начать играть" }).first(),
  ).toBeVisible();
});

test("P0 pages open", async ({ page }) => {
  for (const path of ["/guide", "/start", "/login", "/rules"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }
});

test("dashboard sends guests to login instead of leaking data", async ({
  request,
}) => {
  const res = await request.get("/dashboard", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toContain("/api/auth/telegram/start");
});

test("admin area is closed to guests", async ({ request }) => {
  const res = await request.get("/admin/applications", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers()["location"], "http://x").pathname).toBe("/");
});

test("flagged routes are 404 when waves are off", async ({ request }) => {
  test.skip(
    process.env.FF_P1A === "true" || process.env.FF_P1B_SOCIAL === "true",
    "waves are switched on",
  );
  for (const path of ["/social", "/players", "/map", "/social/polls"]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
  }
});

test("no horizontal scroll at 320 px on public pages", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile-320");
  for (const path of ["/", "/start", "/guide", "/rules", "/login"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, path).toBe(0);
  }
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
    expect([200, 307], href).toContain(
      (await request.get(href, { maxRedirects: 0 })).status(),
    );
  }
});
