# HFY OS desktop UI/UX audit — Client Residency

Status: Settings desktop benchmark complete; Overview, Talent, and Calendar desktop adopted; broader client audit remains active
Date: September 17, 2026
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
Reviewed-route status: **resolved for Account, Billing, Overview, Talent, and Calendar**
Broader status: open for the other Residency routes

At viewport widths at or below 1200px, `.main` switches to a smaller horizontal gutter while `.view-as-banner` retained the negative margin calculated from the wider gutter.

Previously measured at 1024px:

- layout viewport: 1024px
- document width: 1039px
- Settings surface width: 710.6px

Previously measured at 1200px:

- the document extended 18px beyond the layout viewport

Resolution for Settings:

- Account and Billing now identify the same Settings surface family.
- At the compact-desktop breakpoint, the View-as banner uses the active Settings main gutter.
- The original fix was intentionally scoped to Settings.

Resolution for Talent:

- Talent now identifies itself as a `ResidencyPageSurface`, so the same compact-desktop active-gutter rule applies without route-local banner geometry.
- The Talent page body and both workspace cards enforce `min-width: 0`; the route-specific split/stack transition prevents internal content from widening the document.

Remaining acceptance criteria for the later site-wide pass:

- Apply the same active-gutter rule to every other Residency route.
- Confirm no horizontal document overflow at 1024, 1200, 1280, or 1440px.

### CR-002 — Talent detail collapses at compact desktop widths

Priority: P0
Applies to: populated `/residency/talent`
Status: **resolved**

At 1024px, the Talent workspace keeps a fixed 440px roster column while the full workspace surface is only 710.6px wide. This leaves an unusable detail pane.

Resolution:

- The split layout now reserves at least 520px for the detail pane and uses a flexible 280px-or-wider roster instead of the fixed 440px column.
- A named container query stacks the two cards when the Talent body is 940px or narrower, so the route has one explicit split-to-stack transition and no compressed in-between state.
- The artist fact area now uses the shared `ResidencyFactGrid`, which moves from four columns to an even 2 × 2 layout before it can collapse.
- The outer page, roster, and detail now use `ResidencyPageSurface`, `ResidencyPageBody`, and white `ResidencySurfaceCard` layers with the locked spacing tokens.
- The existing `TalentWorkspaceShell` remains the domain-specific master/detail composition. It is already shared by HFY and Residency Talent, so no new generic design-system component is proposed until a non-Talent page demonstrates the same need.

Resolution for Calendar:

- The View-as banner now uses Calendar's active compact-desktop gutter at and below 1200px.
- Calendar remains a purpose-built operational surface; the fix does not force it into the shared content-card component hierarchy.

### CR-002A — Talent post-adoption control alignment

Priority: P1
Applies to: populated `/residency/talent`
Status: **resolved**

The first shared-system pass left three route-level state and alignment regressions: the Active/Owed/Archived filter group retained a content-sized minimum width, Archive Artist appeared in the default-view header, and entering edit mode left the read-only details and Upcoming Bookings visible below the form.

Resolution:

- `546b7f2` made the three flex buttons grow equally, and `e62fa0e` replaced that behavior with an explicit three-column route-level grid. Both changes affected the filter, but neither widened its containing track: live staging measurement still showed a 264.6px track inside a 354.6px card because the card padding and toolbar padding were cumulative. The earlier statement that the route had been visually confirmed was incorrect.
- Follow-up review showed the real proportional defect affected the complete roster toolbar, not only the filter. The card had 24px outer padding plus a second 20px horizontal toolbar inset, making Search and Sort 264.6px wide while the roster rows were 304.6px wide. Widening only the filter exposed rather than resolved that mismatch.
- The toolbar now retains its vertical spacing without adding another horizontal inset. Search Artists, the search field, the three equal filter tracks, artist count, Sort, and every roster row share the same 304.6px content edges inside the card. A staging computed-style and screenshot check confirms the single proportional column.
- An approved visual-density follow-up makes the roster card content-height with a 680px scrolling ceiling rather than forcing 680px of empty height. Search text is 14px; artist names are 12px; metadata and count copy are 10px; Sort is one compact inline control; and artist rows retain 12px vertical padding. These sizes preserve the 10px normal-text floor while matching the narrower column's scale.
- Archive Artist is absent from the default detail header and appears only inside edit mode as a standalone destructive action with its original warning copy directly below it.
- Edit state is coordinated by the Talent workspace so all default-view material below the profile card—including read-only facts, owed assignments, Upcoming Bookings, and the calendar—is removed while editing. Save or Cancel exits edit mode and restores that material.
- Save changes and Cancel remain aligned to the form's trailing edge; the Archive Artist area begins after shared-token spacing and its own separated boundary, without a divider touching the form actions.
- The read-only detail summary now uses the shared 24px spacing step between fact rows, between the facts and owed summary, below the profile summary, and inside the following content sections. This removes the zero-gap transition that previously placed the Owed From divider directly against the profile row.
- No artist content, data, permissions, or action behavior changed.

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
Status: **resolved for Residency Calendar desktop**

At 1024px, the rendered event title is 8px and the time/status line is 7px.

Resolution:

- Month event titles and time/status text now use semantic Calendar tokens with a 10px minimum.
- Compact event rows gained the minimum height and padding required by the readable type scale without changing event content or behavior.
- Week metadata and weekday labels now follow the same 10px floor; Week event titles remain 12px.

### CR-005 — Calendar begins on a different vertical rhythm

Priority: P1
Applies to: `/residency/calendar`
Status: **resolved for Residency Calendar desktop**

Calendar begins roughly 18px higher than the standard Residency workspace after the View-as banner.

Resolution:

- Calendar now uses the standard 38px desktop page inset instead of its former 20px exception.
- The existing compact-layout page inset remains in effect below the desktop range.

### CR-006 — Page eyebrow language has no stable meaning

Priority: P1
Applies to: all Residency pages
Settings status: **resolved for Account and Billing**
Calendar status: **resolved**
Broader status: open for the remaining Residency routes

Resolution for Settings:

- Account: `SETTINGS · ACCOUNT`
- Billing: `SETTINGS · BILLING`
- Account H1: `Account settings`
- Billing H1 remains `Platform subscription`

The differing H1 text is intentional: the eyebrow communicates the shared family while each title names the current task.

Talent remains open under this copy-specific item. Its existing eyebrow text was intentionally preserved because the Talent task prohibits content changes; only its header component, spacing, and action placement were standardized.

Calendar now uses `{Residency name} · Calendar` as its route-family eyebrow while retaining `Calendar` as the task-level H1. The shared owner/programming Calendar keeps its existing wording because this pass is Residency-only.

### CR-006A — Calendar command bar and Week view break at compact desktop widths

Priority: P0
Applies to: `/residency/calendar` from 1200px through 1024px
Status: **resolved for Residency Calendar desktop**

The original command bar kept three symmetric columns until the viewport reached 700px even though its filter cluster was wider than the available first track by 1200px. Status and Daypart controls consequently overlapped the Month/Week switcher throughout the required compact-desktop range. Week view separately forced a 1120px internal grid and horizontal scrolling.

Resolution:

- The command-bar wrapper is now a named inline-size container.
- Above 920px of available command-bar width, filters, the view switcher, and actions remain in one row.
- At 920px or below, both filters occupy an even full-width row and the view switcher/actions occupy a second row. There is no 3-column compressed state between those layouts.
- The Residency Week grid now divides the available operational surface into seven equal tracks through 1024px instead of enforcing a 1120px minimum.
- Month and Week visual coverage protects the 1440px, 1200px, and 1024px desktop states. Mobile Calendar behavior remains intentionally deferred.

### CR-006B — Calendar opened states lacked a complete containment and regression pass

Priority: P1
Applies to: `/residency/calendar` at 1440px, 1200px, and 1024px
Status: **resolved for Residency Calendar desktop**

The first Calendar pass covered the closed Month and Week canvases, but it did not visually protect Batch Edit, Schedule All, Share Calendar, the status legend, quick add/edit dialogs, or their nested pickers. The quick add/edit and Share form actions also retained negative-margin sticky footers, repeating the same containment risk previously fixed in Billing. The main Calendar and batch dialogs closed on Escape but did not consistently trap focus or return it to the initiating control.

Resolution:

- Calendar quick-add and event-edit footers now stay inside the dialog with positive spacing, a complete boundary, and no negative-margin bleed.
- Share Calendar form actions use the same contained treatment.
- Quick add/edit, Schedule All, and Batch Edit takeovers now move focus inside, trap Tab/Shift+Tab, close on Escape, and restore focus to their trigger.
- Batch Edit and the status legend close on outside interaction or Escape; the color picker follows the same reversible-popover behavior and closes after a selection.
- Batch, legend, and color popovers are constrained to the viewport and contain their own overscroll.
- Visual and geometry regression coverage now protects representative Batch menu, status legend, Share, quick-add, quick-edit, and batch-takeover states at 1440px, 1200px, and 1024px, in addition to the existing Month/Week coverage.

Intentionally unchanged:

- Calendar data, scheduling behavior, Share-link behavior, copy, and Month/Week content were not redesigned.
- The mobile Calendar presentation remains deferred to the mobile chapter.

### CR-006C — Week view compresses long event content below the desktop checkpoints

Priority: P0
Applies to: `/residency/calendar` between the approved desktop range and the future mobile layout
Status: **resolved with a compact bridge; final mobile layout remains deferred**

The 1024px regression fixture used short event names, so it did not expose the failure visible with production-like content at smaller intermediate widths. Once the Calendar’s actual content area narrowed, the primary header still followed browser-width media queries, the date range extended past the right edge, and long status/title words escaped their Week event cards.

Resolution:

- The Calendar page itself is now the responsive container for the primary header and Week grid.
- At `700px` of Calendar surface width, the title and scheduling/date controls move to separate rows; at `520px`, Batch Edit and date navigation stack again.
- Long Week event children are width-contained and the status line may wrap long words when necessary.
- Below a `640px` Calendar surface, Week stops compressing its seven columns and becomes a contained horizontal scroller with a `110px` minimum day width.
- Added long-content visual and geometry coverage at 900px, 700px, and 600px in addition to the existing 1440px, 1200px, and 1024px checks.

Intentionally unchanged:

- Month and Week retain the approved desktop appearance at 1440px, 1200px, and 1024px.
- This is a safe compact-width bridge, not the final mobile Calendar redesign.

### CR-007 — Header actions use different placement and emphasis rules

Priority: P1
Applies to: Day Parts, Talent, Settings, and Billing
Settings status: **resolved / intentionally unchanged**
Talent status: **resolved**
Broader status: open for Day Parts

Settings already follows the preferred action model:

- `Save Settings` remains at the Account form's bottom-right.
- Billing actions remain inside the card or offer they affect.
- The Stripe test-mode badge remains in the Billing header.

No action was moved because the current Billing benchmark already follows the intended hierarchy.

Talent now places `+ New Artist` in the shared page header action slot instead of absolutely positioning it from inside the roster toolbar.

### CR-008 — View-as mode duplicates the Exit action

Priority: P2
Status: open; intentionally untouched because it is shell-wide and outside this Settings-only pass

### CR-009 — Attention state competes with current navigation state

Priority: P2
Status: open; intentionally untouched because it is navigation-wide and outside this Settings-only pass

### CR-010 — Supporting typography is inconsistent across surfaces

Priority: P2 site-wide
Settings status: **resolved for the reviewed Account and Billing content**
Talent status: **resolved for the reviewed roster and detail content**
Broader status: open

Resolution for Settings:

- Account section descriptions now use a restrained 13px supporting scale instead of 16px.
- Billing's committed-plan description is 12px.
- Plan fact labels are 10px and values are 12px.
- Annual-offer supporting copy is 11px.
- Usage labels and nonessential meta are 11px and 10px respectively.
- The invoice-history section was left unchanged because it is the benchmark.

Resolution for Talent:

- Roster controls and metadata now use the shared supporting scales rather than route-local 8px labels.
- Detail facts use the shared 10px label / 12px value hierarchy.
- Page and section headings now come from the shared header primitives.

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

### CR-015 — Account sections omit the required white Surface-card layer

Priority: P1 Settings consistency
Applies to: `/residency/settings`
Status: **resolved**

Account was the first confirmed violation of the locked three-layer rule. `Residency details` and `Primary contact` previously placed their headings, labels, and fields directly on the frosted haze instead of inside opaque white Surface cards.

Resolution:

- Each Account section is now its own layer-3 white Surface card.
- The cards match Billing's summary-card background, border, 16px radius, 20px padding, and soft shadow.
- Inputs, labels, copy, and form behavior are unchanged.
- The form-level status message, permissions note, and `Save Settings` action remain outside the cards because they apply to the form as a whole rather than to one section.
- Every other page must be checked against the same three-layer rule in a future scoped pass; no other route was reviewed or changed here.

### CR-016 — Billing breaks down between full desktop and mobile layouts

Priority: P1 Billing responsiveness
Applies to: `/residency/settings/billing`
Status: **resolved**

Continuous resizing exposed two intermediate-width failures that were not visible at the earlier fixed checkpoints:

- The committed-plan facts retained five or four padded columns until they were too narrow. `Plan dates` wrapped by itself while neighboring values stayed on one line, row heights became uneven, and the grid then jumped to three columns at the viewport breakpoint.
- The invoice table enforced an 860px minimum width. Its internal horizontal overflow measured 23px at a 1300px viewport, 78px at 1200px, 243px at 1024px, and 398px immediately before the shell's compact-layout transition at 860px.

Resolution:

- `Plan dates` was removed from the committed-plan summary because the separate Live Usage range already communicates the relevant period and the field was not an actionable billing fact. The duplicated annual upfront total was also omitted from this summary because it remains available in the Current plan card, leaving the summary at the four approved facts in every billing-term state.
- The committed-plan fact grid now responds to its own container with only three permitted arrangements: four columns at full width, an even 2 × 2 grid at intermediate widths, and one fully stacked column at mobile widths. Explicit transitions replace auto-fitting so a 3 + 1 split cannot occur.
- Invoice periods now use separate semantic start and end dates. They remain inline when the table has room and stack vertically when the invoice card narrows.
- The compact invoice table removes its fixed minimum width, uses a fixed proportional column layout, and reduces cell padding while preserving the current full-desktop table.
- Billing was rechecked continuously from 1440px down to the 700px mobile breakpoint. Account and all other routes were intentionally excluded.

## Settings benchmark decisions

### Account

Retained:

- Residency details and Primary contact section structure.
- Two-column label/field relationship at desktop widths.
- Input size and field spacing.
- Save action and permissions note as page-level form-footer content outside the section cards.
- Existing success and error messaging behavior.

Changed:

- Settings-family eyebrow and page title.
- Tab and body origin.
- Supporting-copy size.
- Active-tab accessibility metadata.
- Residency details and Primary contact now each sit in a Billing-matched white Surface card above the haze layer.

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
- Removed the redundant Plan dates summary fact and locked the remaining four facts to 4-column, 2 × 2, or fully stacked layouts.
- Added an overflow-free intermediate invoice-table layout.

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

### 2. Layer structure — locked sitewide rule

Every page must preserve three visually distinct layers in this order:

1. **Base background:** the page-level colored foundation.
2. **Frosted haze:** the translucent layer above the base that establishes depth and groups the page workspace.
3. **White Surface cards:** opaque white cards placed above the haze. Each card contains one distinct content section and owns its padding, border radius, low-contrast border, and soft shadow.

Content sections must not place their headings, labels, fields, tables, or other primary content directly on the haze when the section is intended to read as a Surface card. Account was the first confirmed violation and was corrected by placing `Residency details` and `Primary contact` in separate layer-3 cards. Every other page remains subject to a future layer-structure check; this pass did not audit or change those pages.

### 3. Layout tokens

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

### 4. Responsive field-grid structure — locked sitewide rule

- A four-item responsive field-grid group may use only these arrangements: one full row of four, an even 2 × 2 grid, or a full vertical stack of one item per row.
- Uneven final rows, including a 3 + 1 split, are never permitted.
- Use explicit container or viewport transitions for these states. Do not use automatic column fitting when it can produce an uneven split.
- Billing's Subscription details summary is the confirmed benchmark for this rule; other pages must be checked in their own future scoped passes.

### 5. Typography

| Role | Size | Weight | Notes |
| --- | ---: | ---: | --- |
| Page title | 34px | 590–650 | 27–30px at compact desktop |
| Section title | 22px | 620–700 | Billing and Account benchmark |
| Subsection title | 15–16px | 650–700 | Cards and result groups |
| Body | 14px | 400–500 | Normal explanatory copy |
| Supporting | 12–13px | 400–600 | Descriptions and secondary information |
| Label/meta | 10px | 700–800 | Uppercase, tracked |
| Dense data minimum | 9px | 600–800 | Nonessential wide-desktop metadata only |

### 6. Controls and actions

- Standard control height: 44px.
- Primary blue: one main action per section or form.
- Secondary white: navigation, utility, and reversible contextual actions.
- Page-level create action: header right.
- Form save action: footer right.
- Card-specific action: inside the owning card.
- Full-width buttons: only inside narrow cards or mobile layouts.

### 7. Tabs

- Sibling tabs use matching markup, dimensions, and one inset.
- Tab location never changes between sibling routes.
- Active tab uses the established blue inset/underline treatment.
- Active tab exposes `aria-current="page"`.
- A shared tabs component is future work and was not introduced in this pass.

### 8. Dialogs, drawers, and popovers

- Desktop overlay padding: 32px; compact/mobile overlay padding: 12px.
- Dialog maximum height: viewport height minus twice the active overlay padding.
- Dialog anatomy with actions: fixed header, scrollable body, fixed footer.
- Never nest two vertical scroll regions inside the same dialog.
- Footer actions align bottom-right on desktop with at least a 20px edge inset.
- Compact layouts may stack actions with the primary action visually first.
- Do not use negative margins to make a modal footer full bleed.
- Escape closes a reversible dialog, focus is trapped while open, and focus returns to the trigger.

### 9. Required desktop checks

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
5. **Completed for Talent:** fix compact-desktop collapse and adopt the shared V1 page/card hierarchy.
6. **Completed for Calendar desktop:** correct top rhythm, command-bar wrapping, event type size, Week sizing, and compact View-as gutter behavior.
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
