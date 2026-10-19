"use client";

import { continueLearning } from "@gitdojo/progress";
import { Button, type ButtonProps } from "@gitdojo/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useProgressStore } from "@/features/progress";

/**
 * The page's main action. A new visitor starts at the first lesson; a learner with saved progress
 * (in this browser or their account) continues where "Continue learning" on the dashboard would
 * take them. Until progress has loaded it renders the new-visitor link, the same as the server.
 */
export function StartLearningLink({
  firstLessonHref,
  size = "hero",
  testId,
}: {
  /** The first lesson of the first course, from the content. */
  firstLessonHref: string;
  size?: ButtonProps["size"];
  testId?: string;
}) {
  const target = useProgressStore((state) => {
    const { progress, catalog } = state;
    if (!progress || !catalog) return null;
    const started =
      progress.lastLesson !== undefined || Object.keys(progress.completedLessons).length > 0;
    if (!started) return null;
    const next = continueLearning(progress, catalog.courses);
    return next ? `/learn/${next.course.slug}/${next.lesson.slug}` : "/challenges";
  });
  return (
    <Button asChild variant="primary" size={size}>
      <Link href={target ?? firstLessonHref} data-testid={testId}>
        {target ? "Continue learning" : "Start learning"} <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
