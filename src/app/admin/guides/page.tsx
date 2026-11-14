import type { Metadata } from "next";
import Link from "next/link";
import { saveSettingsAction } from "@/app/actions/guides";
import {
  categoryTitle,
  getSettings,
  listAllForAdmin,
} from "@/lib/guides/store";
import { requireStaff } from "@/lib/auth/guards";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Гайдбук" };

export default async function AdminGuidesPage({
  searchParams,
}: PageProps<"/admin/guides">) {
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const [articles, settings] = await Promise.all([
    listAllForAdmin(),
    getSettings(),
  ]);

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Гайдбук и сборка</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{
          saved: "Статья сохранена.",
          settings: "Настройки сохранены.",
        }}
      />

      <section aria-labelledby="settings" className="mb-8">
        <h2 id="settings" className="mb-3 text-xl font-semibold">
          Версии, сборка и адрес сервера
        </h2>
        <Card>
          <form
            action={saveSettingsAction}
            className="grid gap-4 sm:grid-cols-2"
          >
            <Field
              name="minecraft_version"
              label="Версия Minecraft"
              defaultValue={settings.minecraft_version}
            />
            <Field
              name="client_build_version"
              label="Версия сборки"
              defaultValue={settings.client_build_version}
            />
            <Field
              name="client_build_url"
              label="Ссылка на сборку"
              defaultValue={settings.client_build_url}
            />
            <Field
              name="client_build_checksum"
              label="SHA-256 сборки"
              defaultValue={settings.client_build_checksum}
            />
            <Field
              name="server_address"
              label="Адрес сервера"
              hint="Показывается игрокам только после того, как сервер применил их допуск"
              defaultValue={settings.server_address}
            />
            <div className="sm:col-span-2">
              <Button type="submit">Сохранить настройки</Button>
            </div>
          </form>
        </Card>
      </section>

      <section aria-labelledby="articles">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="articles" className="text-xl font-semibold">
            Статьи
          </h2>
          <ButtonLink href="/admin/guides/new">Новая статья</ButtonLink>
        </div>
        <ul className="flex flex-col gap-2">
          {articles.map((a) => (
            <li
              key={a.id}
              className="border-line flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <StatusBadge tone={a.published ? "ok" : "neutral"}>
                {a.published ? "Опубликовано" : "Черновик"}
              </StatusBadge>
              <Link
                href={`/admin/guides/${a.id}`}
                className="text-brand-700 font-medium underline"
              >
                {a.title}
              </Link>
              <span className="text-ink-muted text-sm">
                {categoryTitle(a.category)} · /{a.slug} ·{" "}
                {a.verified_at
                  ? `проверено ${new Date(a.verified_at).toLocaleDateString("ru-RU")}`
                  : "не проверено"}
              </span>
            </li>
          ))}
          {articles.length === 0 && (
            <li className="text-ink-muted">Статей пока нет.</li>
          )}
        </ul>
      </section>
    </>
  );
}
