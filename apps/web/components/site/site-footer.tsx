import { GitFork } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/site/logo";
import { SITE } from "@/lib/site";

const FOOTER: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] =
  [
    {
      heading: "Learn",
      links: [
        { label: "Courses", href: "/learn" },
        { label: "Five-minute lesson", href: "/learn/demo" },
        { label: "Challenges", href: "/challenges" },
        { label: "Practice", href: "/practice" },
        { label: "Playground", href: "/playground" },
      ],
    },
    {
      heading: "Certificates",
      links: [
        { label: "Certification track", href: "/certification" },
        { label: "Git capstone", href: "/assessment" },
        { label: "Your dashboard", href: "/dashboard" },
      ],
    },
    {
      heading: "Project",
      links: [
        { label: "What's new", href: "/whats-new" },
        { label: "Documentation", href: SITE.docsUrl, external: true },
        { label: "GitHub", href: SITE.githubUrl, external: true },
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
      ],
    },
  ];

export function SiteFooter() {
  return (
    <footer className="border-t border-border-subtle">
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 sm:grid-cols-3 sm:px-6 md:grid-cols-[2fr_repeat(3,1fr)]">
        <div className="col-span-2 sm:col-span-3 md:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-small text-fg-muted">{SITE.tagline}</p>
          <p className="mt-3 flex items-center gap-1.5 text-caption text-fg-muted">
            <GitFork className="size-3.5" aria-hidden="true" /> Open source, MIT licensed
          </p>
        </div>
        {FOOTER.map((group) => (
          <nav key={group.heading} aria-label={group.heading}>
            <h2 className="text-small font-semibold text-fg">{group.heading}</h2>
            <ul className="mt-3 space-y-2 text-small">
              {group.links.map((link) => (
                <li key={link.label}>
                  {link.external ? (
                    <a href={link.href} className="text-fg-muted hover:text-fg hover:underline">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-fg-muted hover:text-fg hover:underline">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
