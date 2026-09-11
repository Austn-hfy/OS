import { addDays } from "./airtable-parity";
import { localDateKey } from "./time";

export const SHIFT_CHANGE_REQUEST_TYPES = ["change_time", "cancel_occurrence", "delete_permanent"] as const;

export type ShiftChangeRequestType = (typeof SHIFT_CHANGE_REQUEST_TYPES)[number];

export function shiftChangeRequestTypeLabel(requestType: ShiftChangeRequestType) {
  if (requestType === "change_time") return "Change time";
  if (requestType === "cancel_occurrence") return "Cancel this occurrence";
  return "Delete permanently";
}

export type ShiftChangeRequestInput = {
  requestType: ShiftChangeRequestType;
  managerNote: string;
  proposedStartAt: Date | null;
  proposedEndAt: Date | null;
};

function validDate(value: Date | null): value is Date {
  return value !== null && Number.isFinite(value.getTime());
}

function localClockMinute(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return (hour * 60) + minute;
}

export function prepareShiftChangeRequest(
  input: ShiftChangeRequestInput,
  shift: { serviceDate: string; timezone: string },
) {
  const managerNote = input.managerNote.trim();
  if (!managerNote) throw new Error("Tell HFY why you are requesting this change.");

  if (input.requestType !== "change_time") {
    if (input.proposedStartAt !== null || input.proposedEndAt !== null) {
      throw new Error("Proposed hours can only be included with a Change time request.");
    }
    return { ...input, managerNote, proposedStartAt: null, proposedEndAt: null };
  }

  if (!validDate(input.proposedStartAt) || !validDate(input.proposedEndAt)) {
    throw new Error("Choose proposed start and end times.");
  }
  if (input.proposedEndAt <= input.proposedStartAt) {
    throw new Error("Proposed end must be after start.");
  }

  const nextServiceDate = addDays(shift.serviceDate, 1);
  const startDate = localDateKey(input.proposedStartAt, shift.timezone);
  const endDate = localDateKey(input.proposedEndAt, shift.timezone);
  const startMinute = localClockMinute(input.proposedStartAt, shift.timezone);
  const endMinute = localClockMinute(input.proposedEndAt, shift.timezone) + (endDate === nextServiceDate ? 1_440 : 0);
  if (startDate !== shift.serviceDate
    || (endDate !== shift.serviceDate && endDate !== nextServiceDate)
    || endMinute <= startMinute
    || endMinute > startMinute + 1_440) {
    throw new Error("Choose valid proposed hours for this Shift date.");
  }

  return { ...input, managerNote };
}
