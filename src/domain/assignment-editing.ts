export type ReplacementDraft = {
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
