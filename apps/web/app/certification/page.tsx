import { Badge } from "@gitdojo/ui";
import { Award, BadgeCheck, BookOpen, Eye, FileCheck, Info, ListChecks, Users } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";
import { type ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { CertificationTrack } from "@/features/certificates/components/CertificationTrack";
import {
  CERTIFICATION_TRACK,
  TRACK_AWARD,
  TRACK_CERTIFICATE_TITLE,
} from "@/lib/certificates/track";
import { loadTrackRequirements } from "@/lib/certificates/track-content";

export const metadata: Metadata = {
  title: "Get certified",
  description: `${CERTIFICATION_TRACK.name}: every requirement for the ${TRACK_CERTIFICATE_TITLE}, your progress, and how the certificate is issued and verified.`,
};

export default async function CertificationPage() {
  const requirements = await loadTrackRequirements();
  const lessons = requirements.filter((item) => item.kind === "lesson").length;
  const practice = requirements.length - lessons;
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6 sm:py-14">
        <header className="max-w-3xl">
          <p className="flex items-center gap-2 text-small font-semibold tracking-wider text-accent uppercase">
            <Award className="size-4" aria-hidden="true" /> {CERTIFICATION_TRACK.name}
          </p>
          <h1 className="mt-3 text-h2 font-bold tracking-tight text-fg sm:text-h1">
            {TRACK_CERTIFICATE_TITLE}
          </h1>
          <p className="mt-3 text-body-lg text-fg-secondary">{CERTIFICATION_TRACK.purpose}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="accent">Completion certificate</Badge>
            <Badge>Issued by {CERTIFICATION_TRACK.issuer}</Badge>
            <Badge>Criteria v{TRACK_AWARD.criteriaVersion}</Badge>
            <span className="text-small text-fg-muted">
              {lessons} lessons and {practice} Practice {practice === 1 ? "task" : "tasks"}
            </span>
          </div>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="min-w-0">
            <CertificationTrack requirements={requirements} />
          </div>

          <aside aria-label="About this certificate" className="space-y-6">
            <AboutSection id="covers" icon={BookOpen} title="What it covers">
              <ul className="list-disc space-y-1 pl-5">
                {CERTIFICATION_TRACK.topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            </AboutSection>

            <AboutSection id="audience" icon={Users} title="Who it's for">
              <p>{CERTIFICATION_TRACK.audience}</p>
              <p className="mt-2">
                <strong className="font-semibold text-fg">Prerequisites:</strong>{" "}
                {CERTIFICATION_TRACK.prerequisites}
              </p>
            </AboutSection>

            <AboutSection id="meaning" icon={Info} title="What the certificate means">
              <p>
                It is a <strong className="font-semibold text-fg">completion certificate</strong>:
                it records that your GitDojo account completed every requirement listed here.
                GitDojo checks your work in the browser as you go, but the completions your account
                reports are not re-graded on the server, so the certificate is not proof of assessed
                Git skill.
              </p>
              <p className="mt-2">
                For a credential graded on the server, take the separate{" "}
                <Link href="/assessment" className="text-accent underline">
                  Git capstone
                </Link>
                .
              </p>
            </AboutSection>

            <AboutSection id="progress-rules" icon={ListChecks} title="How progress counts">
              <p>
                A requirement is complete once its completion is saved to your account. Work done
                while signed out stays in that browser and never counts. Repeating a lesson
                doesn&apos;t count twice.
              </p>
              <p className="mt-2">
                This page, your dashboard and GitDojo&apos;s server all read the same records, so
                when every requirement shows Complete, the certificate can be issued.
              </p>
            </AboutSection>

            <AboutSection id="verify" icon={BadgeCheck} title="Download and verify">
              <p>
                Once issued, download the certificate as a PDF or as a signed Open Badge, and copy
                its verification link. The PDF has the link and a QR code that open your public
                verification page.
              </p>
              <p className="mt-2">
                That page shows the certificate&apos;s title, issuer, issue date, credential ID and
                criteria, and whether it is valid or revoked right now, so anyone can check it
                without an account.
              </p>
            </AboutSection>

            <AboutSection id="privacy" icon={Eye} title="Your name and privacy">
              <p>
                The PDF always shows the certificate name you enter on your account page. Before
                issuing, you choose whether the public verification page and badge show it too. If
                you don&apos;t, they say &ldquo;Name withheld by learner&rdquo;. The choice is fixed
                once issued. Your email address and account ID never appear.
              </p>
              <p className="mt-2">
                For hands-on work, your repository evidence is checked in memory and then discarded.
                GitDojo stores only its SHA-256 digest, the objective results, the server attempt ID
                and when verification succeeded; learner-typed file contents are not retained.
              </p>
            </AboutSection>

            <AboutSection id="criteria" icon={FileCheck} title="Criteria version">
              <p>
                These are version {TRACK_AWARD.criteriaVersion} of the criteria. If they ever
                change, the new requirements become a new version. Certificates already issued keep
                the version they were issued under, and their verification page keeps showing those
                original requirements.
              </p>
            </AboutSection>
          </aside>
        </div>
      </main>
    </>
  );
}

function AboutSection({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: typeof Award;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-xl border border-border-subtle bg-panel p-5 text-small text-fg-secondary"
    >
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-body font-semibold text-fg">
        <Icon className="size-4 text-fg-muted" aria-hidden="true" />
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
