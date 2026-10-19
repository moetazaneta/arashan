import type { DealKind } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// The words of the Sales and the Purchases, in the language of the UI.

/** The kind of a deal, as a list or a link shows it. */
export const dealKindLabels: Record<DealKind, MessageDescriptor> = {
  sale: msg`Продажа`,
  purchase: msg`Покупка`,
};
