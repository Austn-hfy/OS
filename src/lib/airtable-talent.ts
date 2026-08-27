export type AirtableAttachment = {
  id: string;
  url: string;
  filename: string;
  type: string;
  size: number | null;
};

export type AirtableTalentRecord = {
  id: string;
  fields: Record<string, unknown>;
};

function selectionName(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value && typeof value.name === "string") return value.name;
  return "";
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("\n");
  return selectionName(value).trim();
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return textValue(value) ? [textValue(value)] : [];
  return value.map(selectionName).map((item) => item.trim()).filter(Boolean);
}

function moneyCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value * 100));
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + moneyCents(item), 0);
  const normalized = textValue(value).replace(/[$,]/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Could not parse Airtable currency value: ${textValue(value)}`);
  return Math.max(0, Math.round(parsed * 100));
}

function attachments(value: unknown): AirtableAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const attachment = item as Record<string, unknown>;
    if (typeof attachment.id !== "string" || typeof attachment.url !== "string") return [];
    return [{
      id: attachment.id,
      url: attachment.url,
      filename: typeof attachment.filename === "string" ? attachment.filename : attachment.id,
      type: typeof attachment.type === "string" ? attachment.type : "application/octet-stream",
      size: typeof attachment.size === "number" ? attachment.size : null,
    }];
  });
}

export function parseAirtableTalentRecord(record: AirtableTalentRecord) {
  const fields = record.fields;
  const stageName = textValue(fields["Stage Name"]);
  if (!record.id || !stageName) throw new Error("Every Airtable Talent record must have an ID and Stage Name.");
  const rosterName = selectionName(fields["Roster Status"]).toLowerCase();
  const statusName = selectionName(fields["Talent Status"]).toLowerCase();
  const achAccountNumber = textValue(fields["ACH Account Number"]);
  const priorityText = textValue(fields.Priority);
  const priorityNumber = priorityText ? Number(priorityText) : null;
  const priority = priorityNumber !== null && Number.isInteger(priorityNumber) && priorityNumber >= 1 && priorityNumber <= 5
    ? priorityNumber
    : null;

  return {
    airtableRecordId: record.id,
    stageName,
    fullName: textValue(fields["Full Name"]),
    email: textValue(fields.Email),
    phone: textValue(fields.Phone),
    instagramHandle: textValue(fields["Instagram Handle"]),
    rosterStatus: rosterName.includes("ready") ? "ready" as const : "needs_review" as const,
    talentStatus: statusName.includes("inactive") ? "inactive" as const : "active" as const,
    homeMarket: selectionName(fields["Home Market"]) || textValue(fields["Home Market"]),
    genres: stringList(fields.Genres),
    priority,
    talentNotes: textValue(fields["Talent Notes"]),
    legacyOutstandingOwedCents: moneyCents(fields["Total Outstanding Owed"]),
    legacyTotalEarningsCents: moneyCents(fields["Total Earnings (All Time)"]),
    legacyOwedFrom: textValue(fields["Owed From"]),
    legacyUpcomingBookings: textValue(fields["Upcoming Bookings"]),
    payment: {
      paymentMethod: selectionName(fields["Payment Method"]) || textValue(fields["Payment Method"]),
      zelleEmail: textValue(fields["Zelle Email"]),
      zellePhone: textValue(fields["Zelle Phone"]),
      achAccountName: textValue(fields["ACH Account Name"]),
      achRoutingNumber: textValue(fields["ACH Routing Number"]),
      achAccountNumber,
      lastFour: achAccountNumber.replace(/\D/g, "").slice(-4),
    },
    w9Attachments: attachments(fields["W-9"]),
  };
}

export function parseAirtableTalentExport(value: unknown) {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "records" in value && Array.isArray(value.records)
      ? value.records
      : null;
  if (!records) throw new Error("Airtable Talent export must be an array or an object with a records array.");
  const parsed = records.map((record) => parseAirtableTalentRecord(record as AirtableTalentRecord));
  const recordIds = new Set<string>();
  for (const record of parsed) {
    if (recordIds.has(record.airtableRecordId)) throw new Error(`Duplicate Airtable record ID: ${record.airtableRecordId}`);
    recordIds.add(record.airtableRecordId);
  }
  return parsed;
}
