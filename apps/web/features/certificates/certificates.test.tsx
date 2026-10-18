import {
  applyProgressAction,
  emptyProgress,
  type LocalProgress,
  type ProgressAction,
  type ProgressCatalog,
} from "@gitdojo/progress";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ProgressFeature from "@/features/progress";
import { resetProgressStoreForTests, useProgressStore } from "@/features/progress";
import { AWARDS, awardRequirements } from "@/lib/certificates/awards";
import { CertificateAwards } from "./components/CertificateAwards";
import { awardProgress, awardProgressFrom, completionSetsFromIds } from "./services/award-progress";
import { resetCertificationStatusForTests } from "./state/use-certification-status";

vi.mock("@/features/progress", async (importOriginal) => ({
  ...(await importOriginal<typeof ProgressFeature>()),
  syncCompletionsNow: () => Promise.resolve(),
  syncNow: () => Promise.resolve(),
}));

const FOUNDATIONS = AWARDS["git-foundations"];
const BRANCHING = AWARDS["branching-collaboration"];
const BRANCHING_IDS = awardRequirements("branching-collaboration").map((item) => item.id);

const course = (id: string, title: string, lessons: readonly string[]) => ({
  id,
  slug: id,
  title,
  description: "",
  difficulty: "beginner" as const,
  lessons: lessons.map((lessonId, index) => ({
    id: lessonId,
    slug: lessonId,
    title: `Lesson ${lessonId}`,
    type: "interactive" as const,
    number: index + 1,
  })),
});

const CATALOG: ProgressCatalog = {
  courses: [
    course("git-basics", "Git Basics", FOUNDATIONS.lessons),
    course("branching", "Branching", BRANCHING.lessons),
  ],
  lessons: [],
  challenges: [],
  practice: [
    {
      id: "commit-one-change",
      title: "Commit One Change",
      skill: "commits",
      difficulty: "beginner",
    },
    {
      id: "start-a-branch",
      title: "Start a Feature Branch",
      skill: "branches",
      difficulty: "beginner",
    },
    { id: "merge-a-feature", title: "Merge a Feature", skill: "merging", difficulty: "beginner" },
  ],
  concepts: {},
};

const lesson = (id: string, courseId = "git-basics"): ProgressAction => ({
  type: "complete",
  content: { kind: "lesson", id, type: "interactive", courseId },
});

function progressWith(actions: ProgressAction[], account = false): LocalProgress {
  const start = emptyProgress(Date.now(), {
    owner: account ? { kind: "account", accountId: "user-1" } : { kind: "anonymous" },
  });
  return actions.reduce(
    (progress, action) => applyProgressAction(progress, action, Date.now()),
    start,
  );
}

const allFoundations = [
  ...FOUNDATIONS.lessons.map((id) => lesson(id)),
  { type: "complete", content: { kind: "practice", id: "commit-one-change" } } as const,
];

interface Issued {
  id: string;
  awardKey: string;
  revoked?: boolean;
  publicNameConsent?: boolean;
  verificationUrl?: string | null;
}

/** `GET /api/certificates` as the server answers it: progress from the account's records. */
function statusBody(branchingDone: readonly string[], certificates: Issued[] = []) {
  return {
    certificates: certificates.map((item) => ({
      criteriaVersion: 1,
      recipientName: "Ada Lovelace",
      issuedAt: "2026-10-17T10:00:00.000Z",
      revoked: false,
      publicNameConsent: false,
      verificationUrl: null,
      ...item,
    })),
    progress: {
      "branching-collaboration": {
        completed: branchingDone,
        missing: BRANCHING_IDS.filter((id) => !branchingDone.includes(id)),
      },
    },
    lastLessonId: null,
    checkedAt: "2026-10-18T09:00:00.000Z",
  };
}

const card = (key: string) =>
  within(
    screen.getAllByTestId("certificate").find((element) => element.dataset.award === key) ??
      document.body,
  );

beforeEach(() => {
  resetProgressStoreForTests();
  resetCertificationStatusForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("award progress", () => {
  it("counts requirements and names the next one, lessons first", () => {
    const status = awardProgress(
      "git-foundations",
      progressWith([lesson("what-is-git"), lesson("git-vs-github")]),
      CATALOG,
    );
    expect(status).toMatchObject({ done: 2, total: 11, remaining: 9, percent: 18 });
    expect(status.next).toEqual({
      kind: "lesson",
      id: "git-init",
      title: "Lesson git-init",
      href: "/learn/git-basics/git-init",
      course: "Git Basics",
    });
  });

  it("moves on to Practice tasks, and has nothing next when every requirement is done", () => {
    const lessonsOnly = progressWith(FOUNDATIONS.lessons.map((id) => lesson(id)));
    expect(awardProgress("git-foundations", lessonsOnly, CATALOG).next).toMatchObject({
      kind: "practice",
      href: "/practice/commit-one-change",
    });
    expect(awardProgress("git-foundations", progressWith(allFoundations), CATALOG)).toMatchObject({
      remaining: 0,
      percent: 100,
      next: null,
    });
  });

  it("names content missing from the catalog without linking to it", () => {
    const next = awardProgress("git-recovery-history", progressWith([]), {
      ...CATALOG,
      courses: [],
    }).next;
    expect(next).toEqual({ kind: "lesson", id: "git-diff", title: "git-diff" });
  });

  it("reads the server's requirement IDs the same way", () => {
    const done = completionSetsFromIds(["lesson:what-is-a-branch", "practice:start-a-branch"]);
    expect(awardProgressFrom("branching-collaboration", done, CATALOG)).toMatchObject({
      done: 2,
      total: 13,
      next: { id: "understanding-head" },
    });
  });
});

describe("CertificateAwards", () => {
  it("leaves the certification track's award to its own card", () => {
    render(<CertificateAwards progress={progressWith([])} catalog={CATALOG} />);
    const awards = screen.getAllByTestId("certificate").map((item) => item.dataset.award);
    expect(awards).toEqual(["branching-collaboration", "git-recovery-history"]);
  });

  it("shows a signed-out learner a guide from this browser, and that certificates need an account", () => {
    render(
      <CertificateAwards
        progress={progressWith([lesson("what-is-a-branch", "branching")])}
        catalog={CATALOG}
      />,
    );
    expect(screen.getByTestId("certificates-sign-in")).toHaveTextContent(
      "work done while signed out doesn't count towards them",
    );
    const branching = card("branching-collaboration");
    expect(branching.getByTestId("certificate-count")).toHaveTextContent("1 of 13 requirements");
    expect(branching.getByRole("link", { name: /Lesson understanding-head/ })).toHaveAttribute(
      "href",
      "/learn/branching/understanding-head",
    );
    expect(screen.queryByRole("button", { name: "Issue certificate" })).toBeNull();
    expect(screen.getByText(/not an assessment of Git proficiency/)).toBeInTheDocument();
  });

  it("signed in, counts the account's stored completions, not this browser's", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json(statusBody(BRANCHING_IDS)))),
    );
    useProgressStore.setState({ mode: "account" });
    // Nothing done in this browser; the server has every requirement.
    render(<CertificateAwards progress={progressWith([], true)} catalog={CATALOG} />);
    const branching = card("branching-collaboration");
    expect(await branching.findByRole("button", { name: "Issue certificate" })).toBeEnabled();
    expect(branching.getByTestId("certificate-count")).toHaveTextContent("13 of 13 requirements");
  });

  it("explains the public name choice, then issues with it and unlocks the award", async () => {
    let issued: Issued[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        issued = [
          {
            id: "cert-1",
            awardKey: "branching-collaboration",
            publicNameConsent: true,
            verificationUrl: "https://gitdojo.example.org/verify/cert-1",
          },
        ];
        return Promise.resolve(Response.json({ id: "cert-1" }));
      }
      return Promise.resolve(Response.json(statusBody(BRANCHING_IDS, issued)));
    });
    vi.stubGlobal("fetch", fetchMock);
    useProgressStore.setState({ mode: "account" });
    render(<CertificateAwards progress={progressWith([], true)} catalog={CATALOG} />);

    const button = await card("branching-collaboration").findByRole("button", {
      name: "Issue certificate",
    });
    const choice = screen.getByRole("group", { name: "Your name on the certificate you issue" });
    expect(within(choice).getByRole("radio", { name: /Keep my name private/ })).toBeChecked();
    const user = userEvent.setup();
    await user.click(within(choice).getByRole("radio", { name: /Show my name publicly/ }));
    await user.click(button);

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      awardKey: "branching-collaboration",
      publicNameConsent: true,
    });
    const earned = await card("branching-collaboration").findByTestId("certificate-earned");
    expect(earned).toHaveClass("animate-gd-enter");
    expect(earned).toHaveTextContent("Issued October 17, 2026");
    expect(within(earned).getByRole("link", { name: "Verify" })).toHaveAttribute(
      "href",
      "/verify/cert-1",
    );
    expect(within(earned).getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      "/api/certificates/cert-1/pdf",
    );
    expect(card("branching-collaboration").getByText("Earned")).toHaveClass("animate-gd-pop");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Branching & Collaboration certificate issued.",
    );
    expect(screen.queryByRole("group", { name: /Your name/ })).toBeNull();
  });

  it("shows an earlier certificate without replaying the unlock, and a revoked one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            statusBody(BRANCHING_IDS, [
              { id: "cert-1", awardKey: "branching-collaboration" },
              { id: "cert-2", awardKey: "git-recovery-history", revoked: true },
            ]),
          ),
        ),
      ),
    );
    useProgressStore.setState({ mode: "account" });
    render(<CertificateAwards progress={progressWith([], true)} catalog={CATALOG} />);
    const earned = await card("branching-collaboration").findByTestId("certificate-earned");
    expect(earned).not.toHaveClass("animate-gd-enter");
    expect(earned).toHaveTextContent("Name on the public page: withheld");
    const recovery = card("git-recovery-history");
    expect(recovery.getByText("Revoked")).toBeInTheDocument();
    expect(recovery.getByTestId("certificate-revoked")).toHaveTextContent("It is no longer valid");
    expect(recovery.queryByText("Earned")).toBeNull();
  });

  it("copies the exact verification link and announces it", async () => {
    const url = "https://gitdojo.example.org/verify/3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            statusBody(BRANCHING_IDS, [
              {
                id: "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c",
                awardKey: "branching-collaboration",
                verificationUrl: url,
              },
            ]),
          ),
        ),
      ),
    );
    useProgressStore.setState({ mode: "account" });
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<CertificateAwards progress={progressWith([], true)} catalog={CATALOG} />);
    const branching = card("branching-collaboration");
    await branching.findByRole("link", { name: "Verify" });
    await user.click(branching.getByRole("button", { name: "Copy verification link" }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(await navigator.clipboard.readText()).toBe(url);
    expect(branching.getByRole("button", { name: "Link copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Verification link copied.");

    writeText.mockRejectedValueOnce(new Error("NotAllowedError"));
    await user.click(branching.getByRole("button", { name: "Link copied" }));
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy the link.");
    expect(branching.getByText(url)).toBeInTheDocument();
  });

  it("says when the account can't be reached", () => {
    useProgressStore.setState({ mode: "account-unavailable" });
    render(<CertificateAwards progress={progressWith([])} catalog={CATALOG} />);
    expect(screen.getByTestId("certificates-unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
