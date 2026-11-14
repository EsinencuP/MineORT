import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveArticleAction } from "@/app/actions/guides";
import { CATEGORIES, getByIdForAdmin } from "@/lib/guides/store";
import { requireStaff } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Статья Гайдбука" };

const ERRORS: Record<string, string> = {
  bad_input:
    "Проверьте поля: адрес из латиницы, цифр и дефисов, категория, заголовок, дата.",
  slug_taken: "Статья с таким адресом уже есть.",
};

export default async function EditGuidePage({
  params,
  searchParams,
}: PageProps<"/admin/guides/[id]">) {
  await requireStaff(["admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const isNew = id === "new";
  const article = isNew
    ? null
    : /^[0-9a-f-]{36}$/i.test(id)
      ? await getByIdForAdmin(id)
      : null;
  if (!isNew && !article) notFound();
  const error = typeof sp.error === "string" ? sp.error : null;

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">
        {isNew ? "Новая статья" : "Редактирование статьи"}
      </h1>
      {error && (
        <p role="alert" className="mb-4">
          <StatusBadge tone="danger">
            {ERRORS[error] ?? "Не удалось сохранить."}
          </StatusBadge>
        </p>
      )}
      <Card>
        <form action={saveArticleAction} className="flex flex-col gap-4">
          {article && <input type="hidden" name="id" value={article.id} />}
          <Field
            name="title"
            label="Заголовок"
            defaultValue={article?.title}
            required
          />
          <Field
            name="slug"
            label="Адрес (slug)"
            hint="Латиница, цифры и дефисы, например install-client"
            defaultValue={article?.slug}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="font-medium">
              Категория
            </label>
            <select
              id="category"
              name="category"
              defaultValue={article?.category ?? "install"}
              className="border-line bg-paper text-ink min-h-11 rounded-lg border px-3"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <Field
            name="summary"
            label="Краткое описание"
            defaultValue={article?.summary}
          />
          <Field
            name="tags"
            label="Теги через запятую"
            defaultValue={article?.tags.join(", ")}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="body" className="font-medium">
              Текст
            </label>
            <textarea
              id="body"
              name="body"
              rows={16}
              defaultValue={article?.body}
              className="border-line bg-paper text-ink rounded-lg border px-3 py-2"
            />
          </div>
          <Field
            name="verified_at"
            label="Дата проверки"
            type="date"
            defaultValue={article?.verified_at ?? ""}
          />
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              name="published"
              defaultChecked={article?.published ?? false}
              className="size-5"
            />
            Опубликовать
          </label>
          <Button type="submit" className="self-start">
            Сохранить
          </Button>
        </form>
      </Card>
    </>
  );
}
