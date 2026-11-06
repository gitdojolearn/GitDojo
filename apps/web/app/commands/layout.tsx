import { type ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { CommandSidebar } from "@/features/commands/components/CommandSidebar";
import { loadCommandReference } from "@/features/commands/services/reference";

/** The command reference: the list of commands beside whichever page is open. */
export default async function CommandsLayout({ children }: { children: ReactNode }) {
  const commands = await loadCommandReference();
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-[1280px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-14">
        <aside>
          <CommandSidebar
            commands={commands.map(({ name, summary, info }) => ({
              name,
              summary,
              category: info.category,
            }))}
          />
        </aside>
        <main className="max-w-3xl min-w-0">{children}</main>
      </div>
      <SiteFooter />
    </>
  );
}
