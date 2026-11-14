import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categoryTitle, getPublishedBySlug } from "@/lib/guides/store";

export async function generateMetadata({
  params,
}: PageProps<"/guide/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedBySlug(slug);
  return { title: article ? article.title : "Статья не найдена" };
}

export default async function GuideArticlePage({
  params,
}: PageProps<"/guide/[slug]">) {
  const { slug } = await params;
  const article = await getPublishedBySlug(slug);
  if (!article) notFound(); // unknown or unpublished slug: a real 404

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="mb-2 text-sm">
        <Link href="/guide" className="text-brand-700 underline">
          Как играть
        </Link>{" "}
        / {categoryTitle(article.category)}
      </p>
      <h1 className="mb-2 text-2xl font-bold">{article.title}</h1>
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
