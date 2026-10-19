"use client";

import { Button } from "@gitdojo/ui";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useState, type SyntheticEvent } from "react";
import {
  fullName,
  NAME_ERROR_MESSAGES,
  unprintableCharacters,
  validateCertificateName,
  type CertificateNameInput,
  type NameFieldError,
} from "@/lib/certificates/certificate-name";

type NameResponse = {
  name: (CertificateNameInput & { updatedAt: string }) | null;
  certificate:
    | { ok: true; recipientName: string }
    | { ok: false; reason: "missing" | "unprintable"; characters: string[] };
};

const endpoint = "/api/account/certificate-name";

async function readResponse(response: Response): Promise<NameResponse> {
  const body: unknown = await response.json();
  if (!response.ok || !body || typeof body !== "object" || !("certificate" in body)) {
    throw new Error("Couldn't load your certificate name. Try again.");
  }
  return body as NameResponse;
}

export function CertificateNameForm() {
  const [name, setName] = useState<CertificateNameInput>({ givenName: "", familyName: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof CertificateNameInput, string>>
  >({});

  useEffect(() => {
    let active = true;
    void fetch(endpoint, { cache: "no-store" })
      .then(readResponse)
      .then((data) => {
        if (active && data.name)
          setName({ givenName: data.name.givenName, familyName: data.name.familyName });
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Couldn't load your certificate name. Try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const printableCharacters = unprintableCharacters(
    fullName({
      givenName: name.givenName.normalize("NFC").trim().replace(/\s+/g, " "),
      familyName: name.familyName.normalize("NFC").trim().replace(/\s+/g, " "),
    }),
  );

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setError(null);
    setFieldErrors({});
    const validation = validateCertificateName(name);
    if (!validation.ok) {
      const errors = Object.fromEntries(
        (
          Object.entries(validation.errors) as [
            keyof CertificateNameInput | "full",
            NameFieldError,
          ][]
        ).map(([field, code]) => [
          field === "full" ? "givenName" : field,
          NAME_ERROR_MESSAGES[code],
        ]),
      ) as Partial<Record<keyof CertificateNameInput, string>>;
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validation.name),
      });
      const body: unknown = await response.json();
      if (response.status === 422 && body && typeof body === "object" && "errors" in body) {
        const apiErrors = body.errors as Record<string, { message?: string }>;
        setFieldErrors(
          Object.fromEntries(
            Object.entries(apiErrors).map(([key, value]) => [
              key === "full" ? "givenName" : key,
              value.message ?? "Check this field.",
            ]),
          ),
        );
        return;
      }
      const data = await readResponse(
        new Response(JSON.stringify(body), { status: response.status }),
      );
      setName({
        givenName: data.name?.givenName ?? validation.name.givenName,
        familyName: data.name?.familyName ?? validation.name.familyName,
      });
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't save your certificate name. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof CertificateNameInput, label: string, required: boolean) => (
    <div>
      <label htmlFor={`certificate-${key}`} className="block text-small font-medium text-fg">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={`certificate-${key}`}
        name={key}
        autoComplete={key === "givenName" ? "given-name" : "family-name"}
        required={required}
        maxLength={60}
        value={name[key]}
        disabled={loading || saving}
        aria-invalid={Boolean(fieldErrors[key])}
        aria-describedby={fieldErrors[key] ? `certificate-${key}-error` : undefined}
        onChange={(event) => {
          setName((current) => ({ ...current, [key]: event.target.value }));
          setSaved(false);
          setFieldErrors((current) => ({
            ...current,
            [key]: undefined,
            givenName: key === "familyName" ? current.givenName : undefined,
          }));
        }}
        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-small text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
      />
      {fieldErrors[key] ? (
        <p id={`certificate-${key}-error`} className="mt-1 text-caption text-danger">
          {fieldErrors[key]}
        </p>
      ) : null}
    </div>
  );

  return (
    <section
      id="certificate-name"
      aria-labelledby="certificate-name-heading"
      className="mt-6 scroll-mt-6 rounded-xl border border-border-subtle bg-surface p-6"
    >
      <h2 id="certificate-name-heading" className="text-body font-semibold text-fg">
        Certificate name
      </h2>
      <p className="mt-2 text-small text-fg-secondary">
        Enter the name GitDojo will print on certificates. It is stored in your GitDojo account and
        is never copied from your identity provider.
      </p>
      <p className="mt-1 text-caption text-fg-muted">
        Given name is required. Surname is optional. You choose separately whether this name appears
        publicly when you issue each certificate.
      </p>
      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-small text-fg-secondary" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading your saved
          name…
        </p>
      ) : (
        <form
          className="mt-4 space-y-4"
          noValidate
          onSubmit={(event) => void save(event)}
          aria-busy={saving}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {field("givenName", "Given name", true)}
            {field("familyName", "Surname", false)}
          </div>
          {printableCharacters.length > 0 ? (
            <p
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-small text-fg-secondary"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              Certificates and badge images currently can&apos;t print{" "}
              {printableCharacters.map((character) => `“${character}”`).join(", ")}. You can save
              this name, but issuance needs a Latin-1 printable version.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" /> Saving…
                </>
              ) : (
                "Save certificate name"
              )}
            </Button>
            {saved ? (
              <span role="status" className="text-small text-success">
                Certificate name saved.
              </span>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
