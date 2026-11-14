import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { requireFlag } from "@/lib/flags";

export default async function Page() {
  await requireFlag("ff_p1c_requests");
  return <PlaceholderPage title="Заказы и помощь" />;
}
