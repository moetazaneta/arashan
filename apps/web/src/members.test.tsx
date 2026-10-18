import { DomainError } from "@arashan/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vite-plus/test";

import { addMembers, aFarm, aMember, passwordOf, signIn, updateFake } from "@/test/fake-client";
import { renderApp } from "@/test/render-app";

/** An Admin "aibek" of a Farm with an Editor "zarina". */
function adminOfFarm() {
  const farm = aFarm("Чуйская");
  signIn({ username: "aibek", farms: [[farm, "admin"]] });
  const zarina = aMember("zarina", "editor");
  addMembers(farm, aMember("aibek", "admin", { canSetPassword: false }), zarina);
  return { farm, zarina };
}

test("an Admin opens «Участники» from the header and sees the Members", async () => {
  const user = userEvent.setup();
  const { farm } = adminOfFarm();
  const { router } = renderApp(`/farms/${farm.id}`);

  await user.click(await screen.findByRole("link", { name: "Участники" }));

  expect(await screen.findByRole("heading", { name: "Участники" })).toBeTruthy();
  expect(router.state.location.pathname).toBe(`/farms/${farm.id}/members`);
  const aibek = screen.getByRole("row", { name: /aibek/ });
  expect(within(aibek).getByText("Вы")).toBeTruthy();
  expect(
    within(aibek).getByRole("combobox", { name: "Роль участника aibek" }).textContent,
  ).toContain("Администратор");
  // An Admin cannot set the own password here.
  expect(within(aibek).queryByRole("button", { name: /Новый пароль/ })).toBeNull();
  expect(screen.getByRole("combobox", { name: "Роль участника zarina" }).textContent).toContain(
    "Редактор",
  );
});

test("an Admin makes a one-time invite link for an Editor", async () => {
  const user = userEvent.setup();
  const { farm } = adminOfFarm();
  renderApp(`/farms/${farm.id}/members`);

  await user.click(await screen.findByRole("button", { name: "Новая ссылка" }));

  expect(await screen.findByText("Ссылка для редактора фермы «Чуйская»")).toBeTruthy();
  const link = screen.getByRole<HTMLInputElement>("textbox", { name: "Ссылка-приглашение" });
  expect(link.value).toMatch(/\/invite\/token-\d+$/);
});

test("an Admin makes an Editor an Admin", async () => {
  const user = userEvent.setup();
  const { farm } = adminOfFarm();
  renderApp(`/farms/${farm.id}/members`);

  await user.click(await screen.findByRole("combobox", { name: "Роль участника zarina" }));
  await user.click(await screen.findByRole("option", { name: "Администратор" }));

  expect(
    (await screen.findByRole("combobox", { name: "Роль участника zarina" })).textContent,
  ).toContain("Администратор");
});

test("the last Admin cannot become an Editor: the page says why", async () => {
  const user = userEvent.setup();
  const { farm } = adminOfFarm();
  updateFake((backend) => {
    backend.failures.changeMemberRole = new DomainError("member.lastAdmin");
  });
  renderApp(`/farms/${farm.id}/members`);

  await user.click(await screen.findByRole("combobox", { name: "Роль участника aibek" }));
  await user.click(await screen.findByRole("option", { name: "Редактор" }));

  expect(
    await screen.findByText(
      "В ферме должен остаться хотя бы один администратор. Сначала назначьте администратором другого участника.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Роль участника aibek" }).textContent).toContain(
    "Администратор",
  );
});

test("an Admin removes a Member after a confirmation, and the Member moves to the former ones", async () => {
  const user = userEvent.setup();
  const { farm } = adminOfFarm();
  renderApp(`/farms/${farm.id}/members`);

  await user.click(await screen.findByRole("button", { name: "Удалить zarina из фермы" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Удалить zarina из фермы?")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

  const former = await screen.findByText("Бывшие участники");
  expect(former).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Роль участника zarina" })).toBeNull();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("a removal that the core rejects keeps the dialog open with the reason", async () => {
  const user = userEvent.setup();
  const { farm } = adminOfFarm();
  updateFake((backend) => {
    backend.failures.removeMember = new DomainError("member.lastAdmin");
  });
  renderApp(`/farms/${farm.id}/members`);

  await user.click(await screen.findByRole("button", { name: "Удалить aibek из фермы" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Выйти из фермы?")).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

  expect(await within(dialog).findByText(/хотя бы один администратор/)).toBeTruthy();
  expect(screen.queryByText("Бывшие участники")).toBeNull();
});

test("an Admin sets a new password for a Member", async () => {
  const user = userEvent.setup();
  const { farm, zarina } = adminOfFarm();
  renderApp(`/farms/${farm.id}/members`);

  await user.click(await screen.findByRole("button", { name: "Новый пароль для zarina" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Пароль"), "pasture-2026");
  await user.click(within(dialog).getByRole("button", { name: "Задать пароль" }));

  expect(await within(dialog).findByText("Пароль изменён.")).toBeTruthy();
  expect(passwordOf(zarina.membershipId)).toBe("pasture-2026");
});

test("a password that Clerk refuses shows the reason in the dialog", async () => {
  const user = userEvent.setup();
  const { farm } = adminOfFarm();
  updateFake((backend) => {
    backend.failures.setMemberPassword = new DomainError("member.passwordRejected");
  });
  renderApp(`/farms/${farm.id}/members`);

  await user.click(await screen.findByRole("button", { name: "Новый пароль для zarina" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Пароль"), "password");
  await user.click(within(dialog).getByRole("button", { name: "Задать пароль" }));

  expect(
    await within(dialog).findByText(
      "Этот пароль слишком простой или есть в утёкших базах. Придумайте другой.",
    ),
  ).toBeTruthy();
});

test("an Editor has no «Участники» link, and the page tells that only an Admin manages Members", async () => {
  const farm = aFarm("Чуйская");
  signIn({ username: "zarina", farms: [[farm, "editor"]] });
  renderApp(`/farms/${farm.id}/members`);

  expect(
    await screen.findByText("Участниками фермы управляет только её администратор."),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Участники" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Новая ссылка" })).toBeNull();
});
