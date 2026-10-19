import { nameKey } from "@arashan/client";
import type { CategoryKey, MoneyCategoryRef } from "@arashan/core";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// The names of the categories that the app makes for each Farm, by key. The core keeps no names
// (ADR 0004), so the type check fails when the core adds a key without a name here.

const categoryNames: Record<CategoryKey, MessageDescriptor> = {
  shearing: msg`Стрижка`,
  treatment: msg`Лечение`,
  shepherdPay: msg`Оплата чабану`,
  equipment: msg`Оборудование`,
  // A key of both kinds, with the same name.
  other: msg`Прочее`,
  sheepPurchase: msg`Покупка баранов`,
  restock: msg`Пополнение ресурса`,
  wool: msg`Шерсть`,
  meat: msg`Мясо`,
  sheepSale: msg`Продажа баранов`,
};

/**
 * The name of a category: the name that a Member gave it, or else the name of its key in the
 * language of the UI.
 */
export function categoryName(category: Pick<MoneyCategoryRef, "key" | "name">, i18n: I18n): string {
  if (category.name !== null) return category.name;
  return category.key === null ? "" : i18n._(categoryNames[category.key]);
}

/**
 * True if a category of the app in the list shows this name. The core cannot see these names (it
 * keeps only the keys), so the view checks them before it adds or renames a category: else a Member
 * could make a second «Оплата чабану» without its rule, or a manual «Продажа баранов».
 */
export function isNameOfKey(
  name: string,
  categories: readonly Pick<MoneyCategoryRef, "id" | "key" | "name">[],
  self: MoneyCategoryRef["id"] | null,
  i18n: I18n,
): boolean {
  const key = nameKey(name);
  return categories.some(
    (category) =>
      category.id !== self &&
      category.key !== null &&
      category.name === null &&
      nameKey(categoryName(category, i18n)) === key,
  );
}
