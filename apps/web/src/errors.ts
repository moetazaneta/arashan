import type { ErrorCode } from "@arashan/core";
import {
  maxLambAgeMonths,
  maxPasswordLength,
  minLambAgeMonths,
  minPasswordLength,
  toDomainError,
} from "@arashan/client";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

// The message for each domain error code. The type check fails if a code of the core has no message.
const errorMessages: Record<ErrorCode, MessageDescriptor> = {
  "auth.signedOut": msg`Войдите, чтобы продолжить.`,
  "auth.operatorOnly": msg`Это может сделать только оператор.`,
  "access.denied": msg`У вас нет прав на это действие.`,
  "user.notRegistered": msg`Ваша учётная запись ещё не готова. Обновите страницу.`,
  "user.usernameMissing": msg`У вашей учётной записи нет имени пользователя. Выйдите и войдите по имени пользователя.`,
  "user.notFound": msg`Такого пользователя нет.`,
  "farm.notMember": msg`У вас нет доступа к этой ферме.`,
  "farm.notFound": msg`Такой фермы нет.`,
  "farm.hasMembers": msg`В ферме уже есть участник: новая ссылка не нужна.`,
  "farm.nameRequired": msg`Введите название фермы.`,
  "farm.currencyInvalid": msg`Выберите валюту из списка.`,
  "farm.timeZoneInvalid": msg`Выберите часовой пояс из списка.`,
  "farm.lambAgeInvalid": msg`Введите целое число месяцев от ${minLambAgeMonths} до ${maxLambAgeMonths}.`,
  "invite.notFound": msg`Такой ссылки-приглашения нет. Проверьте, что ссылка скопирована целиком.`,
  "invite.used": msg`Эту ссылку уже использовали. Попросите новую.`,
  "invite.expired": msg`Ссылка больше не работает. Попросите новую.`,
  "invite.alreadyMember": msg`Вы уже участник этой фермы.`,
  "member.notFound": msg`Такого участника в ферме нет. Возможно, его уже удалили.`,
  "member.lastAdmin": msg`В ферме должен остаться хотя бы один администратор. Сначала назначьте администратором другого участника.`,
  "member.passwordInvalid": msg`Пароль должен быть длиной от ${minPasswordLength} до ${maxPasswordLength} символов.`,
  "member.passwordNotAllowed": msg`Этому участнику нельзя задать пароль здесь: это ваша учётная запись, учётная запись оператора или участника другой фермы.`,
  "member.passwordRejected": msg`Этот пароль слишком простой или есть в утёкших базах. Придумайте другой.`,
};

const unknownErrorMessage = msg`Что-то пошло не так. Попробуйте ещё раз.`;

/** An error from a hook, for a view: its domain code, if it has one, and its message. */
export interface ErrorInfo {
  code: ErrorCode | null;
  message: string;
}

/** The code and the message of an error from a hook, in the language of the UI, or null. */
export function useError(error: unknown): ErrorInfo | null {
  const { i18n } = useLingui();
  if (error === null || error === undefined) return null;
  const code = toDomainError(error)?.code ?? null;
  return { code, message: i18n._(code === null ? unknownErrorMessage : errorMessages[code]) };
}

/** The message for an error from a hook, in the language of the UI, or null if there is no error. */
export function useErrorMessage(error: unknown): string | null {
  return useError(error)?.message ?? null;
}

/** The error that the form shows itself, because none of its fields shows it, or null. */
export function formError(
  error: ErrorInfo | null,
  fieldCodes: readonly ErrorCode[],
): ErrorInfo | null {
  if (error === null || (error.code !== null && fieldCodes.includes(error.code))) return null;
  return error;
}
