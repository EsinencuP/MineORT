import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  reportSmsAction,
  sendSmsAction,
  setSmsContactAction,
  setSmsModeAction,
} from "@/app/actions/sms";
import { LocalTime } from "@/components/social/local-time";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { listSms, smsEnabled } from "@/lib/community/sms";
import { isConfirmedPlayer } from "@/lib/community/player";
import { authorsOf } from "@/lib/social/store";
import { getViewer } from "@/lib/social/viewer";
import { db } from "@/lib/supabase-admin";

const BACK = "/dashboard/messages";
const INPUT =
  "border-line bg-paper min-h-11 min-w-0 rounded-xl border px-3 text-sm";
export const metadata = { title: "Личные сообщения" };

export default async function MessagesPage({
  searchParams,
}: PageProps<"/dashboard/messages">) {
  if (!smsEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  if (!viewer.canPublish) notFound();
  if (!(await isConfirmedPlayer(viewer.userId))) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
        <Link href="/dashboard" className="text-brand-700 text-sm underline">
          ← Мой MineOrt
        </Link>
        <h1 className="text-3xl">Личные сообщения</h1>
        <Card>
          Войдите на игровой сервер с привязанным Minecraft-ником, чтобы открыть
          личные сообщения.
        </Card>
      </div>
    );
  }
  const feedback = await searchParams;
  const nick =
    typeof feedback.with === "string" && /^[\w]{3,16}$/.test(feedback.with)
      ? feedback.with
      : undefined;
  const [messages, prefs, contacts] = await Promise.all([
    listSms(viewer.userId, nick),
    db()
      .from("sms_preferences")
      .select("receive_mode")
      .eq("user_id", viewer.userId)
      .maybeSingle(),
    db()
      .from("sms_contacts")
      .select("contact_id, relation")
      .eq("owner_id", viewer.userId)
      .limit(100),
  ]);
  if (prefs.error || contacts.error)
    throw new Error("sms settings lookup failed");
  const names = await authorsOf(contacts.data.map((row) => row.contact_id));
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/dashboard" className="text-brand-700 text-sm underline">
        ← Мой MineOrt
      </Link>
      <h1 className="text-3xl">Личные сообщения</h1>
      <Notice
        error={feedback.error}
        ok={feedback.ok}
        okTexts={{
          sent: "Сообщение отправлено.",
          saved: "Настройки сохранены.",
          reported: "Жалоба отправлена.",
        }}
      />
      <Card>
        <form
          action={sendSmsAction}
          className="flex flex-col items-start gap-3"
        >
          <input type="hidden" name="operation" value={randomUUID()} />
          <label className="flex w-full flex-col gap-1 text-sm">
            Minecraft-ник получателя
            <input
              name="to"
              defaultValue={nick}
              required
              minLength={3}
              maxLength={16}
              pattern="[A-Za-z0-9_]{3,16}"
              className={INPUT}
            />
          </label>
          <label className="flex w-full flex-col gap-1 text-sm">
            Сообщение
            <textarea
              name="body"
              rows={3}
              required
              maxLength={300}
              className={`${INPUT} w-full py-2`}
            />
          </label>
          <PendingButton>Отправить</PendingButton>
        </form>
      </Card>
      {nick && (
        <Link href={BACK} className="text-brand-700 text-sm underline">
          Все собеседники
        </Link>
      )}
      {!messages.length && (
        <p className="text-ink-muted text-sm">Сообщений пока нет.</p>
      )}
      {messages.map((message) => {
        const incoming = message.recipient_id === viewer.userId;
        const peer = message.peer;
        return (
          <Card
            key={message.id}
            id={`sms-${message.id}`}
            className="flex scroll-mt-24 flex-col gap-2"
          >
            <p className="text-sm">
              {incoming ? "От " : "Для "}
              {peer?.nick ? (
                <Link
                  href={`${BACK}?with=${encodeURIComponent(peer.nick)}`}
                  className="text-brand-700 underline"
                >
                  {peer.name}
                </Link>
              ) : (
                (peer?.name ?? "Игрок")
              )}
              {" · "}
              <LocalTime iso={message.created_at} />
            </p>
            <p className="break-words whitespace-pre-wrap">{message.body}</p>
            {incoming && peer?.nick && (
              <div className="flex flex-wrap gap-2">
                <form action={setSmsContactAction}>
                  <input type="hidden" name="nick" value={peer.nick} />
                  <input type="hidden" name="relation" value="block" />
                  <PendingButton variant="ghost" className="text-sm">
                    Заблокировать
                  </PendingButton>
                </form>
                <details className="min-w-0">
                  <summary className="text-ink-muted min-h-11 cursor-pointer py-2 text-sm">
                    Пожаловаться
                  </summary>
                  <form
                    action={reportSmsAction}
                    className="flex flex-col gap-2"
                  >
                    <input type="hidden" name="message" value={message.id} />
                    <textarea
                      name="reason"
                      aria-label="Причина жалобы"
                      required
                      minLength={3}
                      maxLength={500}
                      className={`${INPUT} w-full py-2`}
                    />
                    <PendingButton variant="ghost">
                      Отправить жалобу
                    </PendingButton>
                  </form>
                </details>
              </div>
            )}
          </Card>
        );
      })}
      <Card className="flex flex-col gap-3">
        <h2 className="font-pixel text-xl">Кто может писать</h2>
        <form action={setSmsModeAction} className="flex flex-wrap gap-2">
          <select
            aria-label="Кто может писать"
            name="mode"
            defaultValue={prefs.data?.receive_mode ?? "limited"}
            className={INPUT}
          >
            <option value="all">Все допущенные игроки</option>
            <option value="limited">Согильдийцы и разрешённые игроки</option>
            <option value="none">Никто</option>
          </select>
          <PendingButton>Сохранить</PendingButton>
        </form>
        <form action={setSmsContactAction} className="flex flex-wrap gap-2">
          <input
            aria-label="Ник игрока"
            name="nick"
            required
            pattern="[A-Za-z0-9_]{3,16}"
            className={INPUT}
          />
          <PendingButton name="relation" value="allow" variant="ghost">
            Разрешить
          </PendingButton>
          <PendingButton name="relation" value="block" variant="ghost">
            Заблокировать
          </PendingButton>
        </form>
        {contacts.data.map((contact) => {
          const name = names.get(contact.contact_id);
          return (
            name?.nick && (
              <form
                key={`${contact.contact_id}:${contact.relation}`}
                action={setSmsContactAction}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-sm">
                  {name.nick} ·{" "}
                  {contact.relation === "allow" ? "разрешён" : "заблокирован"}
                </span>
                <input type="hidden" name="nick" value={name.nick} />
                <input type="hidden" name="relation" value={contact.relation} />
                <PendingButton name="remove" value="1" variant="ghost">
                  Убрать
                </PendingButton>
              </form>
            )
          );
        })}
      </Card>
    </div>
  );
}
