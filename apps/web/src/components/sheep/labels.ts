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
};
