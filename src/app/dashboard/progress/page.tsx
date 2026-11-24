import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { LocalTime } from "@/components/social/local-time";
import {
  METRICS,
  PERSONAL_ACHIEVEMENTS,
  playerProgress,
  progressEnabled,
  seasonProgress,
} from "@/lib/community/progress";
import { getViewer } from "@/lib/social/viewer";

export const metadata = { title: "Достижения" };
const count = new Intl.NumberFormat("ru");

export default async function ProgressPage() {
  if (!progressEnabled()) notFound();
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");
  const [progress, seasons] = await Promise.all([
    playerProgress(viewer.userId),
    seasonProgress(),
  ]);
  const earned = new Map(
    progress.awards.map((award) => [award.code, award.earned_at]),
  );
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/dashboard" className="text-brand-700 text-sm underline">
        ← Мой MineOrt
      </Link>
      <h1 className="text-3xl">Достижения</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(PERSONAL_ACHIEVEMENTS).map(([code, achievement]) => (
          <Card key={code} className="flex flex-col gap-2">
            <h2 className="font-pixel text-xl">{achievement.title}</h2>
            <p className="text-ink-muted text-sm">{achievement.rule}</p>
            {earned.has(code) ? (
              <div>
                <StatusBadge tone="ok">
                  Получено <LocalTime iso={earned.get(code)!} />
                </StatusBadge>
              </div>
            ) : (
              <div>
                <StatusBadge>В процессе</StatusBadge>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="font-pixel text-xl">Игровая статистика</h2>
        {!progress.metrics.length && (
          <p className="text-ink-muted text-sm">
            Здесь появятся результаты первой игровой сессии.
          </p>
        )}
        <dl className="grid gap-3 sm:grid-cols-2">
          {progress.metrics.map((metric) => (
            <div className="border-line border-b pb-1" key={metric.metric}>
              <dt className="text-ink-muted text-sm break-words">
                {METRICS[metric.metric] ?? metric.metric.split(":").at(-1)}
              </dt>
              <dd className="font-semibold">{count.format(metric.value)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-pixel text-xl">Сезоны</h2>
        {!seasons.length && (
          <p className="text-ink-muted text-sm">
            Первый сезон ещё не объявлен.
          </p>
        )}
        {seasons.map((season) => (
          <section
            key={season.id}
            className="border-line flex flex-col gap-2 border-t pt-3"
          >
            <h3 className="font-semibold">{season.name}</h3>
            <p className="text-ink-muted text-sm">
              {season.startsOn} → {season.endsOn} (UTC, дата окончания не
              включается)
            </p>
            {season.metrics.map((metric) => (
              <div key={metric} className="text-sm">
                <h4 className="font-semibold">{METRICS[metric] ?? metric}</h4>
                <ol className="ml-5 list-decimal">
                  {season.ranks
                    .filter((row) => row.metric === metric)
                    .map((row) => (
                      <li key={row.user_id}>
                        {row.name} · {count.format(row.value)}
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </section>
        ))}
      </Card>
    </div>
  );
}
