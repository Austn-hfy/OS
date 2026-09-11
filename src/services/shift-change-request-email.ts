import { requiredEnv } from "@/lib/env";
import { sendEmail } from "@/services/outbound-email";
import type { ShiftChangeRequestDecision } from "@/services/shift-change-requests";
import { shiftChangeRequestTypeLabel } from "@/domain/shift-change-requests";

export const SHIFT_CHANGE_REQUEST_OWNER_EMAIL = "austyn@hearforyou.group";

type RequestEmailDetails = {
  requestId: string;
  requestType: "change_time" | "cancel_occurrence" | "delete_permanent";
  residencyName: string;
  shiftName: string;
  room: string;
  serviceDate: string;
  managerNote: string;
};

type SubmissionEmailInput = RequestEmailDetails & {
  requestedByName: string;
  proposedStartAt: Date | null;
  proposedEndAt: Date | null;
  residencyTimezone: string;
  queueUrl: string;
};

type ResolutionEmailInput = RequestEmailDetails & {
  decision: ShiftChangeRequestDecision;
  resolutionNote: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function displayTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(value);
}

export function buildShiftChangeRequestSubmittedEmail(input: SubmissionEmailInput) {
  const proposedTime = input.requestType === "change_time" && input.proposedStartAt && input.proposedEndAt
    ? `<p><strong>Proposed time:</strong> ${escapeHtml(displayTime(input.proposedStartAt, input.residencyTimezone))}–${escapeHtml(displayTime(input.proposedEndAt, input.residencyTimezone))}</p>`
    : "";
  return {
    subject: `${input.residencyName} submitted a Shift request`,
    html: [
      `<p><strong>${escapeHtml(input.requestedByName)}</strong> submitted a Shift request for <strong>${escapeHtml(input.residencyName)}</strong>.</p>`,
      `<p><strong>Shift:</strong> ${escapeHtml(input.shiftName)} · ${escapeHtml(input.serviceDate)} · ${escapeHtml(input.room)}</p>`,
      `<p><strong>Request:</strong> ${escapeHtml(shiftChangeRequestTypeLabel(input.requestType))}</p>`,
      proposedTime,
      `<p><strong>Manager note:</strong><br>${escapeHtml(input.managerNote)}</p>`,
      `<p><a href="${escapeHtml(input.queueUrl)}">Open the HFY request queue</a></p>`,
    ].join(""),
  };
}

export function buildShiftChangeRequestResolvedEmail(input: ResolutionEmailInput) {
  const outcome = input.decision === "approved" ? "approved" : "denied";
  return {
    subject: `Your ${input.residencyName} Shift request was ${outcome}`,
    html: [
      `<p>Your request for <strong>${escapeHtml(input.shiftName)}</strong> on ${escapeHtml(input.serviceDate)} was <strong>${outcome}</strong>.</p>`,
      `<p><strong>Request:</strong> ${escapeHtml(shiftChangeRequestTypeLabel(input.requestType))}</p>`,
      input.resolutionNote
        ? `<p><strong>HFY note:</strong><br>${escapeHtml(input.resolutionNote)}</p>`
        : "<p>HFY did not add a resolution note.</p>",
      input.decision === "approved"
        ? "<p>The approved schedule change has been applied.</p>"
        : "<p>No changes were made to the Shift.</p>",
    ].join(""),
  };
}

function queueUrl() {
  return new URL("/app?mode=hfy#shift-change-requests", requiredEnv("NEXT_PUBLIC_APP_URL")).toString();
}

export async function sendShiftChangeRequestSubmittedEmail(input: Omit<SubmissionEmailInput, "queueUrl">) {
  const content = buildShiftChangeRequestSubmittedEmail({ ...input, queueUrl: queueUrl() });
  const result = await sendEmail({
    from: requiredEnv("INVOICE_FROM_EMAIL"),
    to: SHIFT_CHANGE_REQUEST_OWNER_EMAIL,
    replyTo: process.env.INVOICE_REPLY_TO || "support@hearforyou.group",
    subject: content.subject,
    html: content.html,
  }, { idempotencyKey: `shift-change-request/${input.requestId}/submitted` });
  if (result.error) throw new Error(result.error.message);
  return { providerMessageId: result.data?.id ?? null };
}

export async function sendShiftChangeRequestResolvedEmail(input: ResolutionEmailInput & { to: string }) {
  const content = buildShiftChangeRequestResolvedEmail(input);
  const result = await sendEmail({
    from: requiredEnv("INVOICE_FROM_EMAIL"),
    to: input.to,
    replyTo: process.env.INVOICE_REPLY_TO || "support@hearforyou.group",
    subject: content.subject,
    html: content.html,
  }, { idempotencyKey: `shift-change-request/${input.requestId}/${input.decision}` });
  if (result.error) throw new Error(result.error.message);
  return { providerMessageId: result.data?.id ?? null };
}
