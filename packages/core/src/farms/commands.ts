import { authorize } from "../access/permissions";
import { requireOperator } from "../access/session";
import { recordAudit, recordFarmAudit } from "../audit/audit";
import type {
  CommandContext,
  FarmCommandContext,
  FarmQueryContext,
  QueryContext,
} from "../context";
import { DomainError } from "../errors";
import type { FarmId } from "../ids";
import { issueInvite, type NewInvite, revokeOpenInvites } from "../members/commands";
import { ensureMoneyCategories } from "../money/commands";
import { type Farm, type FarmSettings, validFarmName, validFarmSettings } from "./farm";

/** What the Operator sees of a Farm: no data of the Farm, only whether its first Admin joined. */
export interface FarmSummary {
  id: FarmId;
  name: string;
  createdAt: number;
  hasMembers: boolean;
}

/**
 * All Farms, the newest first, for the Operator's screen «Фермы». The Operator does not see the data
 * of a Farm of which the Operator is not a Member, so this gives only the name and the state.
 */
export async function listFarms(ctx: QueryContext): Promise<FarmSummary[]> {
  await requireOperator(ctx);
  const farms = await ctx.repos.farms.list();
  return Promise.all(
    farms.map(async ({ id, name, createdAt }) => ({
      id,
      name,
      createdAt,
      hasMembers: await ctx.repos.memberships.hasMembers(id),
    })),
  );
}

/**
 * The Operator makes a Farm, and gets a one-time invite link for its first Admin. The Farm starts
 * with the default lists of Expense categories and Income categories.
 */
export async function createFarm(
  ctx: CommandContext,
  input: { name: string } & FarmSettings,
): Promise<{ farmId: FarmId; invite: NewInvite }> {
  const operator = await requireOperator(ctx);
  const name = validFarmName(input.name);
  const settings = validFarmSettings(input);
  const farmId = await ctx.repos.farms.insert({ name, ...settings, createdAt: ctx.now() });
  const { token, expiresAt } = await issueInvite(
    ctx,
    (invite) => ctx.repos.invites.insert({ ...invite, farmId }),
    { role: "admin", createdBy: operator.id },
  );
  await recordAudit(ctx, {
    actorId: operator.id,
    farmId,
    command: "farm.create",
    target: { kind: "Farm", id: farmId },
  });
  await ensureMoneyCategories(ctx, farmId, operator.id);
  return { farmId, invite: { token, expiresAt } };
}

/**
 * The Operator makes a new invite link for the first Admin of a Farm that has no Member yet, for
 * example when the first link expired or was lost. The older links of the Farm stop working.
 */
export async function inviteFarmAdmin(
  ctx: CommandContext,
  input: { farmId: FarmId },
): Promise<NewInvite> {
  const operator = await requireOperator(ctx);
  if ((await ctx.repos.farms.get(input.farmId)) === null) throw new DomainError("farm.notFound");
  if (await ctx.repos.memberships.hasMembers(input.farmId)) {
    throw new DomainError("farm.hasMembers");
  }
  await revokeOpenInvites(ctx, input.farmId);
  const { token, expiresAt } = await issueInvite(
    ctx,
    (invite) => ctx.repos.invites.insert({ ...invite, farmId: input.farmId }),
    { role: "admin", createdBy: operator.id },
  );
  await recordAudit(ctx, {
    actorId: operator.id,
    farmId: input.farmId,
    command: "farm.inviteAdmin",
    target: { kind: "Farm", id: input.farmId },
  });
  return { token, expiresAt };
}

/** The Farm of the request, with its settings. */
export function getFarm(ctx: FarmQueryContext): Farm {
  authorize(ctx.member, "farm.view", { farmId: ctx.farm.id });
  return ctx.farm;
}

/**
 * An Admin changes the currency, the time zone and the lamb age of the Farm. The amounts of the
 * Expenses and the Incomes are in the currency of the Farm, so the currency stays when the Farm has
 * one of them, also a Deleted one (`farm.currencyLocked`).
 */
export async function updateFarmSettings(
  ctx: FarmCommandContext,
  input: FarmSettings,
): Promise<void> {
  authorize(ctx.member, "farm.updateSettings", { farmId: ctx.farm.id });
  const settings = validFarmSettings(input);
  if (settings.currency !== ctx.farm.currency && (await ctx.repos.moneyRecords.anyWithDeleted())) {
    throw new DomainError("farm.currencyLocked");
  }
  await ctx.repos.farm.updateSettings(settings);
  await recordFarmAudit(ctx, {
    command: "farm.updateSettings",
    target: { kind: "Farm", id: ctx.farm.id },
  });
}
