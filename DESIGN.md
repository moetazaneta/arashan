---
name: Arashan
description: The records of a sheep farm, kept in a quiet, exact tool.
colors:
  canvas: "oklch(0.975 0.003 150)"
  surface: "oklch(1 0 0)"
  raised: "oklch(1 0 0)"
  hover: "oklch(0.955 0.004 150)"
  selection: "oklch(0.95 0.03 150)"
  line: "oklch(0.91 0.004 150)"
  line-strong: "oklch(0.86 0.005 150)"
  ink: "oklch(0.21 0.008 150)"
  ink-muted: "oklch(0.5 0.01 150)"
  primary: "oklch(0.52 0.13 150)"
  primary-hover: "oklch(0.47 0.12 150)"
  primary-ink: "oklch(0.48 0.12 150)"
  on-primary: "oklch(1 0 0)"
  focus: "oklch(0.62 0.13 150)"
  danger: "oklch(0.55 0.2 27)"
  warning: "oklch(0.55 0.13 70)"
  canvas-dark: "oklch(0.155 0.004 150)"
  surface-dark: "oklch(0.185 0.004 150)"
  raised-dark: "oklch(0.225 0.005 150)"
  hover-dark: "oklch(0.24 0.005 150)"
  selection-dark: "oklch(0.27 0.04 150)"
  line-dark: "oklch(0.28 0.005 150)"
  line-strong-dark: "oklch(0.34 0.006 150)"
  ink-dark: "oklch(0.95 0.003 150)"
  ink-muted-dark: "oklch(0.68 0.008 150)"
  primary-ink-dark: "oklch(0.76 0.13 150)"
  danger-dark: "oklch(0.7 0.17 25)"
  warning-dark: "oklch(0.8 0.13 75)"
typography:
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "\"tnum\" 1"
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  table-row:
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    height: "36px"
  table-row-selected:
    backgroundColor: "{colors.selection}"
  nav-item:
    textColor: "{colors.ink-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  nav-item-active:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink}"
  badge:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "20px"
---

# Design System: Arashan

## 1. Overview

**Creative North Star: "The Shepherd's Ledger"**

Arashan is a ledger, not a dashboard. A Member opens it in the evening, after the work with the
flocks, and records the events of the day: a Lambing, a Sale, a Restock of feed. The interface must
take those minutes and give nothing back but the record. It follows the feel of Linear: calm
neutral surfaces, exact alignment, small type, fast responses. PRODUCT.md says it plainly: "The data
is the main thing on each screen. The interface does not call attention to itself."

The system is dense but not cramped. Base text is 14px, data is 13px, controls are 32px high and
table rows are 36px. The app shell is a quiet canvas with a sidebar on it, and the content sits on
one inset surface with a hairline border. Depth comes from tone and lines, not shadows. One green,
taken from the highland pastures where the Arashan breed grazes, marks the primary action, the
current selection and the focus. Everything else is neutral.

The system rejects what PRODUCT.md rejects: rustic farm decoration (wood textures, sheep
illustrations, hand-drawn fonts), SaaS dashboards with big metric cards and gradients, loud colors
and many colored badges, and heavy enterprise ERP forms with dense grids of small fields and many
tabs.

There are two themes, light and dark, and both are first class. The app follows the system setting
and lets the Member change it. Motion is restrained: 150 ms state changes with an ease-out curve
(`cubic-bezier(0.25, 1, 0.5, 1)`), no entrances, no choreography. With `prefers-reduced-motion`, all
transitions are instant. In v1 the layout is for a large screen only (from 1024px wide): a sidebar of
240px and a content area that fills the rest.

**Key Characteristics:**

- Neutral surfaces with a faint green tint (chroma 0.003 to 0.005), one green accent.
- One type family, Geist, in three weights. Tabular figures in all data.
- Flat at rest. Hairline borders and tone separate the layers.
- Dense controls (32px) and rows (36px), with generous space between groups.
- Keyboard first: each frequent action has a shortcut, and focus is always visible.

## 2. Colors: The Pasture Palette

Restrained: tinted neutrals carry the screen, and one pasture green covers 10 percent of it at most.

### Primary

- **Pasture Green** (`oklch(0.52 0.13 150)`): the fill of the primary button, the checked checkbox,
  the active switch and the progress bar. White text on it reaches 5.2:1. It is the same in both
  themes, so a primary button looks the same at day and at night.
- **Pasture Green Deep** (`oklch(0.47 0.12 150)`): the hover and pressed state of the primary fill.
- **Pasture Ink** (`oklch(0.48 0.12 150)`, dark: `oklch(0.76 0.13 150)`): green as text, for links
  and for the label of the current item where a fill is too heavy. 6.2:1 on white, 9.1:1 on the dark
  surface.
- **Focus Green** (`oklch(0.62 0.13 150)`): the 2px focus ring in both themes. 3.4:1 on white and
  5.4:1 on the dark surface, above the 3:1 that a non-text indicator needs.

### Neutral

Light values first, dark values in parentheses.

- **Canvas** (`oklch(0.975 0.003 150)`, dark `oklch(0.155 0.004 150)`): the app shell and the
  sidebar.
- **Surface** (`oklch(1 0 0)`, dark `oklch(0.185 0.004 150)`): the inset content panel, tables and
  forms. In dark mode the content is lighter than the canvas, so it comes forward.
- **Raised** (`oklch(1 0 0)`, dark `oklch(0.225 0.005 150)`): popovers, menus, dialogs, the command
  palette.
- **Hover** (`oklch(0.955 0.004 150)`, dark `oklch(0.24 0.005 150)`): the hover of rows, menu items
  and ghost buttons, and the active nav item.
- **Selection** (`oklch(0.95 0.03 150)`, dark `oklch(0.27 0.04 150)`): selected table rows and the
  selected item in a list. A faint green, so the selection reads as the accent without a fill.
- **Line** (`oklch(0.91 0.004 150)`, dark `oklch(0.28 0.005 150)`): dividers, table rules, the border
  of the content panel.
- **Line Strong** (`oklch(0.86 0.005 150)`, dark `oklch(0.34 0.006 150)`): the border of inputs and
  secondary buttons, which must be visible as controls.
- **Ink** (`oklch(0.21 0.008 150)`, dark `oklch(0.95 0.003 150)`): all main text. 17.7:1 and
  16.1:1.
- **Ink Muted** (`oklch(0.5 0.01 150)`, dark `oklch(0.68 0.008 150)`): secondary text, column
  headers, field descriptions, placeholders, the icons of the nav. 6.0:1 and 6.5:1, so it is
  readable at 12px and as a placeholder.

### Semantic

- **Danger** (`oklch(0.55 0.2 27)`, dark text `oklch(0.7 0.17 25)`): errors, field errors, the
  destructive action. In a filled button, white text on the light value (5.4:1).
- **Warning** (`oklch(0.55 0.13 70)`, dark `oklch(0.8 0.13 75)`): a low feed stock, an expired
  invite. Text and icon only, never a fill.
- **Success** is Pasture Ink. The app has no second green.

### The shadcn mapping

The tokens map to the shadcn variables in `apps/web/src/styles.css`: `--background` is Surface,
`--sidebar` is Canvas, `--popover` and `--card` are Raised, `--muted` and `--accent` are Hover,
`--border` is Line, `--input` is Line Strong, `--foreground` is Ink, `--muted-foreground` is Ink
Muted, `--primary` is Pasture Green, `--ring` is Focus Green, `--destructive` is Danger.

### Named Rules

**The One Green Rule.** Pasture Green appears on 10 percent of a screen at most: the primary action,
the selection, the focus. A screen with two green buttons has one too many.

**The State Is Not Color Rule.** A color never carries a state alone. A Sold Sheep has the word
«Продан» next to it; an error has its message under the field.

**The No Pure Gray Rule.** Each neutral has chroma 0.003 to 0.01 at hue 150. A pure gray
(`oklch(L 0 0)`) is forbidden, except for pure white.

## 3. Typography

**Display Font:** none. Product UI does not need one.
**Body Font:** Geist Variable (with system-ui, sans-serif). It has the Cyrillic glyphs that the
Russian UI text needs.
**Label/Mono Font:** Geist Variable too. Numbers use tabular figures (`font-variant-numeric:
tabular-nums`), so a monospace font is not necessary.

**Character:** one neutral, slightly technical sans in three weights (400, 500, 600). Its precision
gives the Linear feel. Its calm keeps the farm records in front.

### Hierarchy

The scale steps are about 1.15 apart, in fixed rem. Fluid type is forbidden.

- **Headline** (600, 1.5rem / 24px, line-height 1.25, letter-spacing -0.015em): the title of a page,
  one per screen. «Овцы», «Корма», «Отчёты».
- **Title** (600, 1rem / 16px, line-height 1.4): the title of a section, a dialog or a side panel.
- **Body** (400, 0.875rem / 14px, line-height 1.45): text, form fields, buttons, menu items. Prose,
  such as a note on a Sheep, stops at 65ch.
- **Data** (400, 0.8125rem / 13px, line-height 1.4, tabular figures): table cells, Tags, dates,
  amounts, head counts. Amounts and counts align to the right.
- **Label** (500, 0.75rem / 12px, line-height 1.35): field labels, column headers, badges, the keys
  of shortcuts. Sentence case.

### Named Rules

**The Tabular Rule.** Each number that can sit above another number (a Tag, an amount, a count, a
date) uses tabular figures. Columns of numbers that do not line up are a defect.

**The No Caps Rule.** No uppercase text with wide tracking, also not in column headers or above
sections. Hierarchy comes from weight and color.

## 4. Elevation

The system is flat. Surfaces at rest have no shadow: the canvas, the inset content panel and the
tables are separated by tone and by 1px lines. A shadow appears only on a layer that floats above
the page and closes: a popover, a menu, a dialog, a toast. In dark mode the floating layer also gets
the Raised tone and a 1px Line border, because a shadow on a dark background is almost invisible.

### Shadow Vocabulary

- **Float** (`box-shadow: 0 4px 16px -4px oklch(0.21 0.008 150 / 12%), 0 1px 3px oklch(0.21 0.008
  150 / 8%)`): popovers, menus, the date picker, toasts.
- **Modal** (`box-shadow: 0 16px 48px -12px oklch(0.21 0.008 150 / 24%)`): dialogs and the command
  palette, over a backdrop of `oklch(0.155 0.004 150 / 40%)`.

### Named Rules

**The Flat At Rest Rule.** A card, a table or a panel on the page has no shadow. If a static surface
needs a shadow to stand out, the tones are wrong: fix the tones.

## 5. Components

The components are the shadcn/ui primitives in `apps/web/src/components/ui` (style `base-nova`, on
Base UI), with the tokens above. Each interactive component has these states: default, hover,
focus, active, disabled, loading, error. Focus is a 2px Focus Green ring with a 2px offset in the
Surface color, and it appears on keyboard focus only (`:focus-visible`).

### Buttons

Quiet and exact.

- **Shape:** slightly rounded corners (6px).
- **Size:** 32px high, 14px text in weight 500, 10px side padding, a 16px icon with a 6px gap. A
  small size of 28px goes in table rows and toolbars.
- **Primary:** Pasture Green fill, white text. One per view: the action that the screen is for,
  such as «Записать окот».
- **Secondary:** Surface fill, a 1px Line Strong border, Ink text. Hover gives the Hover fill.
- **Ghost:** no fill and no border, Ink Muted text. Hover gives the Hover fill and Ink text. For row
  actions and toolbars.
- **Destructive:** a secondary button with Danger text. A filled Danger button only in the dialog
  that confirms the action.
- **Hover / Active:** the fill changes in 150 ms. Active moves the button 1px down. Disabled has 50
  percent opacity and no pointer events. Loading keeps the width, shows a 16px spinner in place of
  the icon and blocks a second click.
- **Labels:** a verb and an object, as PRODUCT.md asks: «Добавить овцу», not «Добавить» or «ОК».

### Badges

- **Style:** 20px high, 12px text in weight 500, 4px radius, Hover fill and Ink Muted text. A badge
  holds a short state, such as the Status of a Sheep or a Grade.
- **State:** the Status «Активен» has no badge at all: it is the normal state. Other Statuses
  («Продан», «Забит», «Пал», «Потерян») use the neutral badge. Danger or Warning text in a badge
  only for a real problem, such as a low stock.

### Cards / Containers

- **The content panel:** one inset panel per screen, on the Canvas, with 8px corners and a 1px Line
  border, 8px from the sidebar and the window edges.
- **Inside the panel:** sections, not cards. Sections are separated by space (24px to 32px) and, if
  needed, by a 1px Line divider. A card inside the panel is forbidden.
- **Internal padding:** 24px at the sides of the panel, 16px in side panels and dialogs.

### Inputs / Fields

- **Style:** 32px high, Surface fill, a 1px Line Strong border, 6px corners, 14px text, 10px side
  padding. The label is above the field, in Label style, 6px from it.
- **Focus:** the border changes to Focus Green and the 2px focus ring appears.
- **Error:** the border and the ring change to Danger, and the message appears under the field in
  12px Danger text. The message says what to do.
- **Disabled:** Canvas fill and 50 percent opacity text.
- **Defaults:** a new event form fills in what it can: today's date, the last Flock, the last
  Location. The first field has focus when the form opens. `Enter` saves.

### Tables

The main surface of the app.

- **Rows:** 36px high, Data style, a 1px Line rule between rows, no zebra stripes. Hover gives the
  Hover fill. A selected row gets the Selection fill.
- **Header:** sticky, Label style in Ink Muted, a 1px Line rule under it, no fill. Sorting shows a
  12px arrow next to the label.
- **Numbers:** tabular figures, aligned to the right. Empty values show «—» in Ink Muted.
- **Row actions:** ghost buttons that appear on hover and on keyboard focus of the row.
- **Loading:** skeleton rows in the Hover tone, not a spinner in the middle.
- **Empty:** one line that says what goes here and the primary action to add it, such as «Здесь будут
  окоты. Записать окот».

### Navigation

- **Sidebar:** 240px, on the Canvas, with no border of its own (the content panel's border separates
  them). The Farm switcher sits on top, the main sections below, the user menu at the bottom.
- **Nav item:** 28px high, 14px text, a 16px Ink Muted icon, 6px corners. Hover gives the Hover fill.
  The active item has the Hover fill and Ink text with weight 500. No colored stripe.
- **Command palette:** `⌘K` / `Ctrl+K` opens a palette to find a Sheep by its Tag and to start any
  event form. It is a Raised dialog, 640px wide, with the Modal shadow.

### Event Entry (signature component)

The form that records an event, the most frequent action of the app. It opens in a side panel from
the right (480px, Raised, a 1px Line border and the Float shadow), not in a modal, so the table stays
visible. The panel has a Title, the fields in one column, and the primary button at the bottom with
its shortcut (`⌘↵`). After a save the panel shows a short toast «Окот записан» with an «Отменить»
action, and it stays open, clean, for the next event.

## 6. Do's and Don'ts

### Do:

- **Do** put the most frequent action of a screen in one Pasture Green primary button, with a
  shortcut.
- **Do** use tabular figures and right alignment for every number in a column.
- **Do** separate layers with tone and 1px lines: Canvas, then Surface, then Raised.
- **Do** keep every text at 4.5:1 or more in both themes, placeholders included (Ink Muted, 6.0:1
  and 6.5:1).
- **Do** keep state transitions at 150 ms with `cubic-bezier(0.25, 1, 0.5, 1)`, and make them
  instant with `prefers-reduced-motion`.
- **Do** check each new screen in the light theme and the dark theme before the merge.
- **Do** show a skeleton while a table loads and a one-line empty state with the action to fill it.

### Don't:

- **Don't** use rustic farm decoration: wood textures, sheep illustrations, hand-drawn fonts.
- **Don't** build SaaS dashboards with big metric cards, gradients and charts on each screen. A
  report is a table first.
- **Don't** use loud colors and many colored badges. Color shows state or danger only.
- **Don't** build heavy enterprise ERP forms with dense grids of small fields and many tabs. One
  column, few fields, good defaults.
- **Don't** put a card inside the content panel, or a card inside a card.
- **Don't** use a `border-left` or `border-right` over 1px as a colored stripe on a nav item, a row
  or an alert.
- **Don't** put a shadow on a surface at rest.
- **Don't** use uppercase labels with wide tracking.
- **Don't** open a modal for an event form. Use the side panel.
- **Don't** use pure gray neutrals, or a second green for success.
