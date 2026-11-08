import type { Metadata } from "next";

// The console and its sign-in page are never meant to be found through search engines.
export const metadata: Metadata = {
  // The root layout's template adds " · Agentic Study".
  title: "Admin console",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
