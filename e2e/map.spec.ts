import { expect, test } from "@playwright/test";

// The map as a visitor sees it. Needs FF_P1C=true and FF_P1C_ATLAS=true on the server under
// test; with the flag off the section must not exist at all.
const atlasOn =
  process.env.FF_P1C === "true" && process.env.FF_P1C_ATLAS === "true";

test.describe("map with the atlas flag off", () => {
  test.skip(atlasOn, "flag is on");
  test("the page and the map API answer 404", async ({ page, request }) => {
    expect((await page.goto("/map"))?.status()).toBe(404);
    const api = await request.get("/api/map/regions?dim=overworld");
    expect(api.status()).toBe(404);
    const tile = await request.get("/api/map/tile?dim=overworld&rx=0&rz=0");
    expect(tile.status()).toBe(404);
  });
});

test.describe("map with the atlas flag on", () => {
  test.skip(!atlasOn, "needs FF_P1C=true and FF_P1C_ATLAS=true");

  test.beforeEach(async ({ page }) => {
    if (process.env.E2E_MAP_FIXTURE !== "1") return;
    // The public browser smoke exercises map controls without a Supabase or Paper service.
    await page.route("**/api/map/regions?*", (route) =>
      route.fulfill({
        json: {
          regions: [{ rx: 0, rz: 0, version: 1 }],
          anchor: { rx: 0, rz: 0 },
        },
      }),
    );
    await page.route("**/api/map/tile?*", (route) =>
      route.fulfill({ status: 404 }),
    );
    await page.route("**/api/map/markers?*", (route) =>
      route.fulfill({
        json: {
          markers: [],
          me: {
            signedIn: false,
            canCreate: false,
            canLabel: false,
            canModerate: false,
            inGuild: false,
          },
        },
      }),
    );
  });

  test("a guest sees the map canvas and its controls", async ({ page }) => {
    await page.goto("/map");
    await expect(page.getByRole("heading", { name: "Карта" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Карта мира/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Приблизить" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Отдалить" })).toBeVisible();
    await page.getByRole("button", { name: "Измерения" }).click();
    await expect(
      page.getByRole("button", { name: "Верхний мир" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the page shows no coordinates", async ({ page }) => {
    await page.goto("/map");
    await page.getByRole("img", { name: /Карта мира/ }).hover();
    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toMatch(/\bx\s*[:=]/);
    expect(text).not.toMatch(/\bz\s*[:=]/);
    expect(text).not.toMatch(/\bx\s+-?\d+/); // no "X 235  Z 21" readout for a visitor
    expect(text).not.toMatch(/-?\d{2,}\s*[,;]\s*-?\d{2,}/); // no "120, -45" pairs
  });

  test("zooming and switching the dimension keep the map working", async ({
    page,
  }) => {
    await page.goto("/map");
    const canvas = page.getByRole("img", { name: /Карта мира/ });
    await page.getByRole("button", { name: "Приблизить" }).click();
    await page.getByRole("button", { name: "Отдалить" }).click();
    await canvas.focus();
    await page.keyboard.press("ArrowLeft");
    await page.getByRole("button", { name: "Измерения" }).click();
    await page.getByRole("button", { name: "Незер" }).click();
    await page.getByRole("button", { name: "Измерения" }).click();
    await expect(page.getByRole("button", { name: "Незер" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(canvas).toBeVisible();
  });

  test("a theme can be chosen and is remembered", async ({ page }) => {
    await page.goto("/map");
    await page.getByRole("button", { name: "Настройки" }).click();
    await page.getByRole("button", { name: "Дерево" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Настройки" }).click();
    await expect(page.getByRole("button", { name: "Дерево" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("a line drawn with the editor stays after a reload", async ({
    page,
  }) => {
    await page.goto("/map");
    const canvas = page.getByRole("img", { name: /Карта мира/ });
    await page.getByRole("button", { name: /Редактор/ }).click();
    await page.getByRole("button", { name: "Прямая линия" }).click();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 120,
      box.y + box.height / 2 + 40,
    );
    await page.mouse.up();
    const saved = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("mineort.map.drawings.overworld") ?? "[]",
      ),
    );
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe("line");
    await page.reload();
    expect(
      await page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("mineort.map.drawings.overworld") ?? "[]",
        ),
      ),
    ).toHaveLength(1);
  });

  test("the ruler shows its bar and the close button leads back to the site", async ({
    page,
  }) => {
    await page.goto("/map");
    await page.getByRole("button", { name: /Линейка/ }).click();
    await expect(page.getByText(/ЛКМ — точка/)).toBeVisible();
    await page.getByRole("link", { name: "Закрыть карту" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  });

  test("a guest gets no live players and is offered a sign-in", async ({
    page,
    request,
  }) => {
    expect((await request.get("/api/map/realtime-token")).status()).toBe(401);
    expect((await request.post("/api/map/watch")).status()).toBe(401);
    await page.goto("/map");
    await expect(
      page.getByRole("link", { name: "Войдите, чтобы видеть игроков" }),
    ).toBeVisible();
  });

  test("the map API refuses malformed requests", async ({ request }) => {
    expect((await request.get("/api/map/regions?dim=moon")).status()).toBe(400);
    expect(
      (await request.get("/api/map/tile?dim=moon&rx=0&rz=0")).status(),
    ).toBe(400);
    expect(
      (await request.get("/api/map/tile?dim=overworld&rx=abc&rz=0")).status(),
    ).toBe(400);
  });
});
