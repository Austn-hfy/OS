# HFY OS Design System V1

Version: 1.1
Last updated: September 17, 2026
Changed this revision: Promoted the approved Talent searchable roster into the reusable Compact Collection Panel pattern, with semantic density tokens, shared Residency components, and browser-rendered visual regression coverage.

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

## Adoption status

- Settings → Account: authoritative benchmark, now rendered through shared primitives.
- Settings → Billing: authoritative benchmark, now rendered through shared primitives.
- Residency Overview: first proof of concept. Its existing content, links, data, and behavior are unchanged; only the page composition and styling consume V1 primitives.
- Residency Talent: adopted. The route uses the shared page surface, header, body, Surface cards, section header, fact grid, and Compact Collection Panel family. `TalentWorkspaceShell` remains the domain-specific master/detail composition; the searchable roster is no longer page-specific.
- Other Residency pages: not yet migrated and require separate review.
