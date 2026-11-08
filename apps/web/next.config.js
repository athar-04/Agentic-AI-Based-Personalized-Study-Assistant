/** @type {import('next').NextConfig} */

// The browser only ever talks to this origin; /api/v1 is proxied to the gateway. That keeps the
// HttpOnly refresh cookie first-party and SameSite=Strict, with no credentialed CORS involved.
// Read at build time: Next writes the proxy target into the build (see Dockerfile.web).
const API_GATEWAY_URL = process.env.API_GATEWAY_URL || "http://localhost:4000";

const isProduction = process.env.NODE_ENV === "production";

// Everything the app loads comes from its own origin: scripts, styles and fonts are bundled (fonts
// are self-hosted by next/font), API calls go through /api/v1. Next's hydration scripts are inline,
// hence 'unsafe-inline' for scripts; there is still no eval and no third-party origin, which is
// what stops injected markup from loading or sending anything elsewhere. Dev mode needs eval for
// hot reload, so the policy applies to production builds only.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProduction
    ? [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        // Browsers honour this only over HTTPS, so plain-http localhost is unaffected. No
        // includeSubDomains: other sites on the same domain may not be on HTTPS.
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
      ]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  // The dev-only corner badge sat on top of the phone tab bar during demos.
  devIndicators: false,
  // No "X-Powered-By: Next.js": it only tells scanners what to try.
  poweredByHeader: false,
  transpilePackages: ["@agentic/shared"],
  output: "standalone",
  experimental: {
    // The /api/v1 proxy otherwise gives up at 30 s with a bare 500. An AI question may try several
    // models within a 50 s budget; this leaves room for its own plain-words error to arrive.
    proxyTimeout: 70_000,
  },
  // The app uses no next/image. Turning the optimizer off removes the /_next/image endpoint, where
  // Next.js's remote-code-execution and cache-poisoning advisories were.
  images: { unoptimized: true },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_GATEWAY_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
