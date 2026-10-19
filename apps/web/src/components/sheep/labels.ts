import type { CommandName, Grade, Origin, Sex, SheepStatus } from "@arashan/core";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// The words for the values of a Sheep, in the language of the UI. Each record has a label for each
// value, so the type check fails when the core adds a value without a label.

export const sexLabels: Record<Sex, MessageDescriptor> = {
  ram: msg`Самец`,
  ewe: msg`Самка`,
};

export const statusLabels: Record<SheepStatus, MessageDescriptor> = {
  active: msg`Активен`,
  sold: msg`Продан`,
  slaughtered: msg`Забит`,
  dead: msg`Пал`,
  lost: msg`Потерян`,
};

export const originLabels: Record<Origin, MessageDescriptor> = {
  born: msg`Рождён на ферме`,
  bought: msg`Куплен`,
  external: msg`Внешний`,
};

/** The Grade of a Sheep, from the grading (бонитировка). */
export const gradeLabels: Record<Grade, MessageDescriptor> = {
  elite: msg({ context: "grade", message: "Элита" }),
  first: msg({ context: "grade", message: "Первый" }),
  second: msg({ context: "grade", message: "Второй" }),
};

/** What each command did, for the history of a record. */
export const commandLabels: Record<CommandName, MessageDescriptor> = {
  "user.register": msg({ context: "history", message: "Пользователь зарегистрирован" }),
  "user.updateUsername": msg({ context: "history", message: "Изменено имя пользователя" }),
  "user.setOperator": msg({ context: "history", message: "Изменены права оператора" }),
  "farm.create": msg({ context: "history", message: "Ферма создана" }),
  "farm.inviteAdmin": msg({ context: "history", message: "Создана ссылка для администратора" }),
  "farm.updateSettings": msg({ context: "history", message: "Изменены настройки фермы" }),
  "invite.accept": msg({ context: "history", message: "Приглашение принято" }),
  "member.invite": msg({ context: "history", message: "Создана ссылка для редактора" }),
  "member.changeRole": msg({ context: "history", message: "Изменена роль участника" }),
  "member.remove": msg({ context: "history", message: "Участник удалён" }),
  "member.requestPassword": msg({ context: "history", message: "Запрошен новый пароль" }),
  "member.setPassword": msg({ context: "history", message: "Задан новый пароль" }),
  "member.setPasswordFailed": msg({ context: "history", message: "Новый пароль не задан" }),
  "member.setPasswordUnknown": msg({
    context: "history",
    message: "Неизвестно, задан ли новый пароль",
  }),
  "sheep.register": msg({ context: "history", message: "Зарегистрирован" }),
  "sheep.registerExternal": msg({ context: "history", message: "Записан как внешний" }),
  "sheep.update": msg({ context: "history", message: "Изменён" }),
  "sheep.changeOwner": msg({ context: "history", message: "Сменён владелец" }),
  "sheep.delete": msg({ context: "history", message: "Удалён" }),
  "breed.add": msg({ context: "history", message: "Порода добавлена" }),
  "breed.rename": msg({ context: "history", message: "Порода переименована" }),
  "breed.archive": msg({ context: "history", message: "Порода в архиве" }),
  "breed.unarchive": msg({ context: "history", message: "Порода возвращена из архива" }),
  "breed.delete": msg({ context: "history", message: "Порода удалена" }),
  "sheep.move": msg({ context: "history", message: "Переведён в стадо" }),
  "sheep.undoMove": msg({ context: "history", message: "Перевод отменён" }),
  "sheep.markSlaughtered": msg({ context: "history", message: "Забит" }),
  "sheep.markDead": msg({ context: "history", message: "Пал" }),
  "sheep.markLost": msg({ context: "history", message: "Потерян" }),
  "sheep.markFound": msg({ context: "history", message: "Найден" }),
  "sheep.undoStatusChange": msg({ context: "history", message: "Смена статуса отменена" }),
  "flock.create": msg({ context: "history", message: "Стадо создано" }),
  "flock.update": msg({ context: "history", message: "Стадо изменено" }),
  "flock.archive": msg({ context: "history", message: "Стадо в архиве" }),
  "flock.unarchive": msg({ context: "history", message: "Стадо возвращено из архива" }),
  "flock.assignShepherd": msg({ context: "history", message: "Чабан назначен в стадо" }),
  "flock.updateAssignment": msg({ context: "history", message: "Изменены даты работы чабана" }),
  "flock.removeAssignment": msg({ context: "history", message: "Назначение чабана удалено" }),
  "location.create": msg({ context: "history", message: "Место создано" }),
  "location.update": msg({ context: "history", message: "Место изменено" }),
  "location.archive": msg({ context: "history", message: "Место в архиве" }),
  "location.unarchive": msg({ context: "history", message: "Место возвращено из архива" }),
  "shepherd.create": msg({ context: "history", message: "Чабан добавлен" }),
  "shepherd.update": msg({ context: "history", message: "Чабан изменён" }),
  "shepherd.archive": msg({ context: "history", message: "Чабан в архиве" }),
  "shepherd.unarchive": msg({ context: "history", message: "Чабан возвращён из архива" }),
  "lambing.record": msg({ context: "history", message: "Записан при окоте" }),
  "money.create": msg({ context: "history", message: "Запись добавлена" }),
  "money.update": msg({ context: "history", message: "Запись изменена" }),
  "money.delete": msg({ context: "history", message: "Запись удалена" }),
  "moneyCategory.create": msg({ context: "history", message: "Категория добавлена" }),
  "moneyCategory.update": msg({ context: "history", message: "Категория переименована" }),
  "moneyCategory.archive": msg({ context: "history", message: "Категория в архиве" }),
  "moneyCategory.unarchive": msg({
    context: "history",
    message: "Категория возвращена из архива",
  }),
  "moneyCategory.delete": msg({ context: "history", message: "Категория удалена" }),
  "sale.create": msg({ context: "history", message: "Продажа" }),
  "sale.updatePrice": msg({ context: "history", message: "Изменена сумма продажи" }),
  "sale.cancel": msg({ context: "history", message: "Продажа отменена" }),
  "purchase.create": msg({ context: "history", message: "Покупка" }),
  "purchase.updatePrice": msg({ context: "history", message: "Изменена сумма покупки" }),
  "purchase.cancel": msg({ context: "history", message: "Покупка отменена" }),
  "resource.create": msg({ context: "history", message: "Ресурс добавлен" }),
  "resource.update": msg({ context: "history", message: "Ресурс изменён" }),
  "resource.setNorms": msg({ context: "history", message: "Нормы ресурса изменены" }),
  "resource.archive": msg({ context: "history", message: "Ресурс отправлен в архив" }),
  "resource.unarchive": msg({ context: "history", message: "Ресурс возвращён из архива" }),
  "resource.restock": msg({ context: "history", message: "Пополнение" }),
  "resource.use": msg({ context: "history", message: "Выдача" }),
  "resource.adjust": msg({ context: "history", message: "Корректировка" }),
  "resource.cancelEvent": msg({ context: "history", message: "Запись ресурса отменена" }),
};
