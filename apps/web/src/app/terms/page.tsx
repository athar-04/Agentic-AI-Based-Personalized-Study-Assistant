import Link from "next/link";
import { ContactLine, LegalPage, OPERATOR } from "@/components/legal-page";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="8 November 2026">
      <p>
        These terms cover your use of Agentic Study, run by {OPERATOR}. By creating an account you agree to them. Questions:{" "}
        <ContactLine />.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give a real email address you can receive mail at, and keep your password to yourself.</li>
        <li>One person per account. You&apos;re responsible for what happens under your account.</li>
        <li>You can close your account at any time in Settings.</li>
      </ul>

      <h2>AI answers</h2>
      <p>
        The tutor&apos;s answers and AI-written quizzes come from an AI model. They are often helpful and sometimes wrong. Check anything
        important against your course material or your teacher, and don&apos;t rely on them for exams, grades or decisions without doing so.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>Don&apos;t try to access other people&apos;s accounts or data, or get around the service&apos;s security or limits.</li>
        <li>Don&apos;t use the service to produce anything illegal, hateful or harmful, or to overload it.</li>
        <li>We may suspend accounts that break these rules.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        Your plans, notes and answers stay yours. You let us store and process them to run the service for you, as the{" "}
        <Link href="/privacy" className="text-primary underline underline-offset-4">
          privacy notice
        </Link>{" "}
        describes.
      </p>

      <h2>The service</h2>
      <p>
        We work to keep the service available and your data safe, but it is provided as it is, and features may change. We aren&apos;t
        responsible for losses caused by relying on AI answers or by interruptions to the service, to the extent the law allows.
      </p>

      <h2>Changes</h2>
      <p>If these terms change in a way that matters, we&apos;ll tell you in the app before the change applies.</p>
    </LegalPage>
  );
}
