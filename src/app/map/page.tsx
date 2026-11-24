import type { Metadata } from "next";
import { MapView } from "@/components/map/map-view";
import { requireFlag } from "@/lib/flags";
import { safeBack } from "@/lib/nav/back";
import { collectionsEnabled } from "@/lib/map/collections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Карта" };

// The map opens full screen over the site, like the map screen of the AtlasMap mod it copies;
// its toolbar has a button back to the site, and the author credit is in its settings.
export default async function Page({ searchParams }: PageProps<"/map">) {
  await requireFlag("ff_p1c_atlas");
  const params = await searchParams;
  const back = safeBack(params.back, [
    "/social",
    "/dashboard",
    "/map/collections",
  ]);
  const anchor =
    typeof params.post === "string" && /^[0-9a-f-]{36}$/i.test(params.post)
      ? `#post-${params.post}`
      : "";
  return (
    <>
      <h1 className="sr-only">Карта</h1>
      <MapView
        backHref={back ? back + anchor : "/"}
        hasCollections={collectionsEnabled()}
      />
    </>
  );
}
