export const LIVE_BILLING_HOLD_MESSAGE = "Live billing is not yet approved for this Residency.";

export function liveBillingApprovalPhrase(residencyName: string) {
  return `APPROVE LIVE BILLING FOR ${residencyName}`;
}

export class LiveBillingNotApprovedError extends Error {
  constructor() {
    super(LIVE_BILLING_HOLD_MESSAGE);
    this.name = "LiveBillingNotApprovedError";
  }
}

export function isLiveBillingNotApprovedError(error: unknown): error is LiveBillingNotApprovedError {
  return error instanceof Error && error.name === "LiveBillingNotApprovedError";
}
