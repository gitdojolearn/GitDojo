import { type Metadata } from "next";
import { CommandIndex } from "@/features/commands/components/CommandIndex";
import { loadCommandReference } from "@/features/commands/services/reference";

export const metadata: Metadata = {
  title: "Git commands",
  description:
    "Every Git command GitDojo runs: what it does, what it changes, examples and the lessons that teach it.",
};

export default async function CommandsPage() {
  return <CommandIndex commands={await loadCommandReference()} />;
}
