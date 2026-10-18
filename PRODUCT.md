# Product

## Register

product

## Users

The Members of a Farm: the Admin and the Editors. They keep the records of the farm on a laptop or a
desktop computer, usually after the work with the flocks. The Operator uses the same app to create
Farms. In v1 the app is for a large screen only: there is no mobile layout.

The users know the farm well and use the app often. They are not designers or developers, and the app
must not need training.

## Product Purpose

Arashan keeps the records of a sheep farm: the Sheep and their pedigree, the Flocks and the Shepherds,
the feed, the expenses and the income. It replaces notebooks and spreadsheets with one shared record.

The jobs, in order of importance:

1. **Record events fast:** a lambing, a sale, a death, a feed restock or usage, an expense. Each event
   takes a few seconds and few clicks.
2. **See the state of the Farm:** the head count, the money and the feed stock.
3. **Find a Sheep:** find a Sheep by its Tag and see its card, pedigree and history.

Success: a Member records the events of a day in a few minutes, and the records are complete and
correct.

## Brand Personality

Neat, quiet, precise. The feel of Linear: calm surfaces, exact alignment, fast responses, no
decoration. The data is the main thing on each screen. The interface does not call attention to
itself.

## Anti-references

- Rustic farm decoration: wood textures, sheep illustrations, hand-drawn fonts.
- SaaS dashboards with big metric cards, gradients and charts on each screen.
- Loud colors and many colored badges. Color shows state or danger only.
- Heavy enterprise ERP forms with dense grids of small fields and many tabs.

## Design Principles

1. **Entry first.** The most frequent action on a screen is the easiest one: few clicks, good defaults,
   keyboard support.
2. **Quiet by default.** No decoration. Color and weight show what is important, not what is pretty.
3. **Data is the interface.** Tables and records are the main surface, clear and easy to scan.
4. **No surprises.** Each action shows its result at once. Nothing is erased (ADR 0005), so a mistake
   is easy to undo.
5. **The farm's words.** The UI uses the terms of the glossary, in Russian, as the farm says them.

## Accessibility & Inclusion

- WCAG 2.2 AA: text contrast, focus that is easy to see, all actions available from the keyboard.
- A light theme and a dark theme. Both themes meet the same contrast targets.
- Respect `prefers-reduced-motion`.
- Do not show state by color alone: add a text or an icon.
