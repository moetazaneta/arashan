import type { MoneyKind } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// The words of the pages «Расходы» and «Доходы». The two pages are one component, and only these
// words differ.

interface KindLabels {
  /** The title of the page and the name of its table. */
  title: MessageDescriptor;
  add: MessageDescriptor;
  edit: MessageDescriptor;
  /** The question of the dialog that deletes a record. */
  remove: MessageDescriptor;
  /** The empty table, with the filters as the page opens. */
  empty: MessageDescriptor;
  /** The empty table, with other filters. */
  noneFound: MessageDescriptor;
}

export const kindLabels: Record<MoneyKind, KindLabels> = {
  expense: {
    title: msg`Расходы`,
    add: msg`Добавить расход`,
    edit: msg`Изменить расход`,
    remove: msg`Удалить расход?`,
    empty: msg`Здесь будут расходы фермы за этот год.`,
    noneFound: msg`Нет расходов с такими фильтрами.`,
  },
  income: {
    title: msg`Доходы`,
    add: msg`Добавить доход`,
    edit: msg`Изменить доход`,
    remove: msg`Удалить доход?`,
    empty: msg`Здесь будут доходы фермы за этот год.`,
    noneFound: msg`Нет доходов с такими фильтрами.`,
  },
};
