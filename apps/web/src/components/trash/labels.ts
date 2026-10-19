import type { MoneyKind, ResourceEventKind, TrashItem } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { dealKindLabels } from "@/components/deals/labels";

// What a record in the Trash is, in the language of the UI: its kind, and for some kinds the kind of
// the record itself, such as a Sale or a Purchase. The type check fails when the core adds a kind
// to the Trash without a label here.

const sheepLabel = msg`Баран`;
const externalSheepLabel = msg`Внешний баран`;
const breedLabel = msg`Порода`;
const assignmentLabel = msg`Чабан в стаде`;

const moneyRecordLabels: Record<MoneyKind, MessageDescriptor> = {
  expense: msg`Расход`,
  income: msg`Доход`,
};

const categoryLabels: Record<MoneyKind, MessageDescriptor> = {
  expense: msg`Категория расходов`,
  income: msg`Категория доходов`,
};

const resourceEventLabels: Record<ResourceEventKind, MessageDescriptor> = {
  restock: msg({ context: "resource event", message: "Пополнение" }),
  usage: msg({ context: "resource event", message: "Выдача" }),
  adjustment: msg({ context: "resource event", message: "Корректировка" }),
};

/** What the record is, for the column «Что» of the Trash: «Баран», «Продажа», «Расход» and so on. */
export function trashKindLabel(item: TrashItem): MessageDescriptor {
  switch (item.kind) {
    case "sheep":
      return item.record.origin === "external" ? externalSheepLabel : sheepLabel;
    case "deal":
      return dealKindLabels[item.record.kind];
    case "moneyRecord":
      return moneyRecordLabels[item.record.kind];
    case "moneyCategory":
      return categoryLabels[item.record.kind];
    case "resourceEvent":
      return resourceEventLabels[item.record.kind];
    case "breed":
      return breedLabel;
    case "shepherdAssignment":
      return assignmentLabel;
  }
}
