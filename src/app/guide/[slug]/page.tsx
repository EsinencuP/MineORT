import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { categoryTitle, getPublishedBySlug } from "@/lib/guides/store";
import { safeBack } from "@/lib/nav/back";

// The metadata and the page need the same article: read it once per request.
const loadArticle = cache(getPublishedBySlug);

export async function generateMetadata({
  params,
}: PageProps<"/guide/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  return { title: article ? article.title : "Статья не найдена" };
}

export default async function GuideArticlePage({
  params,
  searchParams,
}: PageProps<"/guide/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const article = await loadArticle(slug);
  if (!article) notFound(); // unknown or unpublished slug: a real 404
  const searchBack = safeBack(sp.back, ["/guide"]);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8">
      <Breadcrumbs
        items={[
          { label: "Как играть", href: "/guide" },
          { label: categoryTitle(article.category) },
          { label: article.title },
        ]}
        back={
          searchBack
            ? { href: searchBack, label: "← К результатам поиска" }
            : undefined
        }
      />
      <h1 className="mt-2 mb-2 text-2xl font-bold">{article.title}</h1>
      {article.verified_at && (
        <p className="text-ink-muted mb-6 text-sm">
          Проверено: {new Date(article.verified_at).toLocaleDateString("ru-RU")}
        </p>
      )}
      {/* Plain text on purpose: no HTML from the database is ever rendered. */}
      <div className="whitespace-pre-wrap">{article.body}</div>
    </article>
  );
}
