import type { Sql } from "postgres";

export declare const USAGE: string;

export declare function parseRevokeArgs(
  argv: string[],
):
  | { error: string }
  | { id: string; by: string; reason: string | null; allowReissue: boolean; error?: undefined };

export declare function revokeCertificate(
  sql: Sql,
  revocation: { id: string; by: string; reason: string | null; allowReissue?: boolean },
): Promise<
  | { status: "revoked" | "already-revoked"; revokedAt: Date; reissueAllowed: boolean }
  | { status: "not-found"; revokedAt?: undefined; reissueAllowed?: undefined }
>;
