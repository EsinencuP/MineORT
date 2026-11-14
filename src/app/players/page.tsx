import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { requireFlag } from "@/lib/flags";

export default async function Page() {
  await requireFlag("ff_p1a");
  return <PlaceholderPage title="Игроки" />;
}
