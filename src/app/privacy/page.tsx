import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = { title: "Политика конфиденциальности" };

const ITEMS: { title: string; text: string }[] = [
  {
    title: "Аккаунт и привязки",
    text: "Числовой Telegram ID, имя и @username из Telegram, игровой ник, статус допуска. Идентификатором служит Telegram ID, а не @username.",
  },
  {
    title: "Журналы и IP",
    text: "События безопасности (входы, отказы, подозрительные попытки) с IP-адресом хранятся 180 дней. Журнал действий администрации — 1 год.",
  },
  { title: "Согласия", text: "Факт и версия принятых правил сервера." },
  {
    title: "Положение на карте",
    text: "Участники сообщества видят ваше положение в игре в реальном времени. В настройках профиля можно ограничить видимость своей гильдией. Полностью скрыть положение нельзя: оно всегда доступно администраторам и модераторам. Другие участники видят недавние пути с двухминутной задержкой и с учётом тех же настроек. Точки старше семи дней удаляются ежедневной очисткой.",
  },
  {
    title: "Удаление аккаунта",
    text: "Профиль удаляется сразу, привязка Telegram разрывается. Остаётся только хэш Telegram ID (без самого ID): 30 дней при обычном удалении и на срок бана, если аккаунт был заблокирован.",
  },
  {
    title: "Что мы не делаем",
    text: "Не просим пароль от Telegram, не публикуем Telegram ID и IP, не передаём данные рекламным сервисам.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="text-3xl">Политика конфиденциальности</h1>
      <p className="mt-3">
        <StatusBadge tone="warn">
          Черновик: текст утверждает владелец проекта
        </StatusBadge>
      </p>
      <p className="text-ink-muted mt-4">
        Коротко о том, какие данные хранит MineOrt и зачем.
      </p>
      <ul className="mt-6 flex flex-col gap-4">
        {ITEMS.map((i) => (
          <li key={i.title}>
            <Card>
              <h2 className="text-lg">{i.title}</h2>
              <p className="text-ink-muted mt-2 text-sm leading-relaxed">
                {i.text}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
