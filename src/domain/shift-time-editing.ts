import { calculateBillableAmountCents, calculateCompensationCents } from "./airtable-parity";

export type ShiftTimeEditAssignment = {
  id: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
  compensationType: "hourly" | "fixed" | "na";
  talentRateCents: number;
  fixedFeeCents: number | null;
  totalCompensationCents: number;
};

export type ShiftTimeEditPlan = {
  oldStartsAt: Date;
  oldEndsAt: Date;
  newStartsAt: Date;
  newEndsAt: Date;
  oldClientBilledTotalCents: number;
  newClientBilledTotalCents: number;
  oldTalentCompensationTotalCents: number;
  newTalentCompensationTotalCents: number;
  assignments: Array<{
    id: string;
    label: string;
    oldStartsAt: Date;
    oldEndsAt: Date;
    newStartsAt: Date;
    newEndsAt: Date;
    oldTotalCompensationCents: number;
    newTotalCompensationCents: number;
    windowAdjusted: boolean;
  }>;
};

function validDate(value: Date) {
  return Number.isFinite(value.getTime());
}

export function planShiftTimeEdit(input: {
  oldStartsAt: Date;
  oldEndsAt: Date;
  newStartsAt: Date;
  newEndsAt: Date;
  clientRateCents: number;
  assignments: ShiftTimeEditAssignment[];
}): ShiftTimeEditPlan {
  if (!validDate(input.newStartsAt) || !validDate(input.newEndsAt) || input.newEndsAt <= input.newStartsAt) {
    throw new Error("Shift end must be after start.");
  }

  const plannedAssignments = input.assignments.map((assignment) => {
    if (!validDate(assignment.startsAt) || !validDate(assignment.endsAt) || assignment.endsAt <= assignment.startsAt) {
      throw new Error(`${assignment.label || "An Assignment"} has invalid saved hours and needs manual handling.`);
    }
    const newStartsAt = assignment.startsAt < input.newStartsAt ? input.newStartsAt : assignment.startsAt;
    const newEndsAt = assignment.endsAt > input.newEndsAt ? input.newEndsAt : assignment.endsAt;
    if (newEndsAt <= newStartsAt) {
      throw new Error(`${assignment.label || "An Assignment"} does not overlap the new Shift window. Handle this Assignment manually before changing the Shift time.`);
    }
    return {
      id: assignment.id,
      label: assignment.label,
      oldStartsAt: assignment.startsAt,
      oldEndsAt: assignment.endsAt,
      newStartsAt,
      newEndsAt,
      oldTotalCompensationCents: assignment.totalCompensationCents,
      newTotalCompensationCents: calculateCompensationCents({
        compensationType: assignment.compensationType,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
        talentRateCents: assignment.talentRateCents,
        fixedFeeCents: assignment.fixedFeeCents,
      }),
      windowAdjusted: newStartsAt.getTime() !== assignment.startsAt.getTime()
        || newEndsAt.getTime() !== assignment.endsAt.getTime(),
    };
  });

  return {
    oldStartsAt: input.oldStartsAt,
    oldEndsAt: input.oldEndsAt,
    newStartsAt: input.newStartsAt,
    newEndsAt: input.newEndsAt,
    oldClientBilledTotalCents: calculateBillableAmountCents(input.oldStartsAt, input.oldEndsAt, input.clientRateCents),
    newClientBilledTotalCents: calculateBillableAmountCents(input.newStartsAt, input.newEndsAt, input.clientRateCents),
    oldTalentCompensationTotalCents: plannedAssignments.reduce((sum, assignment) => sum + assignment.oldTotalCompensationCents, 0),
    newTalentCompensationTotalCents: plannedAssignments.reduce((sum, assignment) => sum + assignment.newTotalCompensationCents, 0),
    assignments: plannedAssignments,
  };
}
