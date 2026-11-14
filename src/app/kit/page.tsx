import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { KitToastDemo } from "./toast-demo";

export const metadata = { title: "UI kit" };

/** Dev-only showcase of the base components; 404 in production. */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold">UI kit</h1>
      <Card aria-label="Кнопки">
        <div className="flex flex-wrap gap-2">
          <Button>Основная</Button>
          <Button variant="secondary">Вторичная</Button>
          <Button variant="ghost">Текстовая</Button>
          <Button variant="danger">Опасная</Button>
          <Button disabled>Недоступна</Button>
        </div>
      </Card>
      <Card aria-label="Статусы">
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="ok">Допущен</StatusBadge>
          <StatusBadge tone="warn">Заявка на рассмотрении</StatusBadge>
          <StatusBadge tone="danger">Отклонена</StatusBadge>
          <StatusBadge tone="info">Подтвердите вход</StatusBadge>
          <StatusBadge>Гость</StatusBadge>
        </div>
      </Card>
      <Card aria-label="Форма" className="flex flex-col gap-4">
        <Field label="Ник в Minecraft" hint="3–16 символов" />
        <Field label="Код" error="Неверный код" defaultValue="123" />
        <KitToastDemo />
      </Card>
      <LoadingState />
      <EmptyState
        title="Пока пусто"
        description="Здесь появятся записи."
        action={<Button variant="secondary">Обновить</Button>}
      />
      <ErrorState description="Не удалось загрузить данные." />
    </div>
  );
}
