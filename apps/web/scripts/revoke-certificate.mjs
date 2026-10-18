// Operational CLI for revoking an incorrectly issued certificate. Never expose this as a public API:
// only someone with the database's migration credentials can run it.
// Run from apps/web:
//   node scripts/revoke-certificate.mjs <credential-uuid> --by "<operator>" [--reason "<why>"] [--allow-reissue]
// The operator and reason are kept for GitDojo's audit and are never shown publicly.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { connectionConfig } from "../lib/db/connection.mjs";
import { parseRevokeArgs, revokeCertificate, USAGE } from "./certificate-revocation.mjs";

const args = parseRevokeArgs(process.argv.slice(2));
if (args.error) {
  console.error(`${args.error}\n${USAGE}`);
  process.exitCode = 2;
} else {
  const app = fileURLToPath(new URL("..", import.meta.url));
  if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
    for (const name of [".env.local", ".env"]) {
      const file = join(app, name);
      if (existsSync(file)) process.loadEnvFile(file);
    }
  }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const config = connectionConfig(url, { purpose: "migrate" });
  const sql = postgres(config.url, config.options);
  try {
    const result = await revokeCertificate(sql, args);
    if (result.status === "not-found") {
      console.error(`Certificate ${args.id} not found`);
      process.exitCode = 1;
    } else {
      const reissue = result.reissueAllowed
        ? "; the learner can now be issued a replacement"
        : "; a replacement stays blocked";
      console.log(
        result.status === "already-revoked"
          ? `${args.id} was already revoked at ${result.revokedAt.toISOString()}${reissue}`
          : `Revoked ${args.id} at ${result.revokedAt.toISOString()} by ${args.by}${reissue}`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
