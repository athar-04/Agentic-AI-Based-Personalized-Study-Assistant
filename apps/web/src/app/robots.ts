import type { MetadataRoute } from "next";

// Only the public pages belong in search results. Signed-in pages are useless to a crawler, and
// the admin console and the local mailbox should not be advertised.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/auth/login", "/auth/register"],
      disallow: ["/admin", "/dev", "/api/", "/dashboard", "/plans", "/practice", "/revision", "/tutor", "/settings", "/auth/verify-email", "/auth/reset-password"],
    },
  };
}
