"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getPublicCalendarLinkSettings, type ManagedPublicCalendarLink } from "@/data/internal";
import { getDb } from "@/db/client";
import { auditLog, dayparts, publicCalendarLinkDayparts, publicCalendarLinks, residencies } from "@/db/schema";
import { decryptPublicCalendarToken, encryptPublicCalendarToken } from "@/domain/public-calendar-credentials";
import { issuePublicCalendarToken } from "@/domain/public-calendar";
import { requireActorForResidency } from "@/lib/auth";
import { requestOrigin } from "@/lib/request-origin";

export type PublicCalendarLinkActionResult = {
  status: "success" | "error";
  message: string;
  link?: ManagedPublicCalendarLink;
  url?: string;
};

export type PublicCalendarLinkMutationInput = {
  residencyId: string;
  name: string;
  scope: "all" | "selected";
  daypartIds: string[];
};

export type PublicCalendarLinkTargetInput = {
  residencyId: string;
  linkId: string;
};

const mutationSchema = z.object({
  residencyId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  scope: z.enum(["all", "selected"]),
  daypartIds: z.array(z.uuid()).max(100),
});

const targetSchema = z.object({
  residencyId: z.uuid(),
  linkId: z.uuid(),
});

class CalendarLinkOperationError extends Error {}

type CalendarTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

function normalizedDaypartIds(scope: "all" | "selected", daypartIds: string[]): string[] {
  const uniqueIds = [...new Set(daypartIds)];
  if (scope === "selected" && uniqueIds.length === 0) {
    throw new CalendarLinkOperationError("Select at least one Daypart for this link.");
  }
  return scope === "selected" ? uniqueIds : [];
}

async function requireShareableResidency(tx: CalendarTransaction, residencyId: string) {
  const [residency] = await tx.select({ id: residencies.id, name: residencies.name })
    .from(residencies)
    .where(and(
      eq(residencies.id, residencyId),
      eq(residencies.active, true),
      eq(residencies.operatingMode, "operations"),
    ))
    .limit(1);
  if (!residency) throw new CalendarLinkOperationError("Residency not found.");
  return residency;
}

async function requireAvailableDayparts(tx: CalendarTransaction, residencyId: string, daypartIds: string[]) {
  if (daypartIds.length === 0) return;
  const available = await tx.select({ id: dayparts.id }).from(dayparts).where(and(
    eq(dayparts.residencyId, residencyId),
    eq(dayparts.active, true),
    inArray(dayparts.id, daypartIds),
  ));
  if (available.length !== daypartIds.length) {
    throw new CalendarLinkOperationError("One or more selected Dayparts are unavailable for this Residency.");
  }
}

function constraintName(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { constraint?: unknown; cause?: unknown };
  if (typeof candidate.constraint === "string") return candidate.constraint;
  return constraintName(candidate.cause);
}

function errorResult(error: unknown, fallback: string): PublicCalendarLinkActionResult {
  if (error instanceof CalendarLinkOperationError) return { status: "error", message: error.message };
  if (error instanceof z.ZodError) return { status: "error", message: "Check the link name and selected Dayparts, then try again." };
  if (constraintName(error) === "public_calendar_links_active_name_unique") {
    return { status: "error", message: "An active calendar link already uses that name." };
  }
  return { status: "error", message: fallback };
}

function revalidateCalendarSharing() {
  revalidatePath("/app/calendar");
  revalidatePath("/residency/calendar");
  revalidatePath("/app/setup");
}

async function managedLink(residencyId: string, linkId: string) {
  const settings = await getPublicCalendarLinkSettings(residencyId);
  const link = settings.links.find((candidate) => candidate.id === linkId);
  if (!link) throw new CalendarLinkOperationError("The calendar link could not be reloaded.");
  return link;
}

export async function createPublicCalendarLinkAction(input: PublicCalendarLinkMutationInput): Promise<PublicCalendarLinkActionResult> {
  try {
    const parsed = mutationSchema.parse(input);
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    const daypartIds = normalizedDaypartIds(parsed.scope, parsed.daypartIds);
    const { token, tokenHash } = issuePublicCalendarToken();
    const tokenCiphertext = encryptPublicCalendarToken(token);
    const database = getDb();
    const linkId = await database.transaction(async (tx) => {
      const residency = await requireShareableResidency(tx, parsed.residencyId);
      await requireAvailableDayparts(tx, parsed.residencyId, daypartIds);
      const [link] = await tx.insert(publicCalendarLinks).values({
        residencyId: parsed.residencyId,
        name: parsed.name,
        tokenHash,
        tokenCiphertext,
        scope: parsed.scope,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
        rotatedByUserId: actor.userId,
      }).returning({ id: publicCalendarLinks.id });
      if (daypartIds.length) {
        await tx.insert(publicCalendarLinkDayparts).values(daypartIds.map((daypartId) => ({
          linkId: link.id,
          residencyId: parsed.residencyId,
          daypartId,
        })));
      }
      await tx.insert(auditLog).values({
        residencyId: parsed.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "public_calendar_link_created",
        entityType: "public_calendar_link",
        entityId: link.id,
        details: { residencyName: residency.name, linkName: parsed.name, scope: parsed.scope, daypartIds },
      });
      return link.id;
    });
    revalidateCalendarSharing();
    return {
      status: "success",
      message: `${parsed.name} is ready to share.`,
      link: await managedLink(parsed.residencyId, linkId),
      url: new URL(`/share/calendar/${token}`, requestOrigin(await headers())).toString(),
    };
  } catch (error) {
    return errorResult(error, "Unable to create this calendar link.");
  }
}

export async function updatePublicCalendarLinkAction(input: PublicCalendarLinkMutationInput & { linkId: string }): Promise<PublicCalendarLinkActionResult> {
  try {
    const parsed = mutationSchema.extend({ linkId: z.uuid() }).parse(input);
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    const daypartIds = normalizedDaypartIds(parsed.scope, parsed.daypartIds);
    const database = getDb();
    await database.transaction(async (tx) => {
      await requireShareableResidency(tx, parsed.residencyId);
      await requireAvailableDayparts(tx, parsed.residencyId, daypartIds);
      const [updated] = await tx.update(publicCalendarLinks).set({
        name: parsed.name,
        scope: parsed.scope,
        updatedByUserId: actor.userId,
        updatedAt: new Date(),
      }).where(and(
        eq(publicCalendarLinks.id, parsed.linkId),
        eq(publicCalendarLinks.residencyId, parsed.residencyId),
        isNull(publicCalendarLinks.revokedAt),
      )).returning({ id: publicCalendarLinks.id });
      if (!updated) throw new CalendarLinkOperationError("This calendar link is no longer active.");
      await tx.delete(publicCalendarLinkDayparts).where(eq(publicCalendarLinkDayparts.linkId, parsed.linkId));
      if (daypartIds.length) {
        await tx.insert(publicCalendarLinkDayparts).values(daypartIds.map((daypartId) => ({
          linkId: parsed.linkId,
          residencyId: parsed.residencyId,
          daypartId,
        })));
      }
      await tx.insert(auditLog).values({
        residencyId: parsed.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "public_calendar_link_updated",
        entityType: "public_calendar_link",
        entityId: parsed.linkId,
        details: { linkName: parsed.name, scope: parsed.scope, daypartIds },
      });
    });
    revalidateCalendarSharing();
    return {
      status: "success",
      message: `${parsed.name} was updated. Its URL did not change.`,
      link: await managedLink(parsed.residencyId, parsed.linkId),
    };
  } catch (error) {
    return errorResult(error, "Unable to update this calendar link.");
  }
}

export async function copyPublicCalendarLinkAction(input: PublicCalendarLinkTargetInput): Promise<PublicCalendarLinkActionResult> {
  try {
    const parsed = targetSchema.parse(input);
    await requireActorForResidency(parsed.residencyId, { manager: true });
    const [link] = await getDb().select({
      name: publicCalendarLinks.name,
      tokenHash: publicCalendarLinks.tokenHash,
      tokenCiphertext: publicCalendarLinks.tokenCiphertext,
    }).from(publicCalendarLinks).where(and(
      eq(publicCalendarLinks.id, parsed.linkId),
      eq(publicCalendarLinks.residencyId, parsed.residencyId),
      isNull(publicCalendarLinks.revokedAt),
    )).limit(1);
    if (!link) throw new CalendarLinkOperationError("This calendar link is no longer active.");
    if (!link.tokenCiphertext) {
      throw new CalendarLinkOperationError("This older link cannot be displayed. Replace its URL once to make it reusable.");
    }
    const token = decryptPublicCalendarToken(link.tokenCiphertext, link.tokenHash);
    return {
      status: "success",
      message: `${link.name} is ready to copy.`,
      url: new URL(`/share/calendar/${token}`, requestOrigin(await headers())).toString(),
    };
  } catch (error) {
    return errorResult(error, "Unable to retrieve this calendar link.");
  }
}

export async function stopPublicCalendarLinkAction(input: PublicCalendarLinkTargetInput): Promise<PublicCalendarLinkActionResult> {
  try {
    const parsed = targetSchema.parse(input);
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    const database = getDb();
    await database.transaction(async (tx) => {
      await requireShareableResidency(tx, parsed.residencyId);
      const stoppedAt = new Date();
      const [stopped] = await tx.update(publicCalendarLinks).set({
        tokenCiphertext: null,
        revokedAt: stoppedAt,
        revokedByUserId: actor.userId,
        updatedByUserId: actor.userId,
        updatedAt: stoppedAt,
      }).where(and(
        eq(publicCalendarLinks.id, parsed.linkId),
        eq(publicCalendarLinks.residencyId, parsed.residencyId),
        isNull(publicCalendarLinks.revokedAt),
      )).returning({ id: publicCalendarLinks.id, name: publicCalendarLinks.name });
      if (!stopped) throw new CalendarLinkOperationError("This calendar link is already stopped.");
      await tx.insert(auditLog).values({
        residencyId: parsed.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "public_calendar_link_stopped",
        entityType: "public_calendar_link",
        entityId: parsed.linkId,
        details: { linkName: stopped.name },
      });
    });
    revalidateCalendarSharing();
    return {
      status: "success",
      message: "Sharing was stopped. The old URL no longer works.",
      link: await managedLink(parsed.residencyId, parsed.linkId),
    };
  } catch (error) {
    return errorResult(error, "Unable to stop this calendar link.");
  }
}

export async function replacePublicCalendarLinkAction(input: PublicCalendarLinkTargetInput): Promise<PublicCalendarLinkActionResult> {
  try {
    const parsed = targetSchema.parse(input);
    const actor = await requireActorForResidency(parsed.residencyId, { manager: true });
    const { token, tokenHash } = issuePublicCalendarToken();
    const tokenCiphertext = encryptPublicCalendarToken(token);
    const database = getDb();
    await database.transaction(async (tx) => {
      await requireShareableResidency(tx, parsed.residencyId);
      const rotatedAt = new Date();
      const [replaced] = await tx.update(publicCalendarLinks).set({
        tokenHash,
        tokenCiphertext,
        rotatedByUserId: actor.userId,
        rotatedAt,
        updatedByUserId: actor.userId,
        updatedAt: rotatedAt,
      }).where(and(
        eq(publicCalendarLinks.id, parsed.linkId),
        eq(publicCalendarLinks.residencyId, parsed.residencyId),
        isNull(publicCalendarLinks.revokedAt),
      )).returning({ id: publicCalendarLinks.id, name: publicCalendarLinks.name });
      if (!replaced) throw new CalendarLinkOperationError("This calendar link is no longer active.");
      await tx.insert(auditLog).values({
        residencyId: parsed.residencyId,
        actorUserId: actor.userId,
        actorLabel: actor.email,
        action: "public_calendar_link_replaced",
        entityType: "public_calendar_link",
        entityId: parsed.linkId,
        details: { linkName: replaced.name },
      });
    });
    revalidateCalendarSharing();
    return {
      status: "success",
      message: "A new URL was created. The previous URL no longer works.",
      link: await managedLink(parsed.residencyId, parsed.linkId),
      url: new URL(`/share/calendar/${token}`, requestOrigin(await headers())).toString(),
    };
  } catch (error) {
    return errorResult(error, "Unable to replace this calendar link.");
  }
}
