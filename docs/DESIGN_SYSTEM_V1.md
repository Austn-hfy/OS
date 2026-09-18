# HFY OS Design System V1

Version: 1.6
Last updated: September 17, 2026
Changed this revision: Added the Residency Day Parts implementation profile, its operational-grid tokens, and its page-specific responsive and overlay contracts without promoting those structures to shared sitewide components.

This document turns the approved client Settings benchmark into reusable implementation rules. It complements `docs/BRAND_GUIDELINES.md`: the brand guide defines the visual identity, while this document defines the page-level components and tokens that enforce it in HFY OS.

## Locked layer model

Every client workspace uses three layers in order:

1. The colored application canvas.
2. The translucent frosted page surface.
3. An opaque white Surface card for each distinct content section.

Primary section content must not sit directly on the frosted page surface. A frosted card variant is retained only for an explicitly approved benchmark such as Platform Invoice History.

## Shared pieces

| Piece | Implementation | Contract |
| --- | --- | --- |
| Page surface | `ResidencyPageSurface` | Applies the shared Residency workspace frame and frosted layer without changing route behavior. |
| Page header | `ResidencyPageHeader` | Renders the eyebrow, one H1, and an optional page-level badge or action. |
| Page body | `ResidencyPageBody` | Owns the standard content inset and major section gap. |
| Sibling tabs | `ResidencyTabs` | Keeps tab geometry, active treatment, and `aria-current` consistent between routes. |
| Surface card | `ResidencySurfaceCard` | Provides semantic `section` or `article` cards with locked white and approved frosted variants. |
| Section header | `ResidencySectionHeader` | Provides eyebrow, H2, supporting copy, and an optional right-side badge/action. |
| Metric grid | `ResidencyMetricGrid` | Groups primary summary cards and owns their equal-column responsive behavior. |
| Fact grid | `ResidencyFactGrid` | Renders label/value facts using the locked 4 → 2 × 2 → 1 responsive sequence. |
| Compact collection panel | `ResidencyCollectionPanel` family | Provides the locked searchable/filterable collection anatomy, density, alignment, scrolling, and row states defined below. |

The components live in `src/components/residency-design-system.tsx`. They remain server-compatible and add no client-side JavaScript by themselves.

## Core tokens

The authoritative values live in `src/app/hfy-design-tokens.css`:

| Token | Value | Use |
| --- | ---: | --- |
| `--hfy-page-content-inset` | `20px` | Desktop page-body and tab inset |
| `--hfy-page-content-inset-compact` | `16px` | Compact/mobile page-body inset |
| `--hfy-page-section-gap` | `18px` | Separation between sibling page sections |
| `--hfy-surface-card-padding` | `20px` | Standard white Surface-card padding |
| `--hfy-surface-card-radius` | `16px` | Standard white Surface-card radius |
| `--hfy-surface-card-shadow` | `0 8px 24px rgba(26, 55, 84, 0.06)` | Standard low-contrast Surface elevation |
| `--hfy-section-title-size` | `22px` | Section H2 scale |
| `--hfy-supporting-copy-size` | `12px` | Standard secondary copy scale |

Use these tokens through the shared classes and components. Route-specific CSS may define layout unique to its content but must not redefine a shared token locally.

## Compact Collection Panel

Use the Compact Collection Panel for a narrow or stacked operational list that combines search, status filters, a result count, sorting, and selectable rows. Consumers supply data and event behavior; the shared family owns structure and visual density.

### Anatomy

Use the family in this order:

1. `ResidencyCollectionPanel` — the white Surface-card boundary and scrolling ceiling.
2. `ResidencyCollectionToolbar` — the shared vertical control group.
3. `ResidencyCollectionSearch` — uppercase label, search icon, and search input.
4. `ResidencyCollectionFilters` — equal-width status tabs with optional counts.
5. `ResidencyCollectionUtility` — collection count plus an inline Sort label and select.
6. `ResidencyCollectionList` — the scrollable row boundary.
7. `ResidencyCollectionRow` — selectable title, metadata, and optional trailing signals/chips.

### Locked contract

| Role | Locked value or rule | Authoritative token |
| --- | --- | --- |
| Panel sizing | Content-height; never force empty vertical space | Component contract |
| Panel scrolling | `680px` desktop ceiling; `440px` in the compact stacked Talent workspace | `--hfy-collection-panel-scroll-ceiling`, `--hfy-collection-panel-scroll-ceiling-compact` |
| Horizontal alignment | Search label/input, filters, count/Sort, list, and rows share one content edge; never add a second horizontal toolbar inset or child-specific negative margin | Component contract |
| Label type | `10px` | `--hfy-collection-label-size` |
| Search type/control | `14px` text in the standard `44px` control | `--hfy-collection-search-size`, `--hfy-control-height` |
| Filter type | `10px` labels; `9px` counts; equal-width tracks | `--hfy-collection-filter-size`, `--hfy-collection-filter-count-size` |
| Count type | `10px` copy; `12px` emphasized number | `--hfy-collection-count-size`, `--hfy-collection-count-emphasis-size` |
| Sort type/control | `10px` label; `11px` value; `118px × 36px` select | `--hfy-collection-sort-label-size`, `--hfy-collection-sort-value-size`, `--hfy-collection-sort-control-width`, `--hfy-collection-sort-control-height` |
| Row type | `12px` title; `10px` metadata | `--hfy-collection-row-title-size`, `--hfy-collection-row-meta-size` |
| Chip type | `9px` | `--hfy-collection-chip-size` |
| Row padding | `12px` block and `14px` inline | `--hfy-collection-row-padding-block`, `--hfy-collection-row-padding-inline` |
| Spacing | Use the established `8px`, `12px`, `16px`, and `24px` steps for composition; the row block token aliases `--hfy-space-3` | `--hfy-space-2`, `--hfy-space-3`, `--hfy-space-4`, `--hfy-space-6` |
| Color and state | Default text, metadata, boundaries, nested track, active blue, selected-row blue, and warning/error chips use the shared system palette; consumers must not introduce route-local colors | `--hfy-ink`, `--hfy-muted`, `--hfy-label`, `--hfy-line`, `--hfy-line-strong`, `--hfy-surface-card-background`, `--hfy-surface-nested`, `--hfy-action-ink`, `--hfy-action-soft`, `--hfy-action-strong`, `--hfy-error`, `--hfy-error-soft` |

The panel must remain visually stable at 1440px, 1200px, and 1024px. At every width, the controls and rows keep the same density and common content edges. Only the owning page decides whether the panel is one column of a split workspace or a full-width stacked section.

## Responsive rules

- Four-item fact grids use only four columns, an even 2 × 2 grid, or a one-column stack. A 3 + 1 state is prohibited.
- Metric grids may collapse only at a declared breakpoint; their cards retain the shared Surface treatment.
- Standard content begins at the same inset as sibling tabs and page-level controls.
- Desktop verification remains required at 1440px, 1200px, and 1024px, plus continuous resizing through intermediate widths.

## Cross-cutting interaction principles

These principles apply sitewide, but they are behavioral guardrails rather than a shared visual component family. A route does not inherit Calendar's numeric breakpoints, anatomy, or CSS merely by following them.

| Principle | Sitewide requirement |
| --- | --- |
| Component-aware responsiveness | A self-contained surface such as a panel, command bar, or dialog responds to its actual available width when its width can differ materially from the browser viewport. Browser-width media queries alone are insufficient in that case. |
| Containment | Controls, records, popovers, and action footers remain inside their owning surface. A compact state must reflow before content clips or creates document-level horizontal overflow. |
| Overlay scrolling | A modal or takeover uses one intentional scrolling region. Fixed or sticky headers and footers may remain visible, but nested full-height scrollers and negative-margin edge bleed are prohibited. |
| Keyboard and focus | Opening a modal moves focus inside it; Tab and Shift+Tab remain contained; Escape closes reversible states; closing restores focus to the initiating control. Reversible popovers close on outside interaction or Escape. |

## Calendar Implementation Profile

Scope: **Residency Calendar only.** This is a page-specific adoption profile, not a reusable shared component family. The Calendar may consume shared tokens and the cross-cutting principles above, but its command-bar breakpoints, Month/Week typography, seven-day grid behavior, Batch/Share structures, Daypart fields, and numeric compact thresholds must not be copied to another page as sitewide defaults. A future extraction must explicitly promote any genuinely repeated pattern before another route adopts it.

Calendar is a purpose-built operational surface rather than a stack of standard content cards. It still follows the sitewide layer model: the application canvas sits below one frosted Calendar surface, and the opaque Month or Week grid is the working surface above it. Individual days and events are records inside that working surface and must not be wrapped in additional `ResidencySurfaceCard` layers.

### Calendar-only desktop contract

| Role | Locked value or rule | Authority |
| --- | --- | --- |
| Page rhythm | Calendar uses the same desktop top inset as the Residency page family. | `--hfy-space-*` page composition |
| Header grammar | Residency Calendar uses `{Residency name} · Calendar` above the `Calendar` H1. | Page-family copy contract |
| Wide command bar | When the command-bar container is wider than `920px`, filters, view switcher, and actions occupy one proportional row. | Named `calendar-command-secondary` container |
| Intermediate command bar | At `920px` or narrower, filters occupy one complete row; the view switcher and actions occupy a second row. Controls must never overlap or form an uneven intermediate state. | Named `calendar-command-secondary` container |
| Compact primary header | When the Calendar surface itself is `700px` or narrower, the title and month/week cluster use separate rows. At `520px` or narrower, Batch Edit and date navigation stack inside that cluster. These decisions use Calendar container width, not browser width. | Named `client-calendar-page` container |
| Month event type | Event title and supporting time/status text are both at least `10px`. | `--hfy-calendar-event-title-size`, `--hfy-calendar-event-meta-size` |
| Week type | Weekday labels and event metadata are at least `10px`; event titles remain `12px`. | `--hfy-calendar-weekday-size`, `--hfy-calendar-week-event-title-size`, `--hfy-calendar-week-event-meta-size` |
| Week grid | From 1440px through 1024px, all seven days fit the available Calendar surface without a forced `1120px` minimum width or horizontal scrolling. | Calendar operational layout |
| Week readable-width floor | Below `640px` of actual Calendar surface width, the Week grid becomes one contained horizontal scroller with seven `110px` minimum day tracks. Event content must never escape its own card. | Named `client-calendar-page` container |
| View-as banner | At compact desktop widths, the banner uses the active Calendar page gutter and must not widen the document. | Residency shell gutter contract |

The Month and Week layouts must pass at 1440px, 1200px, and 1024px and while resizing continuously between them. The compact bridge must additionally pass with long real-world event copy at 900px, 700px, and 600px. The final mobile Calendar presentation is intentionally not defined here; until that chapter is approved, Week preserves the seven-day model in a contained horizontal surface rather than compressing its columns below practical reading and touch sizes.

### Calendar-only interaction contract

| Interaction | Locked value or rule |
| --- | --- |
| Anchored menus | Batch Edit and the status legend stay attached to their trigger, remain inside the viewport, and close on outside interaction or Escape. Escape returns focus to the trigger. |
| Add/edit dialogs | Calendar quick-add and edit dialogs use the current Calendar overlay padding, fixed header, one scrolling body, and a contained action footer. The footer may remain sticky within that single scroll region, but it must use normal positive insets and must never use negative margins to create a full-bleed edge. |
| Compact scheduling dialog | The dialog responds to its own usable width rather than the browser width. At `720px` or narrower, the selected Daypart, date actions, assignment choices, and scheduling footer reflow into contained rows; at `520px`, time fields and actions stack further. No form control, option card, or footer action may extend beyond the dialog body. |
| Share dialog | All management views remain inside the same dialog boundary. Form actions use the contained footer treatment and never reach into the rounded dialog edge. |
| Batch workspaces | A batch workspace has one fixed header and one scrolling list/body. Expanded rows may contain controls, but must not create document-level horizontal scrolling or a second full-height vertical scroller. |
| Nested pickers | Room, artist, and color choices stay within their owning dialog. Floating pickers are viewport-constrained and close on selection, outside interaction, or Escape where reversible. |
| Focus | Calendar dialogs and popovers implement the cross-cutting keyboard and focus principle above. |
| Desktop coverage | Representative Batch menu, status legend, Share, quick-add, quick-edit, and batch-takeover states require visual and overflow checks at 1440px, 1200px, and 1024px. Schedule Daypart additionally requires compact visual coverage at 760px and 600px plus continuous containment checks from 900px through 480px. |

## Day Parts Implementation Profile

Scope: **Residency Day Parts only.** Day Parts uses the shared Residency page surface, header, body inset, spacing, color, and type tokens. Its room-by-week schedule, time-positioned blocks, room editor, and Daypart editor are operational structures specific to this route; their numeric tracks and compact thresholds are not locked sitewide rules.

Day Parts follows the layer model as an operational workspace: the application canvas sits below one frosted `ResidencyPageSurface`, and the opaque weekly board is the working surface above it. Room rows, weekday cells, and time-positioned blocks are records inside that board and do not receive additional `ResidencySurfaceCard` wrappers.

The Compact Collection Panel does not apply. Day Parts is a spatial schedule by room and weekday, not a searchable/filterable collection with count, sort, and selectable list rows.

### Day Parts-only responsive contract

| Role | Locked value or rule | Authority |
| --- | --- | --- |
| Header and body | Use `ResidencyPageHeader` and the standard `ResidencyPageBody` inset inside `ResidencyPageSurface`; the create action occupies the page-header action slot. | Shared Residency primitives |
| Header grammar | Use `Day Parts · Schedule setup` above the `Weekly Daypart grid` H1. | Page-family copy contract |
| Board readable floor | The complete board has an `840px` minimum working width: a `112px` room track plus seven day tracks of at least `104px`. | `--hfy-dayparts-board-min-width`, `--hfy-dayparts-room-track`, `--hfy-dayparts-day-track-min` |
| Compact board | When the page body is narrower than the board floor, the board becomes one contained horizontal scroller. The room column stays sticky, a visible scroll cue appears, and the document itself must not widen. | Named `residency-dayparts-workspace` container |
| Board type | Weekday labels are `10px`, room names are `12px`, event titles are `11px`, and event metadata is `10px`. | `--hfy-dayparts-weekday-size`, `--hfy-dayparts-room-size`, `--hfy-dayparts-event-title-size`, `--hfy-dayparts-event-meta-size` |
| Daypart editor | Maximum width is `1120px` with a fixed header, one vertically scrolling body, and a contained footer. The editor responds to its own width at `900px`, `640px`, and `520px`; these are Day Parts-only thresholds. | Named `residency-daypart-editor` container, `--hfy-dayparts-drawer-max-width` |
| Weekly-hours editor | Wide state shows seven readable day tracks. Intermediate state keeps those tracks in one contained horizontal scroller. At `520px` of editor width, the seven day controls form one vertical stack. | Named `residency-daypart-editor` container, `--hfy-dayparts-editor-day-min-width` |
| Form controls | Two-choice and settings groups stack at `640px` of editor width. Supporting form copy uses a `10px` minimum. | `--hfy-dayparts-editor-supporting-size` |
| Room editor | Uses one scrolling body and one contained action footer. At narrow width, color choices use two even columns and the danger action stacks below its warning copy. | Named `residency-room-editor` container |
| Saved-template popover | Remains viewport-constrained. At a narrow popover width, template metadata moves below the template name rather than forcing horizontal overflow. | Named `residency-room-template-popover` container |
| Focus | Daypart and room dialogs move focus inside, trap Tab/Shift+Tab, close on Escape, and restore focus to the initiating control. More Actions supports menu focus and arrow-key movement. Saved-template popovers close on outside interaction, scroll/resize, or Escape. | Cross-cutting keyboard and focus principle |
| Coverage | The closed page is checked continuously from `1440px` through `390px`. Representative Daypart editor states are checked at `1440px`, `1024px`, `760px`, `600px`, and `390px`; the room editor and saved-template popover receive narrow-width containment checks. | Day Parts visual contracts |

## Adoption status

- Settings → Account: authoritative benchmark, now rendered through shared primitives.
- Settings → Billing: authoritative benchmark, now rendered through shared primitives.
- Residency Overview: first proof of concept. Its existing content, links, data, and behavior are unchanged; only the page composition and styling consume V1 primitives.
- Residency Talent: adopted. The route uses the shared page surface, header, body, Surface cards, section header, fact grid, and Compact Collection Panel family. `TalentWorkspaceShell` remains the domain-specific master/detail composition; the searchable roster is no longer page-specific.
- Residency Calendar: page-specific implementation profile adopted. It reuses core tokens and cross-cutting interaction principles, but its numeric breakpoints, seven-day grid, command bar, Batch/Share structures, and Schedule Daypart anatomy remain Calendar-local rather than shared system components. Mobile remains deferred.
- Residency Day Parts: page-specific implementation profile adopted. It uses the shared Residency page surface/header/body and core tokens while keeping its weekly operational grid and editors route-specific. The Compact Collection Panel is intentionally not used.
- Other Residency pages: not yet migrated and require separate review.
