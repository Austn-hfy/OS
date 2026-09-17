# HFY OS desktop UI/UX audit — Client Residency

Status: Settings desktop benchmark complete; broader client audit remains active
Date: September 16, 2026
Scope: the client-facing Residency workspace reached through **View as Residency**
Reference screen: **Settings → Billing**

## Purpose

This is the first chapter of the site-wide UI/UX review. It records the current client experience, identifies measurable layout and consistency defects, and proposes a desktop rulebook before mobile work begins.

The final Settings pass covers only **Settings → Account**, **Settings → Billing**, and the **Switch to annual** confirmation dialog. No other Residency route was changed in this pass.

## Audit coverage

The following manager-facing routes were reviewed during the initial audit:

| Area | Route | Current composition |
| --- | --- | --- |
| Overview | `/residency` | Shared workspace surface with two summary cards |
| Calendar | `/residency/calendar` | Purpose-built operational surface |
| Day Parts | `/residency/dayparts` | Purpose-built header, alert, and weekly grid |
| Talent | `/residency/talent` | Shared workspace surface with roster/detail split |
| Finances | `/residency/finances` | Shared workspace surface with two accordions |
| Account | `/residency/settings` | Shared Settings surface with tabs and account form |
| Billing | `/residency/settings/billing` | Shared Settings surface with plan, usage, and invoices |

The final Settings pass was checked at:

- 1440 × 900
- 1200 × 800
- 1024 × 768

It included Account, Billing, the annual-plan confirmation dialog, populated Billing data, the invoice table, and the current View-as Residency shell.

Legacy client URLs remain consolidated correctly:

- `/residency/invoices` redirects to `/residency/finances`.
- `/residency/payouts` redirects to `/residency/finances`.
- `/residency/talent/roster` redirects to `/residency/talent`.

## Executive finding

The lighter sidebar, frosted surfaces, blue action color, restrained coral alerts, and Billing information hierarchy already form a strong visual direction.

**Settings → Billing remains the desktop benchmark, with Platform invoice history as the strongest reference section.** The Account and Billing tabs now use the same outer geometry, heading grammar, tabs origin, body inset, section-title scale, and footer/action rules.

The final Settings pass deliberately did not begin the future shared-component or site-wide stylesheet-consolidation work. Account and Billing retain route-local markup while using matching, Settings-scoped layout rules.

## Confirmed issues

### CR-001 — View-as banner creates site-wide horizontal overflow

Priority: P0
Applies to: every Residency page while viewed from Developer mode
Settings status: **resolved for Account and Billing**
Broader status: open for the other Residency routes

At viewport widths at or below 1200px, `.main` switches to a smaller horizontal gutter while `.view-as-banner` retained the negative margin calculated from the wider gutter.

Previously measured at 1024px:

- layout viewport: 1024px
- document width: 1039px
- Settings surface width: 710.6px

Previously measured at 1200px:

- the document extended 18px beyond the layout viewport

Resolution for this pass:

- Account and Billing now identify the same Settings surface family.
- At the compact-desktop breakpoint, the View-as banner uses the active Settings main gutter.
- The fix is intentionally scoped to Settings so no other Residency route changes as part of this standalone task.

Remaining acceptance criteria for the later site-wide pass:

- Apply the same active-gutter rule to every other Residency route.
- Confirm no horizontal document overflow at 1024, 1200, 1280, or 1440px.

### CR-002 — Talent detail collapses at compact desktop widths

Priority: P0
Applies to: populated `/residency/talent`
Status: open; intentionally untouched because this pass is Settings-only

At 1024px, the Talent workspace keeps a fixed 440px roster column while the full workspace surface is only 710.6px wide. This leaves an unusable detail pane.

Acceptance criteria for the later Talent pass:

- The detail pane never renders below 520px in a split layout.
- Stack roster and detail when the workspace surface is narrower than roughly 940px.
- No internal or document-level horizontal overflow.

### CR-003 — Settings tabs shift when switching Account ↔ Billing

Priority: P1
Applies to: `/residency/settings` and `/residency/settings/billing`
Status: **resolved**

Before this pass, Account tabs began at the workspace edge while Billing added a 20px inline margin. Billing also inherited an 18px grid gap that placed its tabs lower.

Previously measured at 1024px:

- Account tabs: x 283.7px, y 191px
- Billing tabs: x 303.7px, y 209px

Resolution:

- Both routes use the same Settings surface class.
- Both tab strips use the same 20px desktop inset and 18px top offset.
- Both bodies use the same 20px desktop inset and 18px section gap.
- The tab markup remains inline in each route. A shared tabs component was intentionally deferred.
- Active tabs now expose `aria-current="page"`.

### CR-004 — Calendar event text is below a practical reading size

Priority: P1
Applies to: month view at desktop and compact desktop widths
Status: open; intentionally untouched because this pass is Settings-only

At 1024px, the rendered event title is 8px and the time/status line is 7px.

### CR-005 — Calendar begins on a different vertical rhythm

Priority: P1
Applies to: `/residency/calendar`
Status: open; intentionally untouched because this pass is Settings-only

Calendar begins roughly 18px higher than the standard Residency workspace after the View-as banner.

### CR-006 — Page eyebrow language has no stable meaning

Priority: P1
Applies to: all Residency pages
Settings status: **resolved for Account and Billing**
Broader status: open for the other Residency routes

Resolution for Settings:

- Account: `SETTINGS · ACCOUNT`
- Billing: `SETTINGS · BILLING`
- Account H1: `Account settings`
- Billing H1 remains `Platform subscription`

The differing H1 text is intentional: the eyebrow communicates the shared family while each title names the current task.

### CR-007 — Header actions use different placement and emphasis rules

Priority: P1
Applies to: Day Parts, Talent, Settings, and Billing
Settings status: **resolved / intentionally unchanged**
Broader status: open

Settings already follows the preferred action model:

- `Save Settings` remains at the Account form's bottom-right.
- Billing actions remain inside the card or offer they affect.
- The Stripe test-mode badge remains in the Billing header.

No action was moved because the current Billing benchmark already follows the intended hierarchy.

### CR-008 — View-as mode duplicates the Exit action

Priority: P2
Status: open; intentionally untouched because it is shell-wide and outside this Settings-only pass

### CR-009 — Attention state competes with current navigation state

Priority: P2
Status: open; intentionally untouched because it is navigation-wide and outside this Settings-only pass

### CR-010 — Supporting typography is inconsistent across surfaces

Priority: P2 site-wide
Settings status: **resolved for the reviewed Account and Billing content**
Broader status: open

Resolution for Settings:

- Account section descriptions now use a restrained 13px supporting scale instead of 16px.
- Billing's committed-plan description is 12px.
- Plan fact labels are 10px and values are 12px.
- Annual-offer supporting copy is 11px.
- Usage labels and nonessential meta are 11px and 10px respectively.
- The invoice-history section was left unchanged because it is the benchmark.

### CR-011 — Universal surface clipping hides layout mistakes

Priority: P2
Status: open; intentionally untouched because changing the shared workspace overflow rule would affect every route

Settings children now use `min-width: 0` and contained scroll regions, but the site-wide surface rule remains future work.

### CR-012 — The stylesheet cascade is acting as an undocumented design system

Priority: P1 architecture
Status: open; intentionally deferred

This standalone task explicitly excluded shared/reusable-component work and site-wide stylesheet consolidation. The Settings corrections are scoped so that the later architecture pass can extract them without changing the approved appearance.

Acceptance criteria for the later architecture pass:

- One authoritative rule per shared primitive.
- Route CSS controls only route-specific composition.
- Reduce and document breakpoints or use container queries where appropriate.
- Add automated horizontal-overflow and visual-regression checks.

### CR-013 — Annual-switch dialog footer clips against the modal edge

Priority: P1
Applies to: **Settings → Billing → Switch to annual**
Status: **resolved**

The annual confirmation form previously scrolled as one region while its footer inherited negative margins and sticky positioning intended for a different modal structure. The action buttons reached into the rounded edge and the primary button was visibly clipped.

Resolution:

- The form is a two-row layout: scrollable body plus fixed footer.
- Only the dialog body scrolls.
- The inherited negative footer margins and sticky offset are neutralized.
- Actions are grouped at the bottom-right on desktop.
- The footer keeps a 20px safe horizontal inset.
- Existing Escape behavior, focus trap, focus return, and explicit confirmation remain unchanged.

### CR-014 — Account supporting copy overpowers Billing's hierarchy

Priority: P1 Settings consistency
Applies to: `/residency/settings`
Status: **resolved**

Account's descriptive copy rendered at 16px while Billing's information-dense supporting copy rendered at 9–10px. The section titles already matched the 22px benchmark, so the final pass changed only the descriptions to 13px and retained the form fields, labels, and Save action.

## Settings benchmark decisions

### Account

Retained:

- Residency details and Primary contact section structure.
- Two-column label/field relationship at desktop widths.
- Input size and field spacing.
- Save action at the bottom-right.
- Existing success and error messaging behavior.

Changed:

- Settings-family eyebrow and page title.
- Tab and body origin.
- Supporting-copy size.
- Active-tab accessibility metadata.

### Billing

Retained:

- Page title and Stripe environment badge.
- Three top summary cards.
- Card actions and status treatments.
- Annual offer placement.
- Live-usage progress presentation.
- Platform invoice history typography, padding, table, and document actions.

Changed:

- Tab and body origin.
- Removed the redundant `Plan & usage` title.
- The middle card now begins with `COMMITTED PLAN` and `Subscription details`, matching invoice history's label/title hierarchy.
- Promoted Subscription details and Within plan to section-level H2 headings.
- Increased committed-plan and usage supporting type without competing with the top summary cards.
- Corrected annual-dialog footer containment.

### Intentionally left alone

- Billing summary-card scale: it establishes the page's primary financial hierarchy.
- Platform invoice history: it is the approved visual benchmark.
- Account input typography: 16px remains appropriate for editable form values.
- Account and Billing tab markup remains duplicated for now because shared-component work is a separate future task.
- Site-wide shell, navigation, and other Residency pages were not changed.

## Desktop rulebook v0.1

These rules are validated for Settings and remain proposals for the later site-wide implementation.

### 1. Page anatomy

`App shell → optional preview banner → page surface → page header → optional tabs/toolbar → page body → optional form footer`

### 2. Layout tokens

| Token | Value | Rule |
| --- | ---: | --- |
| Sidebar width | 252px | Fixed on desktop |
| Standard content max | 1240px | Center inside remaining main area |
| Wide desktop gutter | 64px | 1440px and above |
| Desktop gutter | 48px | 1200–1439px |
| Compact desktop gutter | 32px | 1024–1199px |
| Settings surface inset | 20px | Tabs and body share this origin |
| Settings section gap | 18px | Validated current benchmark |
| Major section gap | 24px | General future rule |
| Control gap | 8–12px | Related controls |

### 3. Typography

| Role | Size | Weight | Notes |
| --- | ---: | ---: | --- |
| Page title | 34px | 590–650 | 27–30px at compact desktop |
| Section title | 22px | 620–700 | Billing and Account benchmark |
| Subsection title | 15–16px | 650–700 | Cards and result groups |
| Body | 14px | 400–500 | Normal explanatory copy |
| Supporting | 12–13px | 400–600 | Descriptions and secondary information |
| Label/meta | 10px | 700–800 | Uppercase, tracked |
| Dense data minimum | 9px | 600–800 | Nonessential wide-desktop metadata only |

### 4. Controls and actions

- Standard control height: 44px.
- Primary blue: one main action per section or form.
- Secondary white: navigation, utility, and reversible contextual actions.
- Page-level create action: header right.
- Form save action: footer right.
- Card-specific action: inside the owning card.
- Full-width buttons: only inside narrow cards or mobile layouts.

### 5. Tabs

- Sibling tabs use matching markup, dimensions, and one inset.
- Tab location never changes between sibling routes.
- Active tab uses the established blue inset/underline treatment.
- Active tab exposes `aria-current="page"`.
- A shared tabs component is future work and was not introduced in this pass.

### 6. Dialogs, drawers, and popovers

- Desktop overlay padding: 32px; compact/mobile overlay padding: 12px.
- Dialog maximum height: viewport height minus twice the active overlay padding.
- Dialog anatomy with actions: fixed header, scrollable body, fixed footer.
- Never nest two vertical scroll regions inside the same dialog.
- Footer actions align bottom-right on desktop with at least a 20px edge inset.
- Compact layouts may stack actions with the primary action visually first.
- Do not use negative margins to make a modal footer full bleed.
- Escape closes a reversible dialog, focus is trapped while open, and focus returns to the trigger.

### 7. Required desktop checks

Every client page should eventually be verified at:

- 1440 × 900
- 1200 × 800
- 1024 × 768

Required assertions:

- `documentElement.scrollWidth === documentElement.clientWidth`
- No primary surface or control is clipped.
- No normal text below 10px.
- Header, tabs, and body share their defined inset.
- Keyboard focus remains visible.
- Empty, populated, warning, and error states keep the same page geometry.

## Recommended implementation order

1. **Completed for Settings:** fix compact-desktop View-as overflow without changing other routes.
2. **Completed for Settings:** align Account/Billing tabs and body geometry.
3. **Completed for Settings:** finalize the Account/Billing header and type hierarchy.
4. **Completed for Billing:** repair the annual-switch dialog footer.
5. Fix Talent compact-desktop collapse in its own scoped pass.
6. Correct Calendar top rhythm, command-bar wrapping, and event type size in its own scoped pass.
7. Normalize other page eyebrows, button emphasis, and sidebar attention behavior.
8. Consolidate repeated workspace CSS and introduce shared components only after the visual benchmark is approved.
9. Add desktop overflow and visual-regression coverage.
10. Lock the desktop rulebook, then begin the mobile chapter.

## Definition of done for Settings desktop

- Account and Billing pass 1440, 1200, and 1024 desktop checks.
- Switching tabs causes no horizontal or vertical jump.
- Settings has no document-level horizontal overflow at the reviewed widths.
- Account and Billing share one page-family header grammar and content origin.
- Billing's committed plan follows the approved invoice-history hierarchy.
- Account retains the established form behavior and correct Save placement.
- The annual confirmation dialog keeps all actions inside its rounded boundary.
- Differences that remain are intentional and documented.
