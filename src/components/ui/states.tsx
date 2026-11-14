import type { ReactNode } from "react";

/** Templates for the three screen states: loading / empty / error (US-E01-02). */
export function LoadingState({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 py-8">
      <span className="sr-only">{label}</span>
      <div className="bg-line h-6 w-2/3 animate-pulse rounded" />
      <div className="bg-line h-4 w-full animate-pulse rounded" />
      <div className="bg-line h-4 w-5/6 animate-pulse rounded" />
    </div>
  );
}

function Message({
  title,
  description,
  action,
  role,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  role?: "alert";
}) {
  return (
    <div
      role={role}
      className="border-line flex flex-col items-start gap-2 rounded-(--radius-card) border border-dashed p-6"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <Message {...props} />;
}

export function ErrorState(props: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Message
      role="alert"
      title={props.title ?? "Что-то пошло не так"}
      description={props.description}
      action={props.action}
    />
  );
}
