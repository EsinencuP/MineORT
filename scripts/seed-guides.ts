// Idempotent seed of sample Guidebook articles. Usage: npm run seed:guides (needs service key).
// Content is deliberately generic: real articles (at least five) are written by the owner (US-E19-17).
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key)
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
  );
if (process.env.APP_ENV === "production")
  throw new Error("refusing to seed production");

const db = createClient(url, key, { auth: { persistSession: false } });
const today = new Date().toISOString().slice(0, 10);

const articles = [
  {
    slug: "install-client",
    category: "install",
    title: "Как установить сборку",
    summary: "Установка клиента MineOrt шаг за шагом.",
    body: "1. Скачайте сборку на странице «Установка и подключение».\n2. Сверьте контрольную сумму.\n3. Импортируйте сборку в лаунчер.\n4. Запустите игру и дождитесь загрузки.",
    tags: ["установка", "сборка"],
  },
  {
    slug: "connect-to-server",
    category: "install",
    title: "Как подключиться к серверу",
    summary: "Что нужно, чтобы зайти на сервер.",
    body: "Адрес сервера появляется на странице «Установка и подключение» после того, как вы получили допуск и сервер его применил.\nПри первом входе в игре вы получите код, введите его в личном кабинете.",
    tags: ["подключение", "вход"],
  },
  {
    slug: "cannot-log-in",
    category: "troubleshooting",
    title: "Не получается войти",
    summary: "Частые причины и что проверить.",
    body: "Проверьте, что допуск получен и статус «Доступ готов» показан в личном кабинете.\nУбедитесь, что в игре указан тот же ник, что и на сайте.\nЕсли проблема осталась, напишите администрации.",
    tags: ["ошибка", "вход"],
  },
];

for (const a of articles) {
  const { error } = await db.from("guide_articles").upsert(
    {
      ...a,
      published: true,
      verified_at: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slug" },
  );
  if (error) throw error;
  console.log("seeded", a.slug);
}
