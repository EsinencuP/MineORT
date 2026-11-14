import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { requireFlag } from "@/lib/flags";

export default async function Page() {
  await requireFlag("ff_p1c_atlas");
  return <PlaceholderPage title="Карта" />;
}
