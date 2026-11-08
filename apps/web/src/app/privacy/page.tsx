import Link from "next/link";
import { ContactLine, LegalPage, OPERATOR } from "@/components/legal-page";

export const metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="8 November 2026">
      <p>
        Agentic Study is run by {OPERATOR}. This notice explains what we collect when you use it, why, who else sees it, and what you
        can ask us to do with it. Questions or requests: <ContactLine />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> name, username, email address, and a one-way scrambled form of your password (we never store or
          see the password itself). If you sign in with Google, your Google account ID.
        </li>
        <li>
          <strong>Your study data:</strong> the plans, topics and sessions you create, your quiz answers and scores, your revision
          schedule, and your settings such as your daily goal and time zone.
        </li>
        <li>
          <strong>Sign-in records:</strong> when you last signed in, and a record of what an administrator changed on your account.
        </li>
        <li>
          <strong>Technical logs:</strong> your IP address and the pages and requests your browser made, kept by the servers for security
          and troubleshooting.
        </li>
      </ul>
      <p>Questions you ask the AI tutor are not saved on our servers. Quizzes the AI writes for you are saved, so you can take and review them.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To run your account and show your own progress back to you.</li>
        <li>To send emails you need: confirming your address and resetting your password. We don&apos;t send marketing email.</li>
        <li>To keep the service secure, for example by limiting repeated sign-in attempts.</li>
      </ul>

      <h2>Who else sees it</h2>
      <ul>
        <li>
          <strong>The AI provider</strong> (Google&apos;s Gemini service, unless the operator configures another). When you ask the tutor a
          question or generate a quiz, your question, recent conversation and the topic you chose are sent to it to produce the answer.
          Avoid putting personal details in questions.
        </li>
        <li>
          <strong>Our email provider</strong>, to deliver the emails above.
        </li>
        <li>
          <strong>Our hosting provider</strong>, which stores the data on our behalf.
        </li>
        <li>
          <strong>Administrators of this service</strong>, who can see account details and activity to support users and keep the service
          running. Their actions are recorded.
        </li>
      </ul>
      <p>We don&apos;t sell your data or show you advertising.</p>

      <h2>Cookies and storage</h2>
      <p>
        One cookie keeps you signed in. It is necessary for the service and can&apos;t be read by scripts on the page. Your browser also
        remembers your light/dark theme choice. There are no advertising or tracking cookies.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>
          <strong>See and correct</strong> your name and study settings at any time in{" "}
          <Link href="/settings" className="text-primary underline underline-offset-4">
            Settings
          </Link>
          .
        </li>
        <li>
          <strong>Close your account</strong> in Settings. You are signed out everywhere and can&apos;t sign in again.
        </li>
        <li>
          <strong>Have your data erased</strong>, or get a copy of it: write to <ContactLine />. Closing your account alone keeps your
          data until it is erased on request.
        </li>
        <li>If you are under 18, please use the service with the agreement of a parent or guardian.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Your account and study data are kept while your account is open, and until you ask for them to be erased after closing it.
        Technical logs are kept only as long as needed for security and troubleshooting.
      </p>

      <h2>Changes</h2>
      <p>If this notice changes in a way that matters, we&apos;ll say so in the app before the change applies.</p>
    </LegalPage>
  );
}
