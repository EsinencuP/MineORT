import { savePrivacyAction } from "@/app/actions/guilds";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";

/** What the public profile shows (private by default, opt-in to more; OD-29). */
export function PrivacyForm({
  value,
}: {
  value: {
    showFirstJoin: boolean;
    showGuild: boolean;
    showStats: boolean;
    bio: string;
    mapVisibility: "all" | "guild";
  };
}) {
  const box = "size-5 shrink-0 accent-[color:var(--brand-600)]";
  return (
    <Card className="mt-4">
      <form action={savePrivacyAction} className="flex flex-col gap-3">
        <input type="hidden" name="return_to" value="/dashboard#privacy" />
        <h3 id="privacy" className="font-pixel text-xl">
          Что видно в профиле
        </h3>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="show_first_join"
            defaultChecked={value.showFirstJoin}
            className={box}
          />
          Показывать, с какого времени я в сообществе
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="show_guild"
            defaultChecked={value.showGuild}
            className={box}
          />
          Показывать мою гильдию и ранг
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="show_stats"
            defaultChecked={value.showStats}
            className={box}
          />
          Показывать статистику, когда она появится
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="map_visibility" className="text-sm font-medium">
            Кто видит меня на карте
          </label>
          <select
            id="map_visibility"
            name="map_visibility"
            defaultValue={value.mapVisibility}
            className="bg-paper text-ink border-line min-h-11 rounded-xl border px-3 text-sm"
          >
            <option value="all">Все участники сообщества</option>
            <option value="guild">Только моя гильдия</option>
          </select>
          <p className="text-ink-muted text-xs">
            Скрыться совсем нельзя: администрация всегда видит игроков на карте.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bio" className="text-sm font-medium">
            О себе (до 300 символов)
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={3}
            maxLength={300}
            defaultValue={value.bio}
            className="bg-paper text-ink border-line rounded-xl border px-3 py-2 text-sm"
          />
        </div>
        <PendingButton className="self-start" pendingText="Сохраняем…">
          Сохранить
        </PendingButton>
      </form>
    </Card>
  );
}
