# HFY OS Design System V1

Version: 1.0
Status: Active — Settings benchmark and Overview proof of concept
Last updated: September 17, 2026

This document turns the approved client Settings benchmark into reusable implementation rules. It complements `docs/BRAND_GUIDELINES.md`: the brand guide defines the visual identity, while this document defines the page-level components and tokens that enforce it in HFY OS.

## Locked layer model

Every client workspace uses three layers in order:

1. The colored application canvas.
2. The translucent frosted page surface.
3. An opaque white Surface card for each distinct content section.

Primary section content must not sit directly on the frosted page surface. A frosted card variant is retained only for an explicitly approved benchmark such as Platform Invoice History.

## The eight shared pieces

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

## Responsive rules

- Four-item fact grids use only four columns, an even 2 × 2 grid, or a one-column stack. A 3 + 1 state is prohibited.
- Metric grids may collapse only at a declared breakpoint; their cards retain the shared Surface treatment.
- Standard content begins at the same inset as sibling tabs and page-level controls.
- Desktop verification remains required at 1440px, 1200px, and 1024px, plus continuous resizing through intermediate widths.

## Adoption status

- Settings → Account: authoritative benchmark, now rendered through shared primitives.
- Settings → Billing: authoritative benchmark, now rendered through shared primitives.
- Residency Overview: first proof of concept. Its existing content, links, data, and behavior are unchanged; only the page composition and styling consume V1 primitives.
- Other Residency pages: not migrated by this task and require separate review.
