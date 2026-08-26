export function assertResidencyScope(actorResidencyId: string, resourceResidencyId: string): void {
  if (actorResidencyId !== resourceResidencyId) {
    throw new Error("This record is outside your Residency.");
  }
}
