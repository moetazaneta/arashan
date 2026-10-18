import { useEffect, useRef } from "react";

/**
 * Calls the action when the Member presses the key with no modifier, unless the focus is in a field,
 * a menu or a dialog, where the key types or does something else. The key is a physical key, such as
 * "KeyN", so the shortcut works in the Russian layout too.
 */
export function useKeyShortcut(code: string, action: () => void) {
  const latest = useRef(action);
  useEffect(() => {
    latest.current = action;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== code || event.repeat || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isBusy(event.target)) return;
      event.preventDefault();
      latest.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [code]);
}

const busyPlaces =
  "input, textarea, select, [contenteditable], [role=combobox], [role=listbox], [role=menu], [role=dialog], [role=alertdialog]";

function isBusy(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(busyPlaces) !== null;
}
