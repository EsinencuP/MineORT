import { SectionNav } from "@/components/portal/portal-nav";

// One section bar for every page of this section, so neighbouring sections are always one click away.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionNav />
      {children}
    </>
  );
}
