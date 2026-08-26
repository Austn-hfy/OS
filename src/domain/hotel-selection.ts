import { z } from "zod";

export const hotelSelectionSchema = z.object({
  shiftId: z.uuid(),
  talentId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export type HotelSelectionInput = z.infer<typeof hotelSelectionSchema>;

export function validateSelectionWindow(
  selection: HotelSelectionInput,
  shift: { startsAt: Date; endsAt: Date },
  now = new Date(),
): string | null {
  const startsAt = new Date(selection.startsAt);
  const endsAt = new Date(selection.endsAt);
  if (endsAt <= startsAt) return "End time must be after start time.";
  if (startsAt < shift.startsAt || endsAt > shift.endsAt) return "The selected time must stay within the scheduled Shift.";
  if (endsAt <= now) return "The selected time must be in the future.";
  return null;
}
