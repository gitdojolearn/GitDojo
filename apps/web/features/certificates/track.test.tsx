import { emptyProgress, type ProgressCatalog } from "@gitdojo/progress";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountSession, type AccountSession } from "@/features/auth";
import type * as ProgressFeature from "@/features/progress";
import { resetProgressStoreForTests, useProgressStore } from "@/features/progress";
import { awardRequirements, missingRequirements } from "@/lib/certificates/awards";
import { trackProgress } from "@/lib/certificates/track";
import { CertificationTrack } from "./components/CertificationTrack";
import { CertificationTrackCard } from "./components/CertificationTrackCard";
import { type TrackRequirementInfo } from "./components/TrackParts";
import { completionSetsFromIds } from "./services/award-progress";
import { resetCertificationStatusForTests } from "./state/use-certification-status";

vi.mock("@/features/progress", async (importOriginal) => ({
  ...(await importOriginal<typeof ProgressFeature>()),
  syncCompletionsNow: () => Promise.resolve(),
  syncNow: () => Promise.resolve(),
}));

const REQUIREMENTS = awardRequirements("git-foundations");
const IDS = REQUIREMENTS.map((item) => item.id);
const INFO: TrackRequirementInfo[] = REQUIREMENTS.map((item) => ({
  id: item.id,
  kind: item.kind,
  order: item.order,
  title: `Title ${item.contentId}`,
  href:
    item.kind === "lesson" ? `/learn/git-basics/${item.contentId}` : `/practice/${item.contentId}`,
}));

const CATALOG: ProgressCatalog = {
  courses: [
    {
      id: "git-basics",
      slug: "git-basics",
      title: "Git Basics",
      description: "",
      difficulty: "beginner",
      lessons: REQUIREMENTS.filter((item) => item.kind === "lesson").map((item, index) => ({
        id: item.contentId,
        slug: item.contentId,
        title: `Title ${item.contentId}`,
        type: "interactive" as const,
        number: index + 1,
      })),
    },
  ],
  lessons: [],
  challenges: [],
  practice: [
    {
      id: "commit-one-change",
      title: "Title commit-one-change",
      skill: "commits",
      difficulty: "beginner",
    },
  ],
  concepts: {},
};

const SIGNED_IN: AccountSession = {
  status: "signed-in",
  user: { name: "Ada Lovelace", email: "ada@example.com", picture: null },
};

function signIn() {
  useAccountSession.setState({ session: SIGNED_IN });
  useProgressStore.setState({
    mode: "account",
    progress: emptyProgress(Date.now(), { owner: { kind: "account", accountId: "user-1" } }),
  });
}

function statusBody(
  completed: readonly string[],
  {
    lastLessonId = null,
    certificates = [],
  }: { lastLessonId?: string | null; certificates?: object[] } = {},
) {
  return {
    certificates,
    progress: {
      "git-foundations": {
        completed,
        missing: IDS.filter((id) => !completed.includes(id)),
      },
    },
    lastLessonId,
    checkedAt: "2026-10-18T09:00:00.000Z",
  };
}

const ISSUED = {
  id: "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c",
  awardKey: "git-foundations",
  criteriaVersion: 2,
  recipientName: "Ada Lovelace",
  issuedAt: "2026-10-18T10:00:00.000Z",
  revoked: false,
  publicNameConsent: false,
  verificationUrl: "https://gitdojo.example.org/verify/3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c",
};

function serve(
  body: unknown,
  certificateName: unknown = {
    name: { givenName: "Ada", familyName: "Lovelace" },
    certificate: { ok: true, recipientName: "Ada Lovelace" },
  },
) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(Response.json(url.includes("certificate-name") ? certificateName : body)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const status = () => screen.getByTestId("track-status");
const expectComplete = (count: number) =>
  waitFor(() => {
    expect(
      screen.getByRole("progressbar", { name: "Certification track requirements" }),
    ).toHaveAttribute("aria-valuetext", `${String(count)} of 11 requirements complete`);
  });
const statusOf = (id: string) =>
  screen.getAllByTestId("track-requirement").find((item) => item.dataset.requirement === id);

beforeEach(() => {
  resetProgressStoreForTests();
  resetCertificationStatusForTests();
  useAccountSession.setState({ session: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("trackProgress", () => {
  it("starts with nothing done and the first requirement next", () => {
    const progress = trackProgress([]);
    expect(progress).toMatchObject({ completed: 0, total: 11, percent: 0, eligible: false });
    expect(progress.next?.id).toBe("lesson:what-is-git");
    expect(progress.items.every((item) => item.status === "not-started")).toBe(true);
  });

  it("marks only the lesson opened last as in progress, and picks the first gap as next", () => {
    // Done out of order: the next requirement is still the earliest one left.
    const progress = trackProgress(
      ["lesson:what-is-git", "lesson:git-init", "practice:commit-one-change"],
      "git-status",
    );
    expect(progress.completed).toBe(3);
    expect(progress.next?.id).toBe("lesson:git-vs-github");
    const statuses = Object.fromEntries(
      progress.items.map((item) => [item.requirement.id, item.status]),
    );
    expect(statuses["lesson:git-status"]).toBe("in-progress");
    expect(statuses["lesson:git-vs-github"]).toBe("not-started");
    expect(Object.values(statuses).filter((value) => value === "in-progress")).toHaveLength(1);
  });

  it("is eligible exactly when the server's rule finds nothing missing", () => {
    for (const completed of [[], IDS.slice(0, 10), IDS, [...IDS, "lesson:unknown"]]) {
      const missing = missingRequirements("git-foundations", completionSetsFromIds(completed));
      expect(trackProgress(completed).eligible).toBe(missing.length === 0);
    }
    expect(trackProgress(IDS)).toMatchObject({ eligible: true, next: null, percent: 100 });
  });
});

describe("certification track page", () => {
  it("waits for the account before showing anything as progress", () => {
    render(<CertificationTrack requirements={INFO} />);
    expect(status()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("track-loading")).toBeInTheDocument();
    expect(screen.queryAllByTestId("requirement-status")).toHaveLength(0);
  });

  it("explains the track to a signed-out visitor and offers sign in", () => {
    useAccountSession.setState({ session: { status: "signed-out" } });
    render(<CertificationTrack requirements={INFO} />);
    const panel = within(screen.getByTestId("track-signed-out"));
    expect(panel.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Fcertification",
    );
    expect(panel.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/sign-up?returnTo=%2Fcertification",
    );
    // Every requirement is listed before starting, linked, with no invented progress.
    expect(screen.getAllByTestId("track-requirement")).toHaveLength(11);
    expect(screen.getByRole("link", { name: /Title what-is-git/ })).toHaveAttribute(
      "href",
      "/learn/git-basics/what-is-git",
    );
    expect(screen.queryAllByTestId("requirement-status")).toHaveLength(0);
  });

  it("says when accounts aren't set up on this site", () => {
    useAccountSession.setState({ session: { status: "unconfigured" } });
    render(<CertificationTrack requirements={INFO} />);
    expect(screen.getByTestId("track-unconfigured")).toBeInTheDocument();
  });

  it("starts a new learner at the first requirement", async () => {
    serve(statusBody([]));
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    expect(await screen.findByRole("link", { name: /Start certification track/ })).toHaveAttribute(
      "href",
      "/learn/git-basics/what-is-git",
    );
    expect(status()).toHaveAttribute("data-state", "not-started");
    expect(screen.getByTestId("track-count")).toHaveTextContent("0 of 11 requirements complete");
    expect(statusOf("lesson:what-is-git")).toHaveAttribute("aria-current", "step");
  });

  it("shows accurate progress and continues at the next incomplete requirement", async () => {
    serve(statusBody(IDS.slice(0, 4), { lastLessonId: "staging-area" }));
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    const next = await screen.findByTestId("track-continue");
    expect(next).toHaveAccessibleName(/Continue track/);
    expect(next).toHaveAttribute("href", "/learn/git-basics/working-tree");
    expect(
      screen.getByRole("progressbar", { name: "Certification track requirements" }),
    ).toHaveAttribute("aria-valuetext", "4 of 11 requirements complete");
    expect(screen.getByTestId("track-phase")).toHaveTextContent("7 requirements left");
    expect(
      within(statusOf("lesson:git-init") ?? document.body).getByTestId("requirement-status"),
    ).toHaveTextContent("Complete");
    expect(
      within(statusOf("lesson:staging-area") ?? document.body).getByTestId("requirement-status"),
    ).toHaveTextContent("In progress");
    expect(
      within(statusOf("lesson:git-add") ?? document.body).getByTestId("requirement-status"),
    ).toHaveTextContent("Not started");
    expect(screen.queryByTestId("track-get-certificate")).toBeNull();
  });

  it("shows the saved certificate name and an account edit link", async () => {
    serve(statusBody(IDS), {
      name: { givenName: "Grace", familyName: "Hopper" },
      certificate: { ok: true, recipientName: "Grace Hopper" },
    });
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    const panel = await screen.findByTestId("track-certificate-name");
    expect(panel).toHaveTextContent("Grace Hopper");
    expect(within(panel).getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/account#certificate-name",
    );
  });

  it("guides learners with no usable certificate name and blocks issue until fixed", async () => {
    serve(statusBody(IDS), {
      name: null,
      certificate: { ok: false, reason: "missing", characters: [] },
    });
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    expect(
      await screen.findByRole("link", { name: "Add or edit your certificate name" }),
    ).toHaveAttribute("href", "/account#certificate-name");
    expect(await screen.findByTestId("track-get-certificate")).toBeDisabled();
  });

  it("re-reads the server when the learner comes back, so finished lessons count", async () => {
    let completed = IDS.slice(0, 3);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          Response.json(
            url.includes("certificate-name")
              ? {
                  name: { givenName: "Ada", familyName: "Lovelace" },
                  certificate: { ok: true, recipientName: "Ada Lovelace" },
                }
              : statusBody(completed),
          ),
        ),
      ),
    );
    signIn();
    const first = render(<CertificationTrack requirements={INFO} />);
    await expectComplete(3);
    first.unmount();

    // A lesson finished elsewhere in the app, then back to the track (client-side navigation).
    completed = IDS.slice(0, 4);
    render(<CertificationTrack requirements={INFO} />);
    await expectComplete(4);

    // Finished in another tab, then back to this one.
    completed = IDS.slice(0, 5);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expectComplete(5);
  });

  it("never offers the certificate when progress can't be loaded, and can try again", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockImplementation((url: string) =>
        Promise.resolve(
          Response.json(
            url.includes("certificate-name")
              ? {
                  name: { givenName: "Ada", familyName: "Lovelace" },
                  certificate: { ok: true, recipientName: "Ada Lovelace" },
                }
              : statusBody(IDS),
          ),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    expect(await screen.findByTestId("track-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("track-get-certificate")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("track-get-certificate")).toBeInTheDocument();
  });

  it("issues once with the learner's name choice, then confirms the certificate", async () => {
    let certificates: object[] = [];
    let release: () => void = () => undefined;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          release = () => {
            certificates = [{ ...ISSUED, publicNameConsent: true }];
            resolve(Response.json({ id: ISSUED.id }));
          };
        });
      }
      return Promise.resolve(
        Response.json(
          url.includes("certificate-name")
            ? {
                name: { givenName: "Ada", familyName: "Lovelace" },
                certificate: { ok: true, recipientName: "Ada Lovelace" },
              }
            : statusBody(IDS, { certificates }),
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    signIn();
    const user = userEvent.setup();
    render(<CertificationTrack requirements={INFO} />);

    const get = await screen.findByTestId("track-get-certificate");
    expect(status()).toHaveAttribute("data-state", "eligible");
    await user.click(screen.getByRole("radio", { name: /Show my name publicly/ }));
    await user.click(get);
    // Busy while issuing: a second click can't send a second request.
    expect(get).toBeDisabled();
    await user.click(get);
    await act(async () => {
      release();
      await Promise.resolve();
    });

    const certificate = await screen.findByTestId("track-certificate");
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]?.[1]?.body as string)).toEqual({
      awardKey: "git-foundations",
      publicNameConsent: true,
    });
    expect(certificate).toHaveTextContent("Git Foundations completion certificate");
    expect(certificate).toHaveTextContent("Ada Lovelace");
    expect(certificate).toHaveTextContent("October 18, 2026");
    expect(screen.getByTestId("track-credential-id")).toHaveTextContent(ISSUED.id);
    expect(within(certificate).getByRole("link", { name: ISSUED.verificationUrl })).toHaveAttribute(
      "href",
      ISSUED.verificationUrl,
    );
    expect(within(certificate).getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      `/api/certificates/${ISSUED.id}/pdf`,
    );
    expect(certificate).toHaveTextContent("Name on the public page" + "Shown");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Git Foundations completion certificate issued.",
    );
  });

  it("explains a refusal from the server and issues nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        Promise.resolve(
          init?.method === "POST"
            ? Response.json(
                { error: "not_eligible", missing: ["practice:commit-one-change"] },
                { status: 422 },
              )
            : Response.json(
                url.includes("certificate-name")
                  ? {
                      name: { givenName: "Ada", familyName: "Lovelace" },
                      certificate: { ok: true, recipientName: "Ada Lovelace" },
                    }
                  : statusBody(IDS),
              ),
        ),
      ),
    );
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    await userEvent.setup().click(await screen.findByTestId("track-get-certificate"));
    expect(await screen.findByTestId("track-claim-error")).toHaveTextContent(
      "Some completions have not reached your account yet",
    );
    expect(screen.queryByTestId("track-certificate")).toBeNull();
  });

  it("shows an issued certificate, and makes a revoked one unmistakable", async () => {
    serve(statusBody(IDS, { certificates: [ISSUED] }));
    signIn();
    const view = render(<CertificationTrack requirements={INFO} />);
    expect(await screen.findByTestId("track-certificate")).toBeInTheDocument();
    expect(status()).toHaveAttribute("data-state", "completed");
    expect(screen.queryByTestId("track-get-certificate")).toBeNull();
    view.unmount();

    resetCertificationStatusForTests();
    serve(statusBody(IDS, { certificates: [{ ...ISSUED, revoked: true }] }));
    render(<CertificationTrack requirements={INFO} />);
    expect(await screen.findByTestId("share-revoked")).toHaveTextContent("no longer valid");
    expect(status()).toHaveAttribute("data-state", "revoked");
    // Nothing to share but the link that says it was revoked.
    expect(screen.queryByTestId("share-linkedin")).toBeNull();
    expect(screen.queryByTestId("share-badge-download")).toBeNull();
  });
});

describe("reissue", () => {
  it("offers a new certificate after one revoked for reissue, and explains why", async () => {
    serve(statusBody(IDS, { certificates: [{ ...ISSUED, revoked: true, reissueAllowed: true }] }));
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    expect(await screen.findByTestId("track-get-certificate")).toBeInTheDocument();
    expect(status()).toHaveAttribute("data-state", "eligible");
    expect(screen.getByTestId("track-reissue")).toHaveTextContent(
      "revoked your earlier certificate so that a corrected one can be issued",
    );
  });

  it("shows the replacement, not the revoked one, once it is issued", async () => {
    serve(
      statusBody(IDS, {
        certificates: [
          { ...ISSUED, id: "new-certificate", recipientName: "Ada Lovelace" },
          { ...ISSUED, revoked: true, reissueAllowed: true, recipientName: "ada lovelace" },
        ],
      }),
    );
    signIn();
    render(<CertificationTrack requirements={INFO} />);
    expect(await screen.findByTestId("track-credential-id")).toHaveTextContent("new-certificate");
    expect(status()).toHaveAttribute("data-state", "completed");
  });
});

describe("dashboard track card", () => {
  it("agrees with the track page on progress and the next requirement", async () => {
    serve(statusBody(IDS.slice(0, 4), { lastLessonId: "staging-area" }));
    signIn();
    render(
      <>
        <CertificationTrackCard catalog={CATALOG} />
        <CertificationTrack requirements={INFO} />
      </>,
    );
    const card = within(screen.getByTestId("track-card"));
    expect(await card.findByTestId("track-card-action")).toHaveAttribute(
      "href",
      "/learn/git-basics/working-tree",
    );
    const counts = screen.getAllByTestId("track-count").map((item) => item.textContent);
    expect(counts).toEqual(["4 of 11 requirements complete", "4 of 11 requirements complete"]);
    expect(card.getByTestId("track-card-next")).toHaveTextContent("Title working-tree");
    expect(card.getByRole("link", { name: "View all criteria" })).toHaveAttribute(
      "href",
      "/certification",
    );
    expect(card.getByText("In progress")).toBeInTheDocument();
  });

  it("points an eligible learner to the certificate, and a signed-out one to sign in", async () => {
    serve(statusBody(IDS));
    signIn();
    const view = render(<CertificationTrackCard catalog={CATALOG} />);
    expect(await screen.findByRole("link", { name: /Get your certificate/ })).toHaveAttribute(
      "href",
      "/certification",
    );
    view.unmount();

    resetCertificationStatusForTests();
    useAccountSession.setState({ session: { status: "signed-out" } });
    render(<CertificationTrackCard catalog={CATALOG} />);
    expect(screen.getByTestId("track-card")).toHaveTextContent(
      "Sign in to track your progress and get certified.",
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
