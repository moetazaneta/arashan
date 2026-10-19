import type { FarmId, Period } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";

import { useFarm } from "./farms";
import { useToday } from "./today";

// The hooks of the reports of a Farm. An amount is in hundredths.

/**
 * The head count of the Sheep by Status, Owner, Flock, Location and group, for today in the time
 * zone of the Farm. The Lambs change with the day, so the hook asks again when the day changes on
 * an open page.
 */
export function useHeadCountReport(farmId: FarmId) {
  const farm = useFarm(farmId);
  const today = useToday(farm.data?.timeZone);
  const report = useQuery(
    convexQuery(api.reports.headCount, today === undefined ? "skip" : { farmId, date: today }),
  );
  const error = report.error ?? farm.error;
  return { data: report.data, error, isPending: report.data === undefined && error === null };
}

/** The Incomes minus the Expenses of the period, by category, in the currency of the Farm. */
export function useMoneyReport(farmId: FarmId, period: Period) {
  return useQuery(convexQuery(api.reports.money, { farmId, ...period }));
}
