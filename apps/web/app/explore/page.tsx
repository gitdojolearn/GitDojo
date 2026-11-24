import { type Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { ExploreWorkspace } from "@/features/explore/components/ExploreWorkspace";

export const metadata: Metadata = {
  title: "Explore your repository",
  description:
    "Open a Git repository from your computer and see its branches, a timeline of what was done in it, and every commit explained. Read in your browser, never uploaded.",
};

export default function ExplorePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
        <ExploreWorkspace />
      </main>
    </>
  );
}
