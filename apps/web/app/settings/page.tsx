import { type Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { SettingsPage } from "@/features/settings";

export const metadata: Metadata = {
  title: "Settings",
  description: "Theme, animation speed, terminal and editor preferences.",
};

export default function Settings() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-h2 font-semibold tracking-tight text-fg sm:text-h1">Settings</h1>
        <p className="mt-2 mb-8 text-body text-fg-secondary">
          Changes apply straight away, in every open tab, and are kept in this browser.
        </p>
        <SettingsPage />
      </main>
    </>
  );
}
