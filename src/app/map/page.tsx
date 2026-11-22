import type { Metadata } from "next";
import { MapView } from "@/components/map/map-view";
import { requireFlag } from "@/lib/flags";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Карта" };

export default async function Page() {
  await requireFlag("ff_p1c_atlas");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Карта</h1>
      <MapView />
    </div>
  );
}
