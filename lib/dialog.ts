"use client";

import { useEffect, useRef, type RefObject } from "react";

let lockCount = 0;
let savedOverflow = "";
const stack: HTMLElement[] = [];

export function useDialog(ref: RefObject<HTMLElement | null>, enabled: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!enabled || !dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    if (lockCount++ === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    stack.push(dialog);
    dialog.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (stack.at(-1) !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter((e) => e.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const index = stack.indexOf(dialog);
      if (index >= 0) stack.splice(index, 1);
      if (--lockCount === 0) document.body.style.overflow = savedOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [enabled, ref]);
}
