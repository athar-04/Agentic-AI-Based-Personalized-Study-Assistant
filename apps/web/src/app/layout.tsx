import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"], axes: ["SOFT", "WONK", "opsz"] });

const DESCRIPTION = "Break subjects into topics, practise with AI-written quizzes, ask an AI tutor, and review right before you'd forget.";

export const metadata: Metadata = {
  title: { default: "Agentic AI Study Assistant", template: "%s · Agentic Study" },
  description: DESCRIPTION,
  applicationName: "Agentic Study",
  openGraph: { type: "website", siteName: "Agentic Study", title: "Agentic AI Study Assistant", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets content use the full screen on notched phones; fixed bars pad themselves with safe-area insets.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ed" },
    { media: "(prefers-color-scheme: dark)", color: "#141210" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${display.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
