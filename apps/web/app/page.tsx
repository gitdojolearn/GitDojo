import { toCourseOutline } from "@gitdojo/lesson-engine";
import { type Metadata } from "next";
import Link from "next/link";
import { HeroDemo } from "@/components/landing/hero-demo";
import {
  CertificationSection,
  CoursesSection,
  FinalCta,
  HowItWorks,
  OpenSourceSection,
  SandboxSection,
} from "@/components/landing/sections";
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

const DESCRIPTION =
  "Learn Git by typing real commands in a safe browser sandbox: short hands-on courses, challenges, Practice tasks and a playground, plus a completion certificate you can share.";

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
      <SiteHeader action={<StartLearningLink firstLessonHref={firstLessonHref} size="sm" />} />
      <main>
        <section aria-labelledby="hero-heading" className="relative overflow-hidden">
          {/* Subtle radial glow behind the hero. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-140 bg-[radial-gradient(ellipse_at_center,var(--accent-glow),transparent_65%)]"
          />
          <div className="relative mx-auto grid max-w-[1280px] gap-12 px-4 pt-16 pb-12 sm:px-6 sm:pt-24 lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div>
              <h1
                id="hero-heading"
                className="text-h1 font-bold tracking-[-0.03em] text-fg sm:text-display"
              >
                Learn Git <span className="text-accent">by doing.</span>
              </h1>
              <p className="mt-5 max-w-xl text-body-lg text-fg-secondary">
                Type real Git commands in your browser, watch what each one changes, and practice
                recovering when things go wrong. Short guided lessons, then challenges without the
                hand-holding.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <StartLearningLink firstLessonHref={firstLessonHref} testId="hero-start" />
                <Button asChild variant="secondary" size="hero">
                  <Link href="/certification">Get certified</Link>
                </Button>
              </div>
              <p className="mt-6 text-small text-fg-muted">
                Free and open source · No install · No account needed to learn
              </p>
            </div>
            <HeroDemo />
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
          challenges={challenges.filter((item) => item.missingCommands.length === 0).length}
          practiceTasks={practice.filter((item) => item.missingCommands.length === 0).length}
        />
        <SandboxSection scenarios={scenarios.map((scenario) => scenario.title)} />
        <CertificationSection
          title={TRACK_AWARD.title}
          lessons={requirements.filter((item) => item.kind === "lesson").length}
          practiceTasks={requirements.filter((item) => item.kind === "practice").length}
          criteriaVersion={TRACK_AWARD.criteriaVersion}
        />
        <FinalCta firstLessonHref={firstLessonHref} />
        <OpenSourceSection />
      </main>
      <SiteFooter />
    </>
  );
}
