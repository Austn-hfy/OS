import { and, eq, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { clientAccounts, daypartDayRules, dayparts, residencies } from "../src/db/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const sqlClient = postgres(databaseUrl, { prepare: false, max: 1 });
const database = drizzle(sqlClient);

const schedule = [
  {
    name: "Pool",
    room: "Pool",
    color: "#2783DC",
    sortOrder: 10,
    rules: [
      { weekday: 5, startMinute: 12 * 60, endMinute: 19 * 60, defaultDjCount: 2 },
      { weekday: 6, startMinute: 12 * 60, endMinute: 19 * 60, defaultDjCount: 2 },
      { weekday: 0, startMinute: 12 * 60, endMinute: 19 * 60, defaultDjCount: 2 },
    ],
  },
  {
    name: "Amigo Room",
    room: "Amigo Room",
    color: "#E98332",
    sortOrder: 20,
    rules: [
      { weekday: 5, startMinute: 21 * 60, endMinute: 24 * 60, defaultDjCount: 1 },
      { weekday: 6, startMinute: 21 * 60, endMinute: 24 * 60, defaultDjCount: 1 },
    ],
  },
] as const;

try {
  const residencyId = await database.transaction(async (tx) => {
    let [residency] = await tx.select({ id: residencies.id }).from(residencies)
      .where(eq(residencies.slug, "ace-hotel-parity")).limit(1);

    if (!residency) {
      const [account] = await tx.insert(clientAccounts).values({
        name: "Ace Hotel (Parity Sandbox)",
        internalNotes: "Build-and-prove fixture only. Ace remains operationally live in Airtable.",
      }).returning({ id: clientAccounts.id });
      [residency] = await tx.insert(residencies).values({
        clientAccountId: account.id,
        slug: "ace-hotel-parity",
        name: "Ace Hotel — Parity Sandbox",
        cityState: "Palm Springs, CA",
        timezone: "America/Los_Angeles",
        tier: "operations_only",
        defaultTalentRateCents: 8000,
        clientHourlyRateCents: 0,
        paymentTermsDays: 7,
        invoiceFrequency: "weekly",
        billingCycleStartWeekday: 5,
        billingCycleLengthDays: 3,
        invoiceLinePresentation: "service_detail",
        defaultInvoiceNote: "Programming services for the billing period shown.",
        billingContactName: "Ace accounting (parity sandbox)",
        billingContactEmail: "ace-parity-billing@example.invalid",
        invoicePrefix: "ACE-PARITY",
        autoSendInvoices: false,
        autoSendReason: "Ace exception: invoices are sent manually while billing structure is in flux.",
        internalNotes: "Not a cutover, migration, sync, or operational Ace record. Client rate must be set from an approved commercial agreement before any real billing use.",
      }).returning({ id: residencies.id });
    } else {
      await tx.update(residencies).set({
        defaultTalentRateCents: 8000,
        paymentTermsDays: 7,
        invoiceFrequency: "weekly",
        billingCycleStartWeekday: 5,
        billingCycleLengthDays: 3,
        invoiceLinePresentation: "service_detail",
        defaultInvoiceNote: "Programming services for the billing period shown.",
        billingContactName: "Ace accounting (parity sandbox)",
        billingContactEmail: "ace-parity-billing@example.invalid",
        autoSendInvoices: false,
        autoSendReason: "Ace exception: invoices are sent manually while billing structure is in flux.",
        updatedAt: new Date(),
      }).where(eq(residencies.id, residency.id));
    }

    for (const definition of schedule) {
      let [daypart] = await tx.select({ id: dayparts.id }).from(dayparts).where(and(
        eq(dayparts.residencyId, residency.id),
        eq(dayparts.name, definition.name),
      )).limit(1);
      if (daypart) {
        await tx.update(dayparts).set({
          room: definition.room,
          color: definition.color,
          defaultTalentRateCents: null,
          activeUntil: null,
          active: true,
          sortOrder: definition.sortOrder,
          updatedAt: new Date(),
        }).where(eq(dayparts.id, daypart.id));
      } else {
        [daypart] = await tx.insert(dayparts).values({
          residencyId: residency.id,
          name: definition.name,
          room: definition.room,
          color: definition.color,
          defaultTalentRateCents: null,
          activeUntil: null,
          active: true,
          sortOrder: definition.sortOrder,
        }).returning({ id: dayparts.id });
      }

      for (const rule of definition.rules) {
        await tx.insert(daypartDayRules).values({ daypartId: daypart.id, ...rule }).onConflictDoUpdate({
          target: [daypartDayRules.daypartId, daypartDayRules.weekday],
          set: { ...rule, updatedAt: new Date() },
        });
      }
      await tx.delete(daypartDayRules).where(and(
        eq(daypartDayRules.daypartId, daypart.id),
        notInArray(daypartDayRules.weekday, definition.rules.map((rule) => rule.weekday)),
      ));
    }
    return residency.id;
  });

  process.stdout.write(`Ace parity sandbox ready (${residencyId}). No Airtable data was read or changed.\n`);
} finally {
  await sqlClient.end();
}
