"use client";

import { useEffect, useState } from "react";
import { ResidencyCreateForm } from "./residency-create-form";

export function CreateResidencyModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return <>
    <button className="button" type="button" onClick={() => setOpen(true)}>+ Create New Residency</button>
    {open ? <div className="quick-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <section className="quick-modal residency-create-modal" role="dialog" aria-modal="true" aria-labelledby="new-residency-title">
        <header className="quick-modal-header"><div><p className="eyebrow">Operations</p><h2 id="new-residency-title">Create New Residency</h2><p>Set the program foundation now; Day Parts and approved artists can be added afterward.</p></div><button className="quick-modal-close" type="button" aria-label="Close new Residency form" onClick={() => setOpen(false)}>×</button></header>
        <div className="quick-modal-body"><ResidencyCreateForm onCreated={() => setOpen(false)} onCancel={() => setOpen(false)} /></div>
      </section>
    </div> : null}
  </>;
}
