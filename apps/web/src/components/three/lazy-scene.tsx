"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

// three.js is most of these pages' JavaScript. Loading it after the page lets the form and the
// headline become usable first; the glow below holds the scene's space so nothing shifts.
const Scene = dynamic(() => import("./study-scene").then((m) => m.StudyScene), {
  ssr: false,
  loading: () => (
    <div aria-hidden="true" className="min-h-0 flex-1 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(247,128,69,0.28),transparent_70%)]" />
  ),
});

type SceneProps = React.ComponentProps<typeof Scene>;

/** Same props as the real scene. The caller's className sizes this box; both states fill it. */
export function StudyScene({ className, ...props }: SceneProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <Scene {...props} className="min-h-0 flex-1" />
    </div>
  );
}

export function useWideScreen(minWidth = 1024): boolean {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [minWidth]);
  return wide;
}
