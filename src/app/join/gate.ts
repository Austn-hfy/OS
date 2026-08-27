export function isJoinEnabled(value = process.env.JOIN_ENABLED): boolean {
  return value === "1";
}
