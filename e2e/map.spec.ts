import { expect, test } from "@playwright/test";
import type { MapMarker } from "../src/components/map/render/markers";
import type { TrailPoint } from "../src/lib/map/trail-geometry";

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

  test("recenters on the dimension midpoint after panning", async ({
    page,
  }) => {
    test.skip(process.env.E2E_MAP_FIXTURE !== "1", "uses a fixed world extent");
    const viewports: URLSearchParams[] = [];
    await page.route("**/api/map/regions?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      if (params.has("minX")) viewports.push(params);
      return route.fulfill({
        json: {
          regions: [],
          anchor: params.has("anchor") ? { rx: 12, rz: -5 } : null,
        },
      });
    });
    const lastRegion = () => {
      const last = viewports.at(-1);
      return last ? [last.get("minX"), last.get("minZ")] : null;
    };
    await page.goto("/map");
    await expect.poll(lastRegion).toEqual(["12", "-5"]);

    const canvas = page.getByRole("img", { name: /Карта мира/ });
    await canvas.evaluate((el) => {
      for (let i = 0; i < 80; i++)
        el.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
        );
    });
    await expect.poll(lastRegion).not.toEqual(["12", "-5"]);

    await page.getByRole("button", { name: "К середине карты" }).click();
    await expect.poll(lastRegion).toEqual(["12", "-5"]);
  });

  test("the place marker control opens the editor at the chosen point", async ({
    page,
  }, info) => {
    test.skip(process.env.E2E_MAP_FIXTURE !== "1", "uses a member fixture");
    await page.route("**/api/map/markers?*", (route) =>
      route.fulfill({
        json: {
          markers: [],
          me: {
            signedIn: true,
            canCreate: true,
            canLabel: false,
            canModerate: false,
            inGuild: false,
          },
        },
      }),
    );
    await page.goto("/map");
    const place = page.getByRole("button", { name: "Поставить метку" });
    await place.click();
    const canvas = page.getByRole("img", { name: /Карта мира/ });
    if (info.project.use.hasTouch) await canvas.tap();
    else await canvas.click();
    await expect(
      page.getByRole("dialog", { name: "Новая метка" }),
    ).toBeVisible();
    await expect(place).toHaveAttribute("aria-pressed", "false");
  });

  for (const finish of ["first vertex", "button"] as const) {
    test(`an area marker can be closed using the ${finish} and reloaded`, async ({
      page,
    }, info) => {
      test.skip(process.env.E2E_MAP_FIXTURE !== "1", "uses a staff fixture");
      let saved: MapMarker | undefined;
      await page.route("**/api/map/markers?*", (route) =>
        route.fulfill({
          json: {
            markers: saved ? [saved] : [],
            me: {
              signedIn: true,
              canCreate: true,
              canLabel: true,
              canModerate: true,
              inGuild: false,
            },
          },
        }),
      );
      await page.route("**/api/map/markers", async (route) => {
        saved = {
          ...route.request().postDataJSON(),
          id: "18cb7548-4f73-4411-b791-99d9f26240dc",
          status: "approved",
          author: "Staff",
          mine: true,
          canEdit: true,
          canDelete: true,
          createdAt: new Date().toISOString(),
        };
        await route.fulfill({ json: { marker: saved } });
      });
      const name = "Область на карте";
      await page.addInitScript((name) => {
        const { fillRect, strokeText } = CanvasRenderingContext2D.prototype;
        CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
          if (
            x === 0 &&
            y === 0 &&
            w === this.canvas.clientWidth &&
            h === this.canvas.clientHeight
          )
            delete this.canvas.dataset.labelStroke;
          fillRect.call(this, x, y, w, h);
        };
        CanvasRenderingContext2D.prototype.strokeText = function (
          text,
          x,
          y,
          maxWidth,
        ) {
          if (text === name)
            this.canvas.dataset.labelStroke = JSON.stringify([
              this.font,
              this.strokeStyle,
              this.lineWidth,
              x,
              y,
            ]);
          strokeText.call(this, text, x, y, maxWidth);
        };
      }, name);
      await page.goto("/map");
      const canvas = page.getByRole("img", { name: /Карта мира/ });
      const box = (await canvas.boundingBox())!;
      const start = { x: box.width / 2 - 45, y: box.height / 2 - 65 };
      const addVertex = (position: { x: number; y: number }) =>
        info.project.use.hasTouch
          ? canvas.tap({ position })
          : canvas.click({ position });

      await page.getByRole("button", { name: "Поставить метку" }).click();
      await addVertex(start);
      const editor = page.getByRole("dialog", { name: "Новая метка" });
      await editor.getByLabel("Название").fill(name);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await editor.getByRole("button", { name: /Ориентир/ }).click();
      await expect(canvas).toHaveAttribute("data-label-stroke", /./);
      const labelStroke = (await canvas.getAttribute("data-label-stroke"))!;
      await editor.getByRole("button", { name: "Обвести область" }).click();

      await addVertex(start);
      await addVertex({ x: start.x + 90, y: start.y });
      await addVertex({ x: start.x + 45, y: start.y + 70 });
      if (finish === "first vertex") await addVertex(start);
      else await page.getByRole("button", { name: "Замкнуть контур" }).click();

      await expect(
        page.getByRole("region", { name: "Контур области" }),
      ).toBeHidden();
      await expect(
        editor.getByRole("button", { name: "Изменить область" }),
      ).toBeVisible();
      await canvas.evaluate(() => new Promise(requestAnimationFrame));
      await expect(canvas).toHaveAttribute("data-label-stroke", labelStroke);
      await editor.getByRole("button", { name: "Сохранить" }).click();
      await expect(
        page.getByRole("dialog", { name: `Метка: ${name}` }),
      ).toBeVisible();
      expect(saved).toMatchObject({ kind: "label", name });
      expect(saved?.boundary).toHaveLength(3);
      expect(new Set(saved?.boundary?.map(String)).size).toBe(3);

      await page.reload();
      const label = page.getByRole("button", { name, exact: true });
      await expect(label).toBeVisible();
      const labelBox = (await label.boundingBox())!;
      if (info.project.use.hasTouch) await label.tap();
      else await label.click();
      const card = page.getByRole("dialog", { name: `Метка: ${name}` });
      await card.getByRole("button", { name: "Настроить" }).click();
      const settings = page.getByRole("dialog", { name: "Настройка метки" });
      await expect(
        settings.getByRole("button", { name: "Изменить область" }),
      ).toBeVisible();
      await settings.getByTitle("Отмена", { exact: true }).click();
      await page.getByRole("button", { name: "Поставить метку" }).click();
      await addVertex({ x: start.x + 60, y: start.y - 45 });
      await editor.getByRole("button", { name: /Иконка:/ }).click();
      const picker = page.getByRole("dialog", { name: /Выберите иконку/ });
      await expect(picker).toBeVisible();
      expect(
        await picker.evaluate(
          (el, { x, y, width, height }) =>
            el.contains(
              document.elementFromPoint(x + width / 2, y + height / 2),
            ),
          labelBox,
        ),
      ).toBe(true);
      await picker.getByRole("button", { name: "Шахта", exact: true }).click();
      await expect(
        editor.getByRole("button", { name: "Иконка: Шахта" }),
      ).toBeVisible();
    });
  }

  test("player trails refresh and draw separated segments", async ({
    page,
  }, info) => {
    test.skip(process.env.E2E_MAP_FIXTURE !== "1", "uses a member fixture");
    await page.route("**/api/map/markers?*", (route) =>
      route.fulfill({
        json: {
          markers: [],
          me: {
            signedIn: true,
            canCreate: true,
            canLabel: false,
            canModerate: false,
            inGuild: false,
          },
        },
      }),
    );
    await page.addInitScript(() => {
      const segments = new WeakMap<Path2D, number>();
      const moveTo = Path2D.prototype.moveTo;
      Path2D.prototype.moveTo = function (x, y) {
        segments.set(this, (segments.get(this) ?? 0) + 1);
        moveTo.call(this, x, y);
      };
      const stroke = CanvasRenderingContext2D.prototype.stroke;
      CanvasRenderingContext2D.prototype.stroke = function (path?: Path2D) {
        if (path) {
          const count = segments.get(path);
          if (count !== undefined)
            this.canvas.dataset.trailSegments = String(count);
          stroke.call(this, path);
        } else {
          Reflect.apply(stroke, this, []);
        }
      };
    });
    let segments: TrailPoint[][] = [
      [
        [235, 256],
        [246, 240],
        [256, 256],
      ],
      [
        [367, 256],
        [379, 267],
      ],
    ];
    await page.route("**/api/map/trails?*", (route) =>
      route.fulfill({
        json: {
          nickname: "Walker",
          ownLatestAt: null,
          trails: segments.map((points) => ({ mine: false, points })),
        },
      }),
    );
    await page.clock.install();
    await page.goto("/map");
    const canvas = page.getByRole("img", { name: /Карта мира/ });
    await expect(canvas).toHaveAttribute("data-trail-segments", "2");
    const toolbar = page.getByRole("toolbar", { name: "Инструменты карты" });
    await expect(
      toolbar.getByRole("button", { name: "Поставить метку" }),
    ).toBeVisible();
    await expect(
      toolbar.getByRole("button", {
        name: /Нарисовать маршрут|Сохранить путь/,
      }),
    ).toHaveCount(0);
    if (info.project.use.hasTouch) await canvas.tap();
    else await canvas.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    segments = [segments[0]];
    await page.clock.fastForward(15_050);
    await expect(canvas).toHaveAttribute("data-trail-segments", "1");
  });

  test("opens marker screenshots and navigates them from the card", async ({
    page,
  }) => {
    test.skip(process.env.E2E_MAP_FIXTURE !== "1", "uses a marker fixture");
    const marker = {
      id: "d04f8466-afda-42c3-90df-ddfce632c8fd",
      kind: "point",
      dim: "overworld",
      x: 256,
      z: 256,
      name: "Метка со скриншотами",
      description: "",
      icon: "pin",
      color: null,
      visibility: "public",
      status: "approved",
      author: "Player",
      mine: false,
      canEdit: false,
      canDelete: false,
      createdAt: "2026-11-25T10:00:00.000Z",
    } satisfies MapMarker;
    const screenshots = [
      "688eda42-6647-481f-a5cf-8fd2ba291e3b",
      "5846c1fc-3498-4214-bebc-cd77af505f38",
    ];
    await page.route("**/api/map/markers?*", (route) =>
      route.fulfill({
        json: {
          markers: [marker],
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
    await page.route(`**/api/map/markers/${marker.id}/media`, (route) =>
      route.fulfill({ json: { screenshots } }),
    );
    await page.route(`**/api/map/markers/${marker.id}/media/*`, (route) =>
      route.fulfill({ path: "public/brand/logo.webp" }),
    );
    await page.goto("/map");
    await page.getByRole("button", { name: /Список меток/ }).click();
    await page
      .getByRole("region", { name: "Список меток" })
      .getByRole("button", { name: new RegExp(marker.name) })
      .click();
    const card = page.getByRole("dialog", { name: `Метка: ${marker.name}` });
    await card.getByRole("button", { name: "Открыть скриншот 1" }).click();
    const viewer = page.getByRole("dialog", {
      name: "Просмотр скриншотов метки",
    });
    await expect(
      viewer.getByRole("img", { name: "Скриншот 1 из 2" }),
    ).toBeVisible();
    await page.keyboard.press("ArrowRight");
    const second = viewer.getByRole("img", { name: "Скриншот 2 из 2" });
    await expect(second).toHaveAttribute(
      "src",
      new RegExp(screenshots[1] + "$"),
    );
    await viewer.getByRole("button", { name: "Закрыть просмотр" }).click();
    await expect(viewer).toBeHidden();
    await expect(card).toBeVisible();
  });

  test("the marker API refuses to save paths and routes", async ({
    request,
  }) => {
    for (const variant of [
      { kind: "path" },
      {
        kind: "route",
        routePoints: [
          [0, 0],
          [10, 10],
        ],
      },
    ]) {
      const response = await request.post("/api/map/markers", {
        data: {
          dim: "overworld",
          x: 0,
          z: 0,
          name: "Path",
          icon: "pin",
          visibility: "private",
          ...variant,
        },
      });
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({ error: "marker_invalid" });
    }
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
