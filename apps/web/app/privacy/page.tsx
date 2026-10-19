import { type Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What GitDojo stores, where it is kept, and the choices you have.",
};

/**
 * Written from what the code does (see docs/progress.md, docs/account-progress.md and
 * docs/certificates.md). Update it whenever what GitDojo stores or who processes it changes.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      updated="2026-10-19"
      intro={
        <p>
          GitDojo is an open-source project for learning Git. You can learn without an account, and
          then almost everything stays in your own browser. This page explains what is stored,
          where, and what you can do about it.
        </p>
      }
    >
      <section aria-labelledby="no-account">
        <h2 id="no-account">Learning without an account</h2>
        <p>Your progress is saved in your browser only and is not sent to GitDojo:</p>
        <ul>
          <li>
            the lessons, challenges and Practice tasks you complete, XP, the Git commands you run,
            the hints you reveal and the lesson you visited last;
          </li>
          <li>the practice repositories you work in, including the playground;</li>
          <li>
            small settings such as your light or dark theme and which release notes you have seen.
          </li>
        </ul>
        <p>
          The PDF progress report on the dashboard is made in your browser and is not uploaded. You
          can clear your progress at any time with <strong>Reset learning progress</strong> on the{" "}
          <Link href="/dashboard">dashboard</Link>, or by clearing this site&apos;s data in your
          browser.
        </p>
      </section>

      <section aria-labelledby="account">
        <h2 id="account">If you create an account</h2>
        <p>
          Accounts are optional. Sign-in is handled by WSO2 Identity Platform (Asgardeo) on its own
          pages, so GitDojo never sees your password. When you sign in, GitDojo receives an account
          identifier and your profile&apos;s name and email address, and stores them in its database
          together with:
        </p>
        <ul>
          <li>the lessons, challenges and Practice tasks you complete, when, and the XP earned;</li>
          <li>
            per-device counts of the commands you run and playground sessions, identified by a
            random device ID;
          </li>
          <li>
            the hints you reveal, the lesson you visited last and the release notes you have seen.
          </li>
        </ul>
        <p>
          This is what lets your progress follow you between devices. Progress made while signed out
          is never added to an account.
        </p>
      </section>

      <section aria-labelledby="certificates">
        <h2 id="certificates">Certificates</h2>
        <p>When you ask GitDojo to issue a certificate, it stores:</p>
        <ul>
          <li>
            the certificate itself: the certificate name you entered on your GitDojo account page at
            the time, the award and its criteria, the issue date and your choice about showing your
            name publicly;
          </li>
          <li>for the Git capstone, the Git history you submit for grading and its result.</li>
        </ul>
        <p>
          Each certificate has a public verification page that anyone with its link can open. It
          shows the award, issue date, credential ID and whether the certificate is valid or
          revoked. It shows <strong>your name only if you chose to make it public</strong>; the same
          applies to the signed Open Badge. The PDF always shows your name, and only you can
          download it. If a certificate is revoked, the reason is kept for GitDojo&apos;s records
          and is never shown publicly.
        </p>
      </section>

      <section aria-labelledby="cookies">
        <h2 id="cookies">Cookies and browser storage</h2>
        <ul>
          <li>
            <strong>Session cookie</strong>, only if you sign in: keeps you signed in.
          </li>
          <li>
            <strong>
              <code>gitdojo_rate_limit</code>
            </strong>
            : a random identifier that limits how often requests can be made, to protect the service
            from abuse.
          </li>
          <li>
            <strong>Browser storage</strong> (IndexedDB, local storage) for the progress, practice
            repositories and settings described above.
          </li>
        </ul>
        <p>GitDojo uses no analytics, advertising or tracking cookies and does not sell data.</p>
      </section>

      <section aria-labelledby="processors">
        <h2 id="processors">Who processes data</h2>
        <ul>
          <li>
            <strong>Vercel</strong> hosts the site. Like any web host, it handles each request,
            including your IP address and browser details, and may keep logs.
          </li>
          <li>
            <strong>Neon</strong> hosts the PostgreSQL database that holds account data.
          </li>
          <li>
            <strong>WSO2 Identity Platform</strong> manages accounts and sign-in, under its own
            privacy terms.
          </li>
        </ul>
      </section>

      <section aria-labelledby="retention">
        <h2 id="retention">How long data is kept, and your choices</h2>
        <p>
          Data in your browser stays until you reset it or clear the site&apos;s data. Account data
          is kept while your account exists, and certificates stay verifiable, because that is what
          they are for, unless they are revoked or deleted.
        </p>
        <p>
          To ask what GitDojo holds about your account, or to have it deleted, contact the
          maintainers through the <a href={SITE.githubUrl}>GitDojo repository on GitHub</a>.
          Deleting your account data also deletes your certificates, and their verification links
          then show that the credential was not found.
        </p>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">Changes</h2>
        <p>
          If what GitDojo collects changes, this page is updated and the date at the top changes
          with it. The project&apos;s source code is public, so you can check what it does.
        </p>
      </section>
    </LegalPage>
  );
}
