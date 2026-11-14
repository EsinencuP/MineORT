import { EmptyState } from "@/components/ui/states";

/** Temporary page body for sections whose epics are not built yet. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <EmptyState
        title="Раздел в разработке"
        description="Содержимое появится в следующих блоках плана."
      />
    </div>
  );
}
