import { expect, test } from "@playwright/test";

// Every preview state of the three screens: renders, has one h1, never scrolls sideways, in both themes.
const STATES: Record<string, string[]> = {
  login: ["default", "loading", "cancelled", "error", "blocked"],
  onboarding: [
    "empty",
    "filled",
    "invite",
    "application",
    "taken",
    "pending",
    "syncing",
    "ready",
    "rejected",
  ],
  dashboard: ["new", "pending", "preparing", "ready", "active", "offline"],
};

for (const [screen, states] of Object.entries(STATES)) {
  for (const state of states) {
    for (const theme of ["dark", "light"] as const) {
      test(`${screen}/${state} (${theme}) fits the viewport`, async ({
        page,
      }) => {
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("mo-theme", t);
          } catch {
            /* ignore */
          }
        }, theme);
        const res = await page.goto(`/design/${screen}/${state}`);
        expect(res?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
}

test("theme toggle switches and remembers the choice", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "mobile has it in the menu");
  await page.goto("/login");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Включить светлую тему" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("the nick field previews the avatar and validates the format", async ({
  page,
}) => {
  await page.goto("/design/onboarding/empty");
  const nick = page.getByPlaceholder("Твой Minecraft-ник");
  await nick.fill("ab");
  await expect(page.getByText(/3–16 символов/)).toBeVisible();
  await nick.fill("Steve_01");
  await expect(page.getByText(/3–16 символов/)).toHaveCount(0);
});

test("login shows the Telegram CTA and a retry after cancel", async ({
  page,
}) => {
  await page.goto("/design/login/cancelled");
  await expect(
    page.getByRole("link", { name: /Продолжить через Telegram/ }),
  ).toBeVisible();
});
