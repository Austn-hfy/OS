"use client";

import { useActionState } from "react";

export type PlatformBillingActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type PlatformBillingAction = (
  previous: PlatformBillingActionState,
  formData: FormData,
) => Promise<PlatformBillingActionState>;

const initialState: PlatformBillingActionState = { status: "idle", message: "" };

export function PlatformBillingActionForm({
  action,
  residencyId,
  label,
  pendingLabel,
  buttonClassName = "button",
}: {
  action: PlatformBillingAction;
  residencyId?: string;
  label: string;
  pendingLabel: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return <form action={formAction}>
    {residencyId ? <input type="hidden" name="residencyId" value={residencyId} /> : null}
    <button className={buttonClassName} type="submit" disabled={pending}>{pending ? pendingLabel : label}</button>
    {state.status !== "idle" ? <p className={state.status} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
