import { type CalendarDate, dateAt } from "@arashan/core";
import { useEffect, useState } from "react";

/** How often a page that stays open checks whether the day changed. */
const dayCheckMs = 60_000;

/**
 * Today in the time zone, or undefined while the time zone is not known. The value changes when the
 * day changes there, also on a page that stays open overnight: the hook checks the date each minute
 * and when the window gets the focus. A check on the same day renders nothing again.
 */
export function useToday(timeZone: string | undefined): CalendarDate | undefined {
  const [today, setToday] = useState(() =>
    timeZone === undefined ? undefined : dateAt(Date.now(), timeZone),
  );
  useEffect(() => {
    const check = () => setToday(timeZone === undefined ? undefined : dateAt(Date.now(), timeZone));
    check();
    const timer = setInterval(check, dayCheckMs);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [timeZone]);
  return today;
}
