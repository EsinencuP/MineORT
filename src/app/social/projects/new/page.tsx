import type { Metadata } from "next";
import Link from "next/link";
import { createProjectAction } from "@/app/actions/projects";
import { NeedsInput } from "@/components/projects/needs-input";
import { ProjectFields } from "@/components/projects/project-fields";
import { PendingButton } from "@/components/social/pending-button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth/guards";
import { requireFlag } from "@/lib/flags";
import { safely } from "@/lib/safe";
import { listMyGallery } from "@/lib/social/gallery";
import { getViewer } from "@/lib/social/viewer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Новый проект" };

export default async function NewProjectPage({
  searchParams,
}: PageProps<"/social/projects/new">) {
  await requireFlag("ff_p1a");
  await requireUser("/social/projects/new");
  const sp = await searchParams;
  const viewer = await getViewer();
  const gallery = viewer.canPublish
    ? await safely("covers", () => listMyGallery(viewer.userId!), [])
    : [];
  const covers = gallery
    .filter((g) => g.visibility === "public" && !g.hidden)
    .map((g) => ({ id: g.id, caption: g.caption }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Breadcrumbs
        items={[
          { label: "Общение", href: "/social" },
          { label: "Проекты", href: "/social/projects" },
          { label: "Новый проект" },
        ]}
      />
      <h1 className="mt-3 text-[clamp(1.9rem,5vw,2.8rem)] leading-tight">
        Новый проект
      </h1>
      <div className="mt-5 flex flex-col gap-4">
        <Notice error={sp.error} />
        {viewer.canPublish ? (
          <Card>
            <form action={createProjectAction} className="flex flex-col gap-4">
              <ProjectFields covers={covers} />
              <NeedsInput />
              <PendingButton className="self-start" pendingText="Создаём…">
                Создать проект
              </PendingButton>
            </form>
          </Card>
        ) : (
          <p className="border-line bg-surface rounded-2xl border p-4 text-sm">
            Проекты создают участники сервера.{" "}
            <Link
              href="/onboarding/minecraft"
              className="text-brand-700 font-semibold underline underline-offset-4"
            >
              Получить допуск
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
