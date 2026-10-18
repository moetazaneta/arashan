import type { ErrorCode } from "@arashan/core";
import { toDomainError } from "@arashan/client";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

// The message for each domain error code. The type check fails if a code of the core has no message.
const errorMessages: Record<ErrorCode, MessageDescriptor> = {
  "sample.nameRequired": msg`Введите название.`,
  "sample.nameTaken": msg`Образец с таким названием уже есть.`,
  "sample.notFound": msg`Этого образца больше нет.`,
};

const unknownErrorMessage = msg`Что-то пошло не так. Попробуйте ещё раз.`;

/** The message for an error from a hook, in the language of the UI, or null if there is no error. */
export function useErrorMessage(error: unknown): string | null {
  const { i18n } = useLingui();
  if (error === null || error === undefined) return null;
  const domainError = toDomainError(error);
  return i18n._(domainError === null ? unknownErrorMessage : errorMessages[domainError.code]);
}
