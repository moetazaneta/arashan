import type {
  FarmId,
  MoneyCategoryId,
  MoneyKind,
  MoneyRecordFilter,
  MoneyRecordId,
  MoneyRecordInput,
} from "@arashan/core";
import { api } from "@arashan/backend/api";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";

import { callCommand } from "./errors";

// The hooks of the Expenses, the Incomes and their categories. An amount is in hundredths.

/**
 * The categories of Expenses or of Incomes, in the order of the list. A Farm made before the
 * Expenses and Incomes has no categories: when the list is empty, the hook calls
 * `money.ensureCategories` one time for the Farm, and the list comes back with the default
 * categories by itself. Until then the hook is pending.
 */
export function useMoneyCategories(farmId: FarmId, kind: MoneyKind) {
  const categories = useQuery(convexQuery(api.money.categories, { farmId, kind }));
  const ensureCategories = useConvexMutation(api.money.ensureCategories);
  const empty = categories.data?.length === 0;
  // A query and not a mutation, so that both kinds and each mount share one call per Farm.
  const seed = useQuery({
    queryKey: ["money.ensureCategories", farmId],
    queryFn: () => callCommand(ensureCategories, { farmId }),
    enabled: empty,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  const data = empty ? undefined : categories.data;
  const error = categories.error ?? seed.error;
  return { data, error, isPending: data === undefined && error === null };
}

/** The Expenses or the Incomes that the filter selects, the newest first, and their total. */
export function useMoneyRecords(farmId: FarmId, filter: MoneyRecordFilter) {
  return useQuery(convexQuery(api.money.list, { farmId, ...filter }));
}

/** A Member records an Expense or an Income, and gets its id. */
export function useCreateMoneyRecord(farmId: FarmId) {
  const create = useConvexMutation(api.money.create);
  return useMutation({
    mutationFn: async (input: MoneyRecordInput & { kind: MoneyKind }) =>
      (await callCommand(create, { farmId, ...input })) as MoneyRecordId,
  });
}

/** A Member changes an Expense or an Income. Of an Automatic record, only the amount and the notes. */
export function useUpdateMoneyRecord(farmId: FarmId) {
  const update = useConvexMutation(api.money.update);
  return useMutation({
    mutationFn: (input: MoneyRecordInput & { recordId: MoneyRecordId }) =>
      callCommand(update, { farmId, ...input }),
  });
}

/** A Member deletes an Expense or an Income made by mistake. It becomes Deleted, not erased. */
export function useDeleteMoneyRecord(farmId: FarmId) {
  const remove = useConvexMutation(api.money.remove);
  return useMutation({
    mutationFn: (recordId: MoneyRecordId) => callCommand(remove, { farmId, recordId }),
  });
}

/** A Member adds a category of Expenses or of Incomes, and gets its id. */
export function useCreateMoneyCategory(farmId: FarmId) {
  const create = useConvexMutation(api.money.createCategory);
  return useMutation({
    mutationFn: async (input: { kind: MoneyKind; name: string }) =>
      (await callCommand(create, { farmId, ...input })) as MoneyCategoryId,
  });
}

/** A Member renames a category that is not a System category. */
export function useRenameMoneyCategory(farmId: FarmId) {
  const rename = useConvexMutation(api.money.renameCategory);
  return useMutation({
    mutationFn: (input: { categoryId: MoneyCategoryId; name: string }) =>
      callCommand(rename, { farmId, ...input }),
  });
}

/** A Member archives a category: the forms stop offering it, and its records keep it. */
export function useArchiveMoneyCategory(farmId: FarmId) {
  const archive = useConvexMutation(api.money.archiveCategory);
  return useMutation({
    mutationFn: (categoryId: MoneyCategoryId) => callCommand(archive, { farmId, categoryId }),
  });
}

/** A Member takes a category out of the archive. */
export function useUnarchiveMoneyCategory(farmId: FarmId) {
  const unarchive = useConvexMutation(api.money.unarchiveCategory);
  return useMutation({
    mutationFn: (categoryId: MoneyCategoryId) => callCommand(unarchive, { farmId, categoryId }),
  });
}

/** A Member deletes a category that no record uses. It becomes Deleted, not erased. */
export function useDeleteMoneyCategory(farmId: FarmId) {
  const remove = useConvexMutation(api.money.deleteCategory);
  return useMutation({
    mutationFn: (categoryId: MoneyCategoryId) => callCommand(remove, { farmId, categoryId }),
  });
}
