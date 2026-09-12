export type ReplacementDraft = {
  assignmentId: string;
  talentId: string;
  start: string;
  end: string;
};

export type AssignmentHoursDraft = {
  assignmentId: string;
  talentId: string;
  start: string;
  end: string;
};

export function replacementDraftFromAssignment(assignment: {
  id: string;
  startClock: string;
  endClock: string;
}): ReplacementDraft {
  return {
    assignmentId: assignment.id,
    talentId: "",
    start: assignment.startClock,
    end: assignment.endClock,
  };
}

export function assignmentHoursDraftFromAssignment(assignment: {
  id: string;
  talentId: string;
  startClock: string;
  endClock: string;
}): AssignmentHoursDraft {
  return {
    assignmentId: assignment.id,
    talentId: assignment.talentId,
    start: assignment.startClock,
    end: assignment.endClock,
  };
}

export function canEditClientManagedAssignmentHours(input: {
  canManage: boolean;
  previewMode: boolean;
  recordType: "financial_shift" | "nonfinancial_occurrence" | "projected";
  daypartType: "dj_artist" | "house_activity";
  economicsMode?: "hfy" | "client_owned" | "hfy_request";
}): boolean {
  return input.canManage
    && input.previewMode
    && input.recordType === "financial_shift"
    && input.daypartType === "dj_artist"
    && input.economicsMode === "client_owned";
}
