# HFY OS visual identity

**Direction:** Premium operational clarity with a calm, modern hospitality tone.  
**Reference:** The typography, palette, spacing, and component language were adapted from the visual system at [noveq.framer.website](https://noveq.framer.website). HFY retains its own name, product language, mark, workflows, and content.

## Brand principles

1. **Calm control** — the interface should feel composed even when the operation is busy.
2. **One system** — repeated shapes, spacing, and navigation behavior reinforce that every Residency belongs to the same operating platform.
3. **Hospitality, not enterprise software** — generous whitespace and editorial-scale typography keep the product warm and premium.
4. **Financial clarity** — money, status, and exceptions remain legible and restrained; decoration never competes with operational information.
5. **Private by design** — hotel-facing surfaces feel simpler and quieter than the internal desk.

## Color system

| Token | Value | Use |
|---|---|---|
| Ink | `#181818` | Primary text and high-emphasis controls |
| Midnight | `#071A31` | Sidebar, hotel navigation, login art |
| Ocean | `#0274DE` | Links, focus states, labels, primary accent |
| Sky | `#78A8E8` | Gradients, secondary accent, selected states |
| Paper | `#F0F0F0` | Application background |
| Surface | `#FBFBFB` | Cards, tables, forms |
| Muted | `#6E6E6E` | Supporting text and metadata |
| Line | `rgba(24,24,24,0.12)` | Borders and dividers |
| Danger | `#B74337` | Failed automations and blocking exceptions |

Blue is the only expressive brand accent. Green, amber, and red are reserved for operational meaning such as paid, pending, and failed.

## Typography

- **Display and headings:** Plus Jakarta Sans, weights 600–700.
- **Interface and body:** Inter, weights 400–700.
- **Large headings:** tight tracking (`-4%` to `-4.5%`) and compact line height (`1.02`).
- **Body copy:** 14–15px with a line height around `1.55`.
- **Labels:** concise, 10–12px, medium or bold. Use sentence case rather than aggressive all-caps.

The combination should feel editorial and direct. Serif display type is not part of this system.

## Shape and spacing

- Cards: `24px` corner radius.
- Inputs: `14px` corner radius.
- Buttons and navigation states: fully rounded pills.
- Main page gutters: approximately `46–72px` on desktop and `18–28px` on mobile.
- Card gaps: `18–24px`.
- Use thin, low-contrast borders and very soft blue-black shadows.

## Navigation

- Internal navigation sits on a Midnight gradient foundation.
- Active items use a quiet translucent-white pill rather than a bright block.
- The HFY mark uses a blue gradient tile and must always retain the `HFY` lettering.
- The Residency switcher belongs at the top of operational views, not inside individual records.

## Components

### Buttons

- Primary operational action: near-black pill with white text.
- Branded or confirmation action: Ocean-to-Sky gradient pill.
- Secondary action: translucent white or light-gray pill with a thin border.
- Destructive action: Danger color only when the action is genuinely destructive.

### Cards

- Use cool-white translucent surfaces.
- Prefer borders and spacing over heavy dividers.
- Keep a single dominant heading per card.
- Metrics use Plus Jakarta Sans and tight tracking.

### Status

- Pending HFY Confirmation: pale blue with Ocean text.
- Confirmed, approved, sent, and paid: restrained green.
- Neutral workflow states: cool gray.
- Failed or blocked: restrained red.

## Future client-facing distinction

No separate client-facing surface is active in the current pilot. If role-based client access is added later, it should use the same identity while removing operational density:

- No financial metrics or rate colors.
- Fewer controls and less navigation.
- Larger spacing around the calendar and selection form.
- The Midnight header establishes trust and clearly names the hotel's Residency.

## Imagery

HFY OS does not copy NoveQ's flower or portrait imagery. If imagery is added later, use atmospheric hospitality details—light, texture, rooms, turntables, and architectural close-ups—with deep-blue grading and warm natural highlights.

## Accessibility

- Maintain WCAG AA contrast for body text and controls.
- Never communicate a status with color alone; always include a written label.
- Preserve visible focus rings using the Ocean accent.
- Keep interactive targets at least 43px high where practical.
