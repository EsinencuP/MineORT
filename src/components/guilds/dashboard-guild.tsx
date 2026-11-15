import Link from "next/link";
import { respondInvitationAction } from "@/app/actions/guilds";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { GuildTag } from "./guild-tag";

type G = { slug: string; name: string; tag: string; color: string };

/** "Моя гильдия" and the invitations waiting for an answer. */
export function DashboardGuild({
  guild,
  invitations,
}: {
  guild: (G & { rankName: string; level: number }) | null;
  invitations: { id: string; expiresAt: string; guild: G }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {guild ? (
        <Card className="flex flex-wrap items-center gap-3">
          <GuildTag tag={guild.tag} color={guild.color} className="text-base" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/guilds/${guild.slug}`}
              className="font-pixel text-lg underline underline-offset-4"
            >
              {guild.name}
            </Link>
            <p className="text-ink-muted text-sm">Ваш ранг: {guild.rankName}</p>
          </div>
          {guild.level <= 5 && (
            <Link
              href={`/guilds/${guild.slug}/manage`}
              className="text-brand-700 text-sm font-semibold underline underline-offset-4"
            >
              Управление
            </Link>
          )}
        </Card>
      ) : (
        invitations.length === 0 && (
          <Card className="text-sm">
            Вы пока не в гильдии.{" "}
            <Link
              href="/players?tab=guilds"
              className="text-brand-700 font-semibold underline underline-offset-4"
            >
              Посмотреть гильдии
            </Link>
          </Card>
        )
      )}
      {invitations.map((i) => (
        <Card key={i.id} className="flex flex-wrap items-center gap-3">
          <GuildTag tag={i.guild.tag} color={i.guild.color} />
          <p className="min-w-0 flex-1 text-sm">
            Вас приглашают в гильдию <strong>{i.guild.name}</strong> · до{" "}
            {new Date(i.expiresAt).toLocaleDateString("ru-RU")}
          </p>
          <form action={respondInvitationAction} className="flex gap-2">
            <input type="hidden" name="invitation_id" value={i.id} />
            <input type="hidden" name="return_to" value="/dashboard" />
            <PendingButton
              className="min-h-11 px-4 text-sm"
              name="decision"
              value="accept"
              pendingText="…"
            >
              Принять
            </PendingButton>
            <PendingButton
              variant="ghost"
              className="min-h-11 px-4 text-sm"
              name="decision"
              value="decline"
              pendingText="…"
            >
              Отклонить
            </PendingButton>
          </form>
        </Card>
      ))}
    </div>
  );
}
