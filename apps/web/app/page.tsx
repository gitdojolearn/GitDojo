import { toCourseOutline } from "@gitdojo/lesson-engine";
import { type Metadata } from "next";
import Link from "next/link";
import { HeroDemo } from "@/components/landing/hero-demo";
import { ReplayIntro } from "@/components/landing/replay-intro";
import {
  BreakSection,
  CertificationSection,
  CoursesSection,
  FinalCta,
  HowItWorks,
  OpenSourceSection,
  VisualizeSection,
} from "@/components/landing/sections";
import { Splash } from "@/components/landing/splash";
import { StartLearningLink } from "@/components/landing/start-learning";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { awardRequirements } from "@/lib/certificates/awards";
import { CERTIFICATION_TRACK, TRACK_AWARD } from "@/lib/certificates/track";
import {
  loadChallengeSummaries,
  loadPlaygroundScenarios,
  loadPracticeSummaries,
} from "@/lib/content";
import { loadAllCourses } from "@/lib/lessons";
import { SITE } from "@/lib/site";
import { Button } from "@gitdojo/ui";
import { GitFork, RotateCcw, ShieldCheck, SquareTerminal, UserRoundX } from "lucide-react";
import { type CSSProperties } from "react";

const DESCRIPTION =
  "Learn Git by typing real commands in a safe browser sandbox: short hands-on courses, challenges, Practice tasks and a playground, plus a completion certificate you can share.";

const TRUST = [
  { icon: GitFork, label: "Open source" },
  { icon: ShieldCheck, label: "Runs safely in your browser" },
  { icon: UserRoundX, label: "No account needed to learn" },
];

export const metadata: Metadata = {
  description: DESCRIPTION,
  openGraph: { title: `${SITE.name} - ${SITE.tagline}`, description: DESCRIPTION, type: "website" },
  // Only with a configured site origin: a canonical pointing at localhost would be worse than none.
  ...(process.env.NEXT_PUBLIC_SITE_URL?.trim() ? { alternates: { canonical: "/" } } : {}),
};

export default async function HomePage() {
  // All read from the content at build time, so the page never describes lessons that don't exist.
  const [courses, challenges, practice, scenarios] = await Promise.all([
    loadAllCourses().then((loaded) => loaded.map(toCourseOutline)),
    loadChallengeSummaries(),
    loadPracticeSummaries(),
    loadPlaygroundScenarios(),
  ]);
  const first = courses[0];
  const firstLesson = first?.lessons[0];
  const firstLessonHref =
    first && firstLesson ? `/learn/${first.slug}/${firstLesson.slug}` : "/learn";
  const requirements = awardRequirements(CERTIFICATION_TRACK.awardKey);

  return (
    <>
      {/* First in the document, so its Skip button is the first thing Tab reaches. */}
      <Splash />
      <SiteHeader action={<StartLearningLink firstLessonHref={firstLessonHref} size="sm" />} />
      <main>
        <section aria-labelledby="hero-heading" className="relative overflow-hidden">
          {/* Subtle radial glow behind the hero. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-140 bg-[radial-gradient(ellipse_at_center,var(--accent-glow),transparent_65%)]"
          />
          <div className="relative mx-auto grid max-w-[1280px] gap-12 px-4 pt-14 pb-16 sm:px-6 sm:pt-24 sm:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
            <div className="gd-hero-reveal" style={{ "--reveal-i": 0 } as CSSProperties}>
              {/* Focusable from script only: focus lands here when the intro is skipped. */}
              <h1
                id="hero-heading"
                tabIndex={-1}
                className="text-h1 font-bold tracking-[-0.03em] text-fg outline-none sm:text-display"
              >
                Learn Git <span className="text-accent">by doing.</span>
              </h1>
              <p className="mt-5 max-w-xl text-body-lg text-pretty text-fg-secondary">
                Type real Git commands, watch what each one changes, and learn how to recover when
                things go wrong. Short guided lessons first, then challenges without the
                hand-holding.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <StartLearningLink firstLessonHref={firstLessonHref} testId="hero-start" />
                <Button asChild variant="secondary" size="hero">
                  <Link href="/playground" data-testid="hero-playground">
                    <SquareTerminal aria-hidden="true" /> Open playground
                  </Link>
                </Button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-small text-fg-muted">
                {TRUST.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <Icon className="size-4 text-fg-faint" aria-hidden="true" />
                    {label}
                  </li>
                ))}
                <li>
                  <ReplayIntro>
                    <RotateCcw aria-hidden="true" /> Replay intro
                  </ReplayIntro>
                </li>
              </ul>
            </div>
            <div className="gd-hero-reveal min-w-0" style={{ "--reveal-i": 1 } as CSSProperties}>
              <HeroDemo />
            </div>
          </div>
        </section>
        <HowItWorks />
        <CoursesSection
          courses={courses.map((course) => ({
            slug: course.slug,
            title: course.title,
            description: course.description,
            lessons: course.lessons.length,
          }))}
        />
        <VisualizeSection />
        <BreakSection
          challenges={challenges.filter((item) => item.missingCommands.length === 0).length}
          practiceTasks={practice.filter((item) => item.missingCommands.length === 0).length}
          scenarios={scenarios.map((scenario) => scenario.title)}
        />
        <CertificationSection
          title={TRACK_AWARD.title}
          lessons={requirements.filter((item) => item.kind === "lesson").length}
          practiceTasks={requirements.filter((item) => item.kind === "practice").length}
          criteriaVersion={TRACK_AWARD.criteriaVersion}
        />
        <OpenSourceSection />
        <FinalCta firstLessonHref={firstLessonHref} />
      </main>
      <SiteFooter />
    </>
  );
}
