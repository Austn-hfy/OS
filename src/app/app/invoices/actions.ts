"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalActor } from "@/lib/auth";
import type { ResidencyActionState } from "../actions";

export async function approveInvoiceAction(_previous: ResidencyActionState, formData: FormData): Promise<ResidencyActionState> {
  try {
    const actor = await requireInternalActor();
    const { approveInvoice } = await import("@/services/invoices");
    const result = await approveInvoice(actor, z.uuid().parse(formData.get("invoiceId")));
    revalidatePath("/app/invoices");
    revalidatePath("/app");
    if (result.status === "manual") return { status: "success", message: "PDF generated and Invoice approved for manual delivery." };
    if (result.status === "failed") return { status: "success", message: "PDF generated and Invoice approved. Delivery needs attention." };
    return { status: "success", message: "PDF generated, Invoice approved, and delivery completed." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Unable to approve this Invoice." };
  }
}

export async function retryInvoiceSendAction(formData: FormData) {
  await requireInternalActor();
  try {
    const { sendApprovedInvoice } = await import("@/services/invoices");
    await sendApprovedInvoice(z.uuid().parse(formData.get("invoiceId")));
  } catch {
    // The service writes an Attention item that is visible to the operator.
  }
  revalidatePath("/app/invoices");
  revalidatePath("/app");
}
