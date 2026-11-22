import type { Metadata } from "next";
import { MapView } from "@/components/map/map-view";
import { requireFlag } from "@/lib/flags";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Карта" };

// The map opens full screen over the site, like the map screen of the AtlasMap mod it copies;
// its toolbar has a button back to the site, and the author credit is in its settings.
export default async function Page() {
  await requireFlag("ff_p1c_atlas");
  return (
    <>
      <h1 className="sr-only">Карта</h1>
      <MapView />
    </>
  );
}
