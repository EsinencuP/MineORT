"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function FeedMore({ href }: { href: string }) {
  const router = useRouter();
  const element = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      router.replace(href, { scroll: false });
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [href, router]);
  return (
    <Link
      href={href}
      ref={element}
      scroll={false}
      className="text-brand-700 inline-flex min-h-11 items-center text-sm underline"
    >
      Загрузить ещё
    </Link>
  );
}
