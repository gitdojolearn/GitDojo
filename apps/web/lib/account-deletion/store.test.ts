// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteAccountData } from "./store";

const database = vi.hoisted(() => {
  const query = vi.fn((..._args: unknown[]) => Promise.resolve([{ id: "user-id" }]));
  const begin = vi.fn(async (callback: (tx: typeof query) => Promise<unknown>) => callback(query));
  return { query, begin, sql: Object.assign(query, { begin }) };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDatabase: () => database.sql }));

describe("deleteAccountData", () => {
  beforeEach(() => {
    database.query.mockReset().mockResolvedValue([{ id: "user-id" }]);
    database.begin.mockClear();
  });

  it("revokes and anonymizes certificates before cascading account data", async () => {
    await deleteAccountData({
      issuer: "https://id.example",
      subject: "learner-subject",
      name: null,
      email: null,
    });

    expect(database.begin).toHaveBeenCalledOnce();
    expect(database.query).toHaveBeenCalledTimes(3);
    const [find, anonymize, remove] = database.query.mock.calls.map((call) =>
      (call[0] as TemplateStringsArray).join(" "),
    );
    expect(find).toContain("FOR UPDATE");
    expect(anonymize).toContain("UPDATE certificates");
    expect(anonymize).toContain("user_id = NULL");
    expect(anonymize).toContain("assessment_attempt_id = NULL");
    expect(anonymize).toContain("revoked_at = COALESCE");
    expect(anonymize).toContain("public_name_consent = false");
    expect(remove).toContain("DELETE FROM users");
  });

  it("does not issue a delete when the verified identity has no account row", async () => {
    database.query.mockResolvedValueOnce([]);
    await deleteAccountData({
      issuer: "https://id.example",
      subject: "unknown",
      name: null,
      email: null,
    });
    expect(database.query).toHaveBeenCalledOnce();
  });
});
