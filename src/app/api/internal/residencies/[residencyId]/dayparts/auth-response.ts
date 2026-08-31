import { NextResponse } from "next/server";
import { isResidencyAccessError } from "@/lib/auth";

export function residencyAccessErrorResponse(error: unknown): NextResponse | null {
  if (!isResidencyAccessError(error)) return null;
  return NextResponse.json(
    { error: error.status === 401 ? "Unauthorized." : "Forbidden." },
    { status: error.status, headers: { "Cache-Control": "private, no-store" } },
  );
}
