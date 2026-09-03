import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assertSafeSyncApiEnvironment,
  assertSafeSyncEnvironment,
  buildStagingResidencyPlan,
  formatDryRunReport,
  sanitizeTalent,
  stagingSyncKey,
  stagingSyncUuid,
  supabaseProjectRefFromApiUrl,
  supabaseProjectRefFromDatabaseUrl,
  type ExistingStagingState,
  type ProductionStructureSnapshot,
  type SourceResidency,
  type SourceTalent,
} from "../src/domain/staging-structure-sync";

const ace: SourceResidency = {
  id: "11111111-1111-4111-8111-111111111111",
  clientAccountId: "22222222-2222-4222-8222-222222222222",
  slug: "ace-hotel",
  name: "Ace Hotel.",
  cityState: "Palm Springs, CA",
  timezone: "America/Los_Angeles",
  tier: "operations_only",
  operatingMode: "operations",
  active: true,
  leadSource: "inbound",
  pipelineStatus: "won",
  pipelineStatusChangedAt: new Date("2026-08-01T12:00:00.000Z"),
  convertedAt: new Date("2026-08-02T12:00:00.000Z"),
  defaultTalentRateCents: 8_000,
  clientHourlyRateCents: 10_000,
  paymentTermsDays: 7,
  invoiceFrequency: "weekly",
  billingCycleStartWeekday: 1,
  billingCycleLengthDays: 7,
  invoiceLinePresentation: "service_detail",
  defaultInvoiceNote: "Approved service note",
  schedulingPattern: "client_supplied",
  invoicePrefix: "ACE",
  clientPaymentStatusVisible: true,
};

const artist: SourceTalent = {
  id: "33333333-3333-4333-8333-333333333333",
  stageName: "Test Selector",
  ownership: "hfy",
  owningResidencyId: null,
  exclusiveResidencyId: null,
  rosterStatus: "ready",
  talentStatus: "active",
  archivedAt: null,
  homeMarket: "Los Angeles, CA",
  genres: ["Electronic/House"],
  priority: 2,
  hasPaymentProfile: true,
  paymentMethod: "ACH",
  hasTaxDocument: true,
};

const snapshot: ProductionStructureSnapshot = {
  clientAccounts: [
    { id: ace.clientAccountId, name: "Ace Hotel", active: true },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Do Not Touch", active: true },
  ],
  residencies: [
    ace,
    { ...ace, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", clientAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "test-1", name: "Test 1", invoicePrefix: "TEST1" },
  ],
  dayparts: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      residencyId: ace.id,
      name: "Pool",
      room: "Pool",
      color: "#2783DC",
      type: "dj_artist",
      billingMode: "tracking_only",
      scheduleMode: "standing_weekly",
      suggestedStartMinute: null,
      suggestedEndMinute: null,
      defaultTalentRateCents: null,
      clientDefaultRateCents: 8_000,
      activeUntil: null,
      active: true,
      sortOrder: 10,
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      residencyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Test-only Daypart",
      room: "Test Room",
      color: "#000000",
      type: "house_activity",
      billingMode: null,
      scheduleMode: "calendar_only",
      suggestedStartMinute: 600,
      suggestedEndMinute: 660,
      defaultTalentRateCents: null,
      clientDefaultRateCents: null,
      activeUntil: null,
      active: true,
      sortOrder: 1,
    },
  ],
  dayRules: [{
    id: "55555555-5555-4555-8555-555555555555",
    daypartId: "44444444-4444-4444-8444-444444444444",
    weekday: 5,
    startMinute: 720,
    endMinute: 1_140,
    defaultDjCount: 2,
  }],
  dateExceptions: [{
    id: "66666666-6666-4666-8666-666666666666",
    daypartId: "44444444-4444-4444-8444-444444444444",
    serviceDate: "2026-09-04",
    kind: "override",
    startMinute: 780,
    endMinute: 1_080,
  }],
  talent: [artist],
  rosterAssignments: [{ residencyId: ace.id, talentId: artist.id, active: true, clientVisible: true }],
};

const emptyTarget: ExistingStagingState = {
  residencyId: null,
  clientAccountId: null,
  clientAccountSharedWithOtherResidency: false,
  dayparts: [],
  talent: [],
  rosterAssignments: [],
};

describe("staging production-structure sync", () => {
  it("accepts only the explicitly approved production-to-staging project direction", () => {
    const productionDirect = "postgresql://postgres:secret@db.tkfsgifnywbwjdkxjhae.supabase.co:5432/postgres";
    const productionPooled = "postgresql://postgres.tkfsgifnywbwjdkxjhae:secret@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
    const restrictedProductionPooled = "postgresql://hfy_staging_structure_reader.tkfsgifnywbwjdkxjhae:secret@aws-0-us-west-1.pooler.supabase.com:6543/postgres";
    const restrictedProductionDedicated = "postgresql://hfy_staging_structure_reader:secret@db.tkfsgifnywbwjdkxjhae.supabase.co:6543/postgres";
    const stagingDirect = "postgresql://postgres:secret@db.ucrtbevvdfkceudknyxe.supabase.co:5432/postgres";
    expect(supabaseProjectRefFromDatabaseUrl(productionDirect)).toBe("tkfsgifnywbwjdkxjhae");
    expect(supabaseProjectRefFromDatabaseUrl(productionPooled)).toBe("tkfsgifnywbwjdkxjhae");
    expect(supabaseProjectRefFromDatabaseUrl(restrictedProductionPooled)).toBe("tkfsgifnywbwjdkxjhae");
    expect(supabaseProjectRefFromDatabaseUrl(restrictedProductionDedicated)).toBe("tkfsgifnywbwjdkxjhae");
    expect(() => assertSafeSyncEnvironment(productionDirect, stagingDirect)).not.toThrow();
    expect(() => assertSafeSyncEnvironment(stagingDirect, productionDirect)).toThrow(/production project/i);
    expect(() => assertSafeSyncEnvironment(productionDirect, productionDirect)).toThrow();
    expect(() => assertSafeSyncEnvironment("not-a-url", stagingDirect)).toThrow(/production project/i);
  });

  it("accepts only the approved production API source and staging database destination", () => {
    const stagingDirect = "postgresql://postgres:secret@db.ucrtbevvdfkceudknyxe.supabase.co:5432/postgres";
    expect(supabaseProjectRefFromApiUrl("https://tkfsgifnywbwjdkxjhae.supabase.co")).toBe("tkfsgifnywbwjdkxjhae");
    expect(() => assertSafeSyncApiEnvironment(
      "https://tkfsgifnywbwjdkxjhae.supabase.co",
      stagingDirect,
    )).not.toThrow();
    expect(() => assertSafeSyncApiEnvironment(
      "https://ucrtbevvdfkceudknyxe.supabase.co",
      stagingDirect,
    )).toThrow(/approved HFY production project/);
  });

  it("creates deterministic fake artist identities without accepting production contact or payment values", () => {
    const first = sanitizeTalent(artist, ace.id, stagingSyncUuid("residency", ace.id));
    const second = sanitizeTalent(artist, ace.id, stagingSyncUuid("residency", ace.id));
    expect(first).toEqual(second);
    expect(first.stageName).toBe(artist.stageName);
    expect(first.genres).toEqual(artist.genres);
    expect(first.homeMarket).toBe(artist.homeMarket);
    expect(first.email).toMatch(/@example\.invalid$/);
    expect(first.phone).toMatch(/^\+1-202-555-01\d{2}$/);
    expect(first.instagramHandle).toMatch(/^staging_/);
    expect(first.paymentProfile).toMatchObject({ achRoutingNumber: "110000000", paymentMethod: "ACH" });
    expect(first.hadProductionTaxDocument).toBe(true);
    expect(JSON.stringify(first)).not.toContain(artist.id);
  });

  it("plans only the selected Residency while preserving its schedules and roster shape", () => {
    const plan = buildStagingResidencyPlan(snapshot, ace.id, emptyTarget);
    expect(plan.residency.slug).toBe("ace-hotel");
    expect(plan.residency.autoSendInvoices).toBe(false);
    expect(plan.residency.primaryContactEmail).toMatch(/@example\.invalid$/);
    expect(plan.dayparts.map((daypart) => daypart.name)).toEqual(["Pool"]);
    expect(plan.dayRules).toHaveLength(1);
    expect(plan.dateExceptions).toHaveLength(1);
    expect(plan.talent).toHaveLength(1);
    expect(plan.rosterAssignments).toHaveLength(1);
    expect(plan.report.nonSelectedResidenciesTouched).toBe(0);
    expect(JSON.stringify(plan)).not.toContain("Test-only Daypart");
  });

  it("refreshes deterministically without duplicating previously synced records", () => {
    const first = buildStagingResidencyPlan(snapshot, ace.id, emptyTarget);
    const target: ExistingStagingState = {
      residencyId: first.residencyId,
      clientAccountId: first.clientAccountId,
      clientAccountSharedWithOtherResidency: false,
      dayparts: first.dayparts.map((daypart) => ({ id: daypart.id, name: daypart.name, active: daypart.active })),
      talent: first.talent.map((item) => ({ id: item.id, airtableRecordId: item.stagingSyncKey })),
      rosterAssignments: first.rosterAssignments.map((assignment) => ({
        talentId: assignment.talentId,
        active: assignment.active,
        clientVisible: assignment.clientVisible,
      })),
    };
    const second = buildStagingResidencyPlan(snapshot, ace.id, target);
    expect(second.residencyId).toBe(first.residencyId);
    expect(second.dayparts).toEqual(first.dayparts);
    expect(second.talent).toEqual(first.talent);
    expect(second.rosterAssignments).toEqual(first.rosterAssignments);
    expect(second.report.daypartsToCreate).toBe(0);
    expect(second.report.artistsToCreate).toBe(0);
  });

  it("adopts a same-name staging Daypart but deactivates other selected-Residency extras", () => {
    const target: ExistingStagingState = {
      ...emptyTarget,
      residencyId: "77777777-7777-4777-8777-777777777777",
      clientAccountId: "88888888-8888-4888-8888-888888888888",
      clientAccountSharedWithOtherResidency: false,
      dayparts: [
        { id: "99999999-9999-4999-8999-999999999999", name: "pool", active: true },
        { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", name: "Staging experiment", active: true },
      ],
      rosterAssignments: [{ talentId: "ffffffff-ffff-4fff-8fff-ffffffffffff", active: true, clientVisible: true }],
    };
    const plan = buildStagingResidencyPlan(snapshot, ace.id, target);
    expect(plan.dayparts[0]?.id).toBe("99999999-9999-4999-8999-999999999999");
    expect(plan.report.stagingOnlyDaypartsToDeactivate).toBe(1);
    expect(plan.report.stagingOnlyRosterAssignmentsToDeactivate).toBe(1);
  });

  it("fails closed when a deterministic sync ID collides with an unrelated staging artist", () => {
    const target: ExistingStagingState = {
      ...emptyTarget,
      talent: [{ id: stagingSyncUuid("talent", artist.id), airtableRecordId: "unrelated-record" }],
    };
    expect(() => buildStagingResidencyPlan(snapshot, ace.id, target)).toThrow(/occupied by a non-sync record/i);
  });

  it("does not mutate a client account shared with another staging Residency", () => {
    const target: ExistingStagingState = {
      ...emptyTarget,
      residencyId: "77777777-7777-4777-8777-777777777777",
      clientAccountId: "88888888-8888-4888-8888-888888888888",
      clientAccountSharedWithOtherResidency: true,
    };
    const plan = buildStagingResidencyPlan(snapshot, ace.id, target);
    expect(plan.clientAccountId).not.toBe(target.clientAccountId);
    expect(plan.clientAccountId).toBe(stagingSyncUuid("client-account", ace.clientAccountId));
  });

  it("reports the privacy boundary without exposing source identifiers", () => {
    const plan = buildStagingResidencyPlan(snapshot, ace.id, emptyTarget);
    const report = formatDryRunReport([plan], false);
    expect(report).toContain("DRY RUN — no staging writes");
    expect(report).toContain("Production W-9/tax files read or downloaded: 0");
    expect(report).toContain("Non-selected staging Residencies touched: 0");
    expect(report).not.toContain(ace.id);
    expect(report).not.toContain(artist.id);
  });

  it("keeps source reads allowlisted and all staging writes inside one transaction", async () => {
    const script = await readFile(new URL("../scripts/sync-staging-structure.ts", import.meta.url), "utf8");
    const sourceReader = script.slice(script.indexOf("async function loadProductionSnapshot"), script.indexOf("async function loadExistingStagingState"));
    const apiSourceReader = script.slice(script.indexOf("async function loadProductionSnapshotFromApi"), script.indexOf("async function loadExistingStagingState"));
    expect(sourceReader).not.toMatch(/select\s+\*/i);
    expect(sourceReader).not.toMatch(/primary_contact|billing_contact|email|phone|ach_|zelle_|storage_path|legacy_|internal_notes|talent_notes/i);
    expect(apiSourceReader).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.rpc\(/);
    expect(script).toContain('production.begin("read only"');
    expect(script).toContain("await staging.begin(async (tx)");
    expect(script).toContain("pg_advisory_xact_lock");
    expect(script).not.toMatch(/delete from residencies/i);
    expect(script).not.toMatch(/delete from talent\s/i);
    expect(script).toContain("--all requires --confirm-all-residencies");
    expect(script).toContain("formatDryRunReport(plans, apply)");
    expect(script).toContain("applyResidencyPlan(tx, plan, stagingEncryptionKey)");
    expect(script.indexOf("applyResidencyPlan(tx, plan, stagingEncryptionKey)")).toBeGreaterThan(script.indexOf("await staging.begin(async (tx)"));
  });

  it("exposes only the allowlisted structure through a dedicated restricted production function", async () => {
    const migration = await readFile(new URL("../drizzle/0035_staging_structure_export.sql", import.meta.url), "utf8");
    const exportedFunction = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION private.hfy_staging_structure_snapshot"),
      migration.indexOf("REVOKE ALL ON FUNCTION"),
    );
    expect(exportedFunction).not.toMatch(/primary_contact|billing_contact|\bemail\b|\bphone\b|ach_|zelle_|storage_path|legacy_|internal_notes|talent_notes/i);
    expect(exportedFunction).toContain("hasPaymentProfile");
    expect(exportedFunction).toContain("hasTaxDocument");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION private.hfy_staging_structure_snapshot(text) FROM PUBLIC");
    expect(migration).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hfy_staging_structure_exporter");
    expect(migration).toContain("default_transaction_read_only = on");
  });

  it("uses a stable, non-production identifier for every synced entity", () => {
    expect(stagingSyncUuid("talent", artist.id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stagingSyncUuid("talent", artist.id)).not.toBe(artist.id);
    expect(stagingSyncKey(artist.id)).toMatch(/^staging-sync-[0-9a-f]{24}$/);
  });
});
