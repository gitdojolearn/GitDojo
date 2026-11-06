import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { CommandDetail } from "@/features/commands/components/CommandDetail";
import { loadCommand, loadCommandReference } from "@/features/commands/services/reference";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await loadCommandReference()).map((command) => ({ name: command.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const command = await loadCommand((await params).name);
  return command
    ? { title: `git ${command.name}`, description: `${command.summary}.` }
    : { title: "Git commands" };
}

export default async function CommandPage({ params }: { params: Promise<{ name: string }> }) {
  const command = await loadCommand((await params).name);
  if (!command) notFound();
  return <CommandDetail command={command} />;
}
