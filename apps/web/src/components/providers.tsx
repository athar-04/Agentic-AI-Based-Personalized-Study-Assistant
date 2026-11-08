"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "@/components/session";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {/* "user": framer-motion animations follow the OS reduce-motion setting. */}
        <MotionConfig reducedMotion="user">
          <SessionProvider>{children}</SessionProvider>
        </MotionConfig>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
