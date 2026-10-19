import type { DealId, DealKind, FarmId, PurchaseInput, SaleInput } from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

/** The Sales and the Purchases of the Farm, or the deals of one kind, the newest first. */
export function useDeals(farmId: FarmId, kind: DealKind | null) {
  return useQuery(convexQuery(api.deals.list, { farmId, kind }));
}

/** The card of a deal, or null if it is cancelled or the Farm has no such deal. */
export function useDeal(farmId: FarmId, dealId: DealId) {
  return useQuery(convexQuery(api.deals.get, { farmId, dealId }));
}

/** A Member sells Active Sheep for one total price, and gets the id of the Sale. */
export function useSellSheep(farmId: FarmId) {
  const sell = useConvexMutation(api.deals.sell);
  return useMutation({
    mutationFn: (input: SaleInput) =>
      callCommand(sell, { farmId, ...input, sheepIds: [...input.sheepIds] }),
  });
}

/** A Member records the Purchase of new Sheep, and gets the id of the Purchase. */
export function useBuySheep(farmId: FarmId) {
  const buy = useConvexMutation(api.deals.buy);
  return useMutation({
    mutationFn: (input: PurchaseInput) =>
      callCommand(buy, { farmId, ...input, sheep: [...input.sheep] }),
  });
}

/** A Member changes the price of a deal: the amount of its Automatic record. */
export function useChangeDealPrice(farmId: FarmId) {
  const changePrice = useConvexMutation(api.deals.changePrice);
  return useMutation({
    mutationFn: (input: { dealId: DealId; price: number }) =>
      callCommand(changePrice, { farmId, ...input }),
  });
}

/** A Member cancels a deal made by mistake, with its Automatic record. */
export function useCancelDeal(farmId: FarmId) {
  const cancel = useConvexMutation(api.deals.cancel);
  return useMutation({
    mutationFn: (dealId: DealId) => callCommand(cancel, { farmId, dealId }),
  });
}
