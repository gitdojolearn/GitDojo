import type { Sql } from "postgres";

export declare const USAGE: string;

export declare function parseRevokeArgs(
  argv: string[],
): { error: string } | { id: string; by: string; reason: string | null; error?: undefined };

export declare function revokeCertificate(
  sql: Sql,
  revocation: { id: string; by: string; reason: string | null },
): Promise<
  | { status: "revoked" | "already-revoked"; revokedAt: Date }
  | { status: "not-found"; revokedAt?: undefined }
>;
