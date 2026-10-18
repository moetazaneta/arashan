import type { ErrorCode } from "@arashan/core";
import {
  maxLambAgeMonths,
  maxNameLength,
  maxNotesLength,
  maxPasswordLength,
  maxPhoneLength,
  maxSheepNameLength,
  maxSheepNotesLength,
  maxSheepPerMove,
  maxSheepPerStatusChange,
  maxStatusReasonLength,
  maxTagLength,
  maxWeightKg,
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
  "user.passwordResetPending": msg`Администратор фермы меняет пароль этой учётной записи, и это ещё не закончилось. Попробуйте позже.`,
  "member.notFound": msg`Такого участника в ферме нет. Возможно, его уже удалили.`,
  "member.lastAdmin": msg`В ферме должен остаться хотя бы один администратор. Сначала назначьте администратором другого участника.`,
  "member.passwordInvalid": msg`Пароль должен быть длиной от ${minPasswordLength} до ${maxPasswordLength} символов.`,
  "member.passwordNotAllowed": msg`Этому участнику нельзя задать пароль здесь: это ваша учётная запись, учётная запись оператора или участника другой фермы.`,
  "member.passwordRejected": msg`Этот пароль слишком простой или есть в утёкших базах. Придумайте другой.`,
  "member.ownsActiveSheep": msg`Этот участник — владелец активных баранов. Сначала передайте их другому участнику.`,
  "sheep.notFound": msg`Такого барана нет. Возможно, его уже удалили.`,
  "sheep.tagTaken": msg`Эта бирка уже есть у другого барана фермы. Проверьте номер.`,
  "sheep.tagTooLong": msg`Бирка не длиннее ${maxTagLength} символов.`,
  "sheep.nameTooLong": msg`Кличка не длиннее ${maxSheepNameLength} символов.`,
  "sheep.notesTooLong": msg`Заметки не длиннее ${maxSheepNotesLength} символов. Сократите текст.`,
  "sheep.dateInvalid": msg`Введите дату полностью: день, месяц и год.`,
  "sheep.birthDateRequired": msg`Введите дату рождения. Если её никто не знает, запишите барана как начальный ввод.`,
  "sheep.birthDateInFuture": msg`Дата рождения не может быть в будущем.`,
  "sheep.birthDateAfterOwnerChange": msg`Дата рождения позже смены владельца. Проверьте дату рождения или историю владельцев.`,
  "sheep.purchaseRequired": msg`Купленного барана записывают покупкой. Если он был на ферме до приложения, выберите «Начальный ввод».`,
  "sheep.originLocked": msg`Происхождение меняется только у начального ввода.`,
  "sheep.ownerNotMember": msg`Владелец должен быть участником фермы. Выберите другого.`,
  "sheep.weightInvalid": msg`Введите вес в килограммах, больше нуля и не больше ${maxWeightKg}.`,
  "sheep.weighingDateInvalid": msg`Дата взвешивания не может быть в будущем или раньше рождения.`,
  "sheep.notActive": msg`Этого барана уже нет на ферме: он продан, забит, пал или потерян.`,
  "sheep.sameOwner": msg`Баран уже у этого владельца. Выберите другого.`,
  "sheep.ownerChangeDateInvalid": msg`Дата не может быть в будущем, раньше рождения барана или раньше прошлой смены владельца.`,
  "sheep.moveDateInvalid": msg`Дата перевода не может быть в будущем, раньше рождения барана или раньше его прошлого перевода.`,
  "sheep.tooManyToMove": msg`За один раз можно перевести не больше ${maxSheepPerMove} баранов.`,
  "sheep.noMoveToUndo": msg`У этого барана нет перевода, который можно отменить.`,
  "sheep.notLost": msg`Этот баран не потерян.`,
  "sheep.statusDateInvalid": msg`Дата не может быть в будущем и раньше прошлых событий барана: рождения, перевода, смены владельца или статуса.`,
  "sheep.reasonTooLong": msg`Причина длиннее ${maxStatusReasonLength} символов.`,
  "sheep.tooManyToChangeStatus": msg`За один раз можно изменить статус не больше чем у ${maxSheepPerStatusChange} баранов.`,
  "sheep.noStatusChangeToUndo": msg`У этого барана нет смены статуса, которую можно отменить.`,
  "sheep.inFlock": msg`Баран в стаде. Сначала выведите его из стада.`,
  "location.notFound": msg`Такого места нет.`,
  "location.nameRequired": msg`Введите название места.`,
  "location.nameTooLong": msg`Название не длиннее ${maxNameLength} символов.`,
  "location.nameTaken": msg`Место с таким названием уже есть, может быть, в архиве.`,
  "location.notesTooLong": msg`Заметки не длиннее ${maxNotesLength} символов. Сократите текст.`,
  "location.archived": msg`Это место в архиве. Выберите другое или верните это место из архива.`,
  "location.inUse": msg`Здесь стоит стадо. Сначала переведите стадо на другое место.`,
  "shepherd.notFound": msg`Такого чабана нет.`,
  "shepherd.nameRequired": msg`Введите имя чабана.`,
  "shepherd.nameTooLong": msg`Имя не длиннее ${maxNameLength} символов.`,
  "shepherd.phoneTooLong": msg`Телефон не длиннее ${maxPhoneLength} символов.`,
  "shepherd.notesTooLong": msg`Заметки не длиннее ${maxNotesLength} символов. Сократите текст.`,
  "shepherd.archived": msg`Этот чабан в архиве. Сначала верните его из архива.`,
  "flock.notFound": msg`Такого стада нет.`,
  "flock.nameRequired": msg`Введите название стада.`,
  "flock.nameTooLong": msg`Название не длиннее ${maxNameLength} символов.`,
  "flock.nameTaken": msg`Стадо с таким названием уже есть, может быть, в архиве.`,
  "flock.archived": msg`Это стадо в архиве. Выберите другое или верните это стадо из архива.`,
  "flock.notEmpty": msg`В стаде есть бараны. Сначала переведите их в другое стадо или выведите из стада.`,
  "flock.assignmentNotFound": msg`Такого назначения чабана нет. Возможно, его уже удалили.`,
  "flock.assignmentDatesInvalid": msg`Даты не могут быть в будущем, и дата «по» не может быть раньше даты «с».`,
  "flock.assignmentOverlaps": msg`В эти дни этот чабан уже работает в этом стаде.`,
  "flock.endDateInvalid": msg`Дата не может быть в будущем или раньше начала работы чабана в стаде.`,
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
