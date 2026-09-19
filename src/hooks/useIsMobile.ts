"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)"; // below Tailwind's `md`

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True on phone-width screens. False during server rendering. */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
