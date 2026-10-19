import { type Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/legal-page";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using the GitDojo website, accounts and certificates.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="2026-10-19"
      intro={
        <p>
          These terms cover using the GitDojo website. GitDojo&apos;s source code is separately
          available under the MIT License, which governs what you may do with the code itself.
        </p>
      }
    >
      <section aria-labelledby="service">
        <h2 id="service">The service</h2>
        <p>
          GitDojo is a free, open-source place to learn Git. Lessons, challenges, Practice tasks and
          the playground run in a simulated environment in your browser: they are for learning, not
          for managing real projects, and nothing you do there reaches a real Git server.
        </p>
        <p>
          GitDojo is provided as is, without warranties of any kind. It can change, be unavailable
          or stop altogether, and lessons, features and these terms may change over time.
        </p>
      </section>

      <section aria-labelledby="accounts">
        <h2 id="accounts">Accounts</h2>
        <p>
          You don&apos;t need an account to learn. If you create one, keep your sign-in details to
          yourself and enter the certificate name on your GitDojo account page if you want to earn a
          certificate. The name is not imported from your identity-provider profile. How account
          data is handled is described in the <Link href="/privacy">privacy notice</Link>.
        </p>
      </section>

      <section aria-labelledby="acceptable-use">
        <h2 id="acceptable-use">Acceptable use</h2>
        <p>Please don&apos;t:</p>
        <ul>
          <li>try to break into, overload or get around the limits of the service;</li>
          <li>
            submit completions or capstone work that you didn&apos;t do yourself through GitDojo;
          </li>
          <li>impersonate someone else or misrepresent what a GitDojo certificate means.</li>
        </ul>
        <p>Accounts or certificates obtained by breaking these terms may be removed or revoked.</p>
      </section>

      <section aria-labelledby="certificates">
        <h2 id="certificates">Certificates</h2>
        <ul>
          <li>
            <strong>Completion certificates</strong> record that your GitDojo account completed the
            listed lessons and Practice tasks. Completions are reported from your browser and are
            not graded again on the server, so a completion certificate is not proof of assessed Git
            skill.
          </li>
          <li>
            The <strong>Git capstone</strong> credential records that the Git history you submitted
            passed GitDojo&apos;s server-side rubric for that attempt.
          </li>
          <li>
            GitDojo certificates are not accredited and are not an industry or vendor certification.
          </li>
          <li>
            GitDojo may revoke a certificate that was issued in error or obtained against these
            terms. A certificate&apos;s verification page always shows its current status, and that
            page, not a copy, is what counts.
          </li>
        </ul>
      </section>

      <section aria-labelledby="liability">
        <h2 id="liability">Liability</h2>
        <p>
          To the extent the law allows, the GitDojo maintainers and contributors are not liable for
          any loss arising from using GitDojo, including lost progress or a service that is
          unavailable.
        </p>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact">Contact</h2>
        <p>
          Questions about these terms can go to the maintainers through the{" "}
          <a href={SITE.githubUrl}>GitDojo repository on GitHub</a>.
        </p>
      </section>
    </LegalPage>
  );
}
