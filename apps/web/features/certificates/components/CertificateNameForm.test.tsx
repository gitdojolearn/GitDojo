import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CertificateNameForm } from "./CertificateNameForm";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const initial = (name: { givenName: string; familyName: string } | null = null) =>
  Response.json({ name, certificate: { ok: false, reason: "missing", characters: [] } });

describe("CertificateNameForm", () => {
  it("loads the saved name and explains the separate public-name choice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(initial({ givenName: "Ada", familyName: "Lovelace" })),
    );
    render(<CertificateNameForm />);
    expect(await screen.findByLabelText("Given name *")).toHaveValue("Ada");
    expect(screen.getByLabelText("Surname")).toHaveValue("Lovelace");
    expect(
      screen.getByText(/choose separately whether this name appears publicly/),
    ).toBeInTheDocument();
  });

  it("shows a print warning but lets the learner save a name written in another script", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(initial())
      .mockResolvedValueOnce(
        Response.json({
          name: { givenName: "王", familyName: "" },
          certificate: { ok: false, reason: "unprintable", characters: ["王"] },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(<CertificateNameForm />);
    const givenName = await screen.findByLabelText("Given name *");
    await user.type(givenName, "王");
    expect(screen.getByRole("alert")).toHaveTextContent("“王”");
    await user.click(screen.getByRole("button", { name: "Save certificate name" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Certificate name saved"),
    );
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/account/certificate-name",
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("shows an inline required-field error rather than sending an invalid name", async () => {
    const fetch = vi.fn().mockResolvedValue(initial());
    vi.stubGlobal("fetch", fetch);
    render(<CertificateNameForm />);
    await screen.findByLabelText("Given name *");
    fireEvent.click(screen.getByRole("button", { name: "Save certificate name" }));
    expect(
      await screen.findByText("Enter your given name. It's required for certificates."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
