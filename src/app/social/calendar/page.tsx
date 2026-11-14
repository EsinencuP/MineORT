import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { requireFlag } from "@/lib/flags";

export default async function Page() {
  await requireFlag("ff_p1b_social");
  return <PlaceholderPage title="Календарь" />;
}
