import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addToProfileUrl, LINKEDIN_MANUAL_HELP, linkedInFields } from "@/lib/certificates/linkedin";
import { ShareCertificate } from "./components/ShareCertificate";
import { type IssuedCertificate } from "./state/use-certification-status";

const ID = "81f3774e-b448-49d7-85cd-dc56f0922f96";
const URL_ = `https://git-dojo-drab.vercel.app/verify/${ID}`;

const ISSUED: IssuedCertificate = {
  id: ID,
  awardKey: "git-foundations",
  criteriaVersion: 1,
  recipientName: "Aakash Wijesekara",
  issuedAt: "2026-10-18T18:05:00.000Z",
  revoked: false,
  publicNameConsent: true,
  verificationUrl: URL_,
};

/** The share section with a status region, as the pages use it. */
function Harness({
  item = ISSUED,
  variant,
}: {
  item?: IssuedCertificate;
  variant?: "full" | "compact";
}) {
  const [message, setMessage] = useState("");
  return (
    <>
      <ShareCertificate item={item} onAnnounce={setMessage} variant={variant} />
      <p role="status">{message}</p>
    </>
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_LINKEDIN_ADD_TO_PROFILE_URL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LinkedIn Add to Profile", () => {
  it("uses only a configured https LinkedIn link", () => {
    expect(addToProfileUrl("https://www.linkedin.com/profile/add?startTask=x")).toBe(
      "https://www.linkedin.com/profile/add?startTask=x",
    );
    expect(addToProfileUrl("https://lnkd.in/abc")).toBe("https://lnkd.in/abc");
    for (const bad of [
      "",
      "  ",
      "http://www.linkedin.com/x",
      "https://evil.example/x",
      "javascript:alert(1)",
    ]) {
      expect(addToProfileUrl(bad)).toBeNull();
    }
  });

  it("lists what LinkedIn's form asks for, from the issued certificate", () => {
    expect(
      linkedInFields({
        title: "Git Foundations",
        kindLabel: "Completion Certificate",
        id: ID,
        issuedAt: new Date("2026-10-18T18:05:00Z"),
        verificationUrl: URL_,
      }),
    ).toEqual({
      name: "Git Foundations Completion Certificate",
      issuingOrganization: "GitDojo",
      issueDate: "October 2026",
      credentialId: ID,
      credentialUrl: URL_,
    });
  });
});

describe("ShareCertificate", () => {
  it("opens LinkedIn safely in a new tab: its instructions until a link is configured", () => {
    const first = render(<Harness />);
    const link = screen.getByRole("link", { name: /Add to LinkedIn/ });
    expect(link).toHaveAttribute("href", LINKEDIN_MANUAL_HELP);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAccessibleName("Add to LinkedIn (opens in a new tab)");
    first.unmount();

    vi.stubEnv(
      "NEXT_PUBLIC_LINKEDIN_ADD_TO_PROFILE_URL",
      "https://www.linkedin.com/profile/add?x=1",
    );
    render(<Harness />);
    expect(screen.getByRole("link", { name: /Add to LinkedIn/ })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/profile/add?x=1",
    );
    expect(screen.getByText(/It doesn't fill anything in/)).toBeInTheDocument();
  });

  it("shows each LinkedIn field with a copy button that says what it copied", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const fields = within(screen.getByTestId("share-linkedin-fields"));
    expect(fields.getByText("Git Foundations Completion Certificate")).toBeInTheDocument();
    expect(fields.getByText("GitDojo")).toBeInTheDocument();
    expect(fields.getByText("October 2026")).toBeInTheDocument();
    expect(fields.getByText(ID)).toBeInTheDocument();
    expect(fields.getByText(URL_)).toBeInTheDocument();

    await user.click(fields.getByRole("button", { name: "Copy credential id" }));
    expect(await navigator.clipboard.readText()).toBe(ID);
    expect(screen.getByRole("status")).toHaveTextContent("Credential ID copied.");
    expect(fields.getByRole("button", { name: "Credential ID copied" })).toBeInTheDocument();

    await user.click(fields.getByRole("button", { name: "Copy credential url" }));
    expect(await navigator.clipboard.readText()).toBe(URL_);
  });

  it("selects the value to copy by hand when the clipboard is blocked", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("NotAllowedError"));
    await user.click(screen.getByRole("button", { name: "Copy credential id" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't copy the credential id. It is selected, so copy it yourself.",
    );
    expect(window.getSelection()?.toString()).toBe(ID);
  });

  it("downloads the badge image from the server, and releases it afterwards", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(() =>
      // Plain bytes: Node 22's Response rejects jsdom's Blob, which isn't the platform's.
      Promise.resolve(
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          headers: { "Content-Type": "image/png" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:badge");
    URL.revokeObjectURL = revoke;
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this.download);
    });
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Download badge image" }));
    // The download finishes after several awaits; wait for its own announcement.
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Badge image downloaded.");
    });
    expect(fetchMock).toHaveBeenCalledWith(`/api/certificates/${ID}/badge`, { cache: "no-store" });
    expect(clicked).toEqual(["gitdojo-badge-git-foundations.png"]);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(revoke).toHaveBeenCalledWith("blob:badge");
  });

  it("explains a badge image that couldn't be made", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 503 }))),
    );
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Download badge image" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Couldn't make the badge image right now",
      );
    });
  });

  it("describes the badge image, with the name only when it is public", () => {
    const view = render(<Harness />);
    expect(screen.getByTestId("share-badge-preview")).toHaveAccessibleName(
      `GitDojo completion certificate: Git Foundations, awarded to Aakash Wijesekara, issued October 18, 2026, check it is valid at git-dojo-drab.vercel.app/verify/${ID}`,
    );
    view.unmount();
    render(<Harness item={{ ...ISSUED, publicNameConsent: false }} />);
    expect(screen.getByTestId("share-badge-preview")).not.toHaveAccessibleName(/Aakash/);
    expect(screen.getByText(/Your name isn't on it, as you chose/)).toBeInTheDocument();
  });

  it("hides the thumbnail rather than showing a broken image", () => {
    render(<Harness />);
    fireEvent.error(screen.getByTestId("share-badge-preview"));
    expect(screen.queryByTestId("share-badge-preview")).toBeNull();
    expect(screen.getByRole("button", { name: "Download badge image" })).toBeInTheDocument();
  });

  it("links the existing signed Open Badge download", () => {
    render(<Harness />);
    expect(screen.getByRole("link", { name: /Download signed Open Badge/ })).toHaveAttribute(
      "href",
      `/api/credentials/${ID}`,
    );
  });

  it("offers only the verification link for a revoked certificate", () => {
    render(<Harness item={{ ...ISSUED, revoked: true }} />);
    expect(screen.getByTestId("share-revoked")).toHaveTextContent("revoked");
    expect(screen.getByRole("button", { name: "Copy verification link" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /LinkedIn/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download badge image" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Open Badge/ })).toBeNull();
  });

  it("uses the device's share sheet where there is one", async () => {
    const share = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    try {
      render(<Harness />);
      await userEvent.setup().click(screen.getByRole("button", { name: "Share…" }));
      expect(share).toHaveBeenCalledWith({
        title: "Git Foundations completion certificate",
        url: URL_,
      });
    } finally {
      Reflect.deleteProperty(navigator, "share");
    }
  });

  it("folds away on the dashboard behind a Share certificate toggle", async () => {
    render(<Harness variant="compact" />);
    const toggle = screen.getByText("Share certificate");
    expect(toggle.closest("details")).not.toHaveAttribute("open");
    await userEvent.setup().click(toggle);
    expect(toggle.closest("details")).toHaveAttribute("open");
    expect(screen.queryByTestId("share-badge-preview")).toBeNull();
  });
});
