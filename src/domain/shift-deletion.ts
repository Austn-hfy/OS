type ShiftDeletionAssignment = {
  bookingStatus: string;
  payoutStatus: string;
};

export function shiftDeletionBlockReason(
  invoiceStatus: string | null,
  assignments: ShiftDeletionAssignment[],
): string | null {
  if (invoiceStatus && invoiceStatus !== "draft") {
    return "This Shift belongs to a finalized Invoice and must remain as financial history.";
  }
  if (assignments.some((row) => row.bookingStatus === "completed" || row.payoutStatus === "ready_to_pay" || row.payoutStatus === "paid")) {
    return "This Shift contains completed or payable work and cannot be deleted.";
  }
  return null;
}
