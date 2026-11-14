import type { Metadata } from "next";
import { publishRulesAction } from "@/app/actions/admin";
import { currentRules } from "@/lib/access/store";
import { requireStaff } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Правила" };

export default async function AdminRulesPage({
  searchParams,
}: PageProps<"/admin/rules">) {
  await requireStaff(["admin"]);
  const sp = await searchParams;
  const current = await currentRules();
  const next = current
    ? { major: current.version_major, minor: current.version_minor + 1 }
    : { major: 1, minor: 0 };

  return (
    <>
      <h1 className="mb-4 text-2xl font-bold">Правила сервера</h1>
      <Notice
        error={sp.error}
        ok={sp.ok}
        okTexts={{ "1": "Версия опубликована." }}
      />
      <p className="text-ink-muted mb-4">
        Текущая версия:{" "}
        {current
          ? `${current.version_major}.${current.version_minor}`
          : "не опубликована"}
        . Новая мажорная версия (например 2.0) потребует повторного принятия от
        всех игроков.
      </p>
      <Card>
        <form action={publishRulesAction} className="flex flex-col gap-4">
          <div className="flex gap-4">
            <Field
              name="major"
              label="Мажорная"
              type="number"
              min={0}
              defaultValue={next.major}
              required
            />
            <Field
              name="minor"
              label="Минорная"
              type="number"
              min={0}
              defaultValue={next.minor}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rules-body" className="font-medium">
              Текст правил
            </label>
            <textarea
              id="rules-body"
              name="body"
              rows={14}
              required
              defaultValue={current?.body}
              className="border-line bg-paper text-ink rounded-lg border px-3 py-2"
            />
          </div>
          <Button type="submit" className="self-start">
            Опубликовать
          </Button>
        </form>
      </Card>
    </>
  );
}
