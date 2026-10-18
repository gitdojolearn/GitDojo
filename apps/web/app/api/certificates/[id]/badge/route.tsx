import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getVerifiedIdentity } from "@/lib/auth/identity";
import { badgeContent, type BadgeContent } from "@/lib/certificates/badge";
import { CredentialConfigError, verificationUrl } from "@/lib/certificates/credential";
import { isCredentialId } from "@/lib/certificates/ids";
import { ownCertificate } from "@/lib/certificates/store";

export const runtime = "nodejs";

const PRIVATE = { "Cache-Control": "private, no-store" };
const SIZE = 1200;
const NAVY = "#0a2355";
const GOLD = "#c9a24a";
const MUTED = "#475569";

/**
 * A square PNG badge for social posts, drawn from the signed-in learner's own issued certificate.
 * It is only a picture: the verification URL it shows is where the current status lives.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const auth = await getVerifiedIdentity();
  if (auth.status !== "verified") {
    return Response.json({ error: auth.status }, { status: 401, headers: PRIVATE });
  }
  const { id } = await params;
  if (!isCredentialId(id))
    return Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
  try {
    // Only the learner's own certificate, as stored: never fields sent by the browser.
    const certificate = await ownCertificate(auth.identity, id);
    if (!certificate)
      return Response.json({ error: "not_found" }, { status: 404, headers: PRIVATE });
    if (certificate.revokedAt) {
      return Response.json({ error: "revoked" }, { status: 410, headers: PRIVATE });
    }
    const content = badgeContent(certificate, verificationUrl(certificate.id));
    const logo = await readFile(
      path.join(process.cwd(), "public", "brand", "gitdojo-logo-light-960.png"),
    );
    return new ImageResponse(
      <Badge content={content} logo={`data:image/png;base64,${logo.toString("base64")}`} />,
      {
        width: SIZE,
        height: SIZE,
        headers: {
          ...PRIVATE,
          "Content-Disposition": `attachment; filename="gitdojo-badge-${certificate.awardKey}.png"`,
        },
      },
    );
  } catch (error) {
    if (error instanceof CredentialConfigError) {
      return Response.json({ error: "issuer_not_configured" }, { status: 503, headers: PRIVATE });
    }
    return Response.json({ error: "unavailable" }, { status: 503, headers: PRIVATE });
  }
}

/** Laid out with flexbox only: the image renderer supports a subset of CSS. */
function Badge({ content, logo }: { content: BadgeContent; logo: string }) {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 40, background: NAVY }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flex: 1,
          padding: "72px 80px 64px",
          background: "#ffffff",
          border: `6px solid ${GOLD}`,
          borderRadius: 40,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img> only */}
        <img src={logo} width={440} height={153} alt="" />
        <div style={{ display: "flex", flex: 1 }} />
        <div
          style={{
            display: "flex",
            padding: "10px 28px",
            border: `2px solid ${GOLD}`,
            borderRadius: 999,
            color: NAVY,
            fontSize: 30,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {content.kindLabel}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            color: NAVY,
            fontSize: content.title.length > 24 ? 76 : 96,
            lineHeight: 1.1,
            textAlign: "center",
          }}
        >
          {content.title}
        </div>
        {content.holderName ? (
          <div style={{ display: "flex", marginTop: 36, color: "#1e293b", fontSize: 42 }}>
            {`Awarded to ${content.holderName}`}
          </div>
        ) : null}
        <div style={{ display: "flex", marginTop: 20, color: MUTED, fontSize: 34 }}>
          {`Issued ${content.issuedOn}`}
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", width: "70%", height: 3, background: GOLD }} />
        <div style={{ display: "flex", marginTop: 36, color: MUTED, fontSize: 30 }}>
          Check it is valid right now at
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            color: NAVY,
            fontSize: content.verifyAt.length > 60 ? 26 : 30,
            textAlign: "center",
            wordBreak: "break-all",
          }}
        >
          {content.verifyAt}
        </div>
        <div style={{ display: "flex", marginTop: 28, color: "#64748b", fontSize: 26 }}>
          Issued by GitDojo · Learn Git by doing.
        </div>
      </div>
    </div>
  );
}
