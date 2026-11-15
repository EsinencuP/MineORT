import Link from "next/link";
import { MinecraftAvatar } from "@/components/portal/minecraft-avatar";
import type { PublicMember } from "@/lib/guilds/store";
import { withBack } from "@/lib/nav/back";
import { GuildTag } from "./guild-tag";

export function PlayerCard({ p, back }: { p: PublicMember; back?: string }) {
  return (
    <Link
      href={withBack(`/players/${p.nickname}`, back)}
      className="border-line bg-surface hover:bg-brand-50 lift flex items-center gap-3 rounded-2xl border p-3"
    >
      <MinecraftAvatar nick={p.nickname} size={48} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{p.nickname}</span>
        {p.guild_tag && p.guild_color ? (
          <span className="mt-0.5 flex items-center gap-2 text-xs">
            <GuildTag tag={p.guild_tag} color={p.guild_color} />
            <span className="text-ink-muted truncate">{p.rank_name}</span>
          </span>
        ) : (
          <span className="text-ink-muted block text-xs">Без гильдии</span>
        )}
      </span>
    </Link>
  );
}
