import { expect, test } from "@playwright/test";

test.skip(
  process.env.FF_COMMUNITY_EVENTS !== "true",
  "community modules are off",
);

test("the calendar fits and guest-only boundaries hold", async ({
  page,
  request,
}) => {
  expect((await page.goto("/social/calendar"))?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "События", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Вид календаря" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect((await request.get("/api/calendar/event/invalid")).status()).toBe(404);
  expect(
    (await request.get("/api/calendar/subscription/invalid")).status(),
  ).toBe(404);
  expect(
    (
      await request.get("/dashboard/notifications", { maxRedirects: 0 })
    ).status(),
  ).toBe(307);
  expect(
    (await request.get("/dashboard/messages", { maxRedirects: 0 })).status(),
  ).toBe(307);
  expect(
    (await request.get("/dashboard/progress", { maxRedirects: 0 })).status(),
  ).toBe(307);
  expect(
    (await request.post("/api/telegram/webhook", { data: {} })).status(),
  ).toBe(404);
});
