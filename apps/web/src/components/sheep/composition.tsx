import { useBreeds } from "@arashan/client";
import type { BreedComposition, BreedId, BreedRow, FarmId } from "@arashan/core";
import { useLingui } from "@lingui/react/macro";

import { formatShare } from "@/format";

// The Breeds as the views show them, and the Breed composition as one line of text.

/** The name of a Breed in the language of the UI. Arashan has no name of its own: it is built in. */
export function useBreedLabel(): (breed: Pick<BreedRow, "name">) => string {
  const { t } = useLingui();
  return (breed) => breed.name ?? t`Арашан`;
}

/**
 * The Breed composition as one line: «Арашан 75 %, Эдильбаевская 12,5 %, неизвестно 12,5 %». The
 * largest part first, as the core sorts them, and the Unknown part last. Null while the Breeds of
 * the Farm load.
 */
export function useCompositionText(
  farmId: FarmId,
): ((composition: BreedComposition) => string) | null {
  const { t, i18n } = useLingui();
  const breeds = useBreeds(farmId).data;
  const label = useBreedLabel();
  if (breeds === undefined) return null;
  const names = new Map<BreedId, string>(breeds.map((breed) => [breed.id, label(breed)]));
  return (composition) => {
    const parts = composition.breeds.map(
      (part) =>
        `${names.get(part.breedId) ?? t`удалённая порода`} ${formatShare(part.share, i18n.locale)}`,
    );
    if (composition.unknown > 0) {
      parts.push(`${t`неизвестно`} ${formatShare(composition.unknown, i18n.locale)}`);
    }
    return parts.join(", ");
  };
}

/** The Breed composition of a Sheep, as `useCompositionText` writes it. Empty while the Breeds load. */
export function CompositionText({
  farmId,
  composition,
}: {
  farmId: FarmId;
  composition: BreedComposition;
}) {
  const text = useCompositionText(farmId);
  if (text === null) return null;
  return <span className="tabular-nums">{text(composition)}</span>;
}
