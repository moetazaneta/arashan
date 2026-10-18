# The Breed composition is computed from the pedigree, not stored

A Sheep stores only its Mother, its Father, and the parts of its Breed composition that a Member gave by hand for the unknown parents. The app computes the whole composition from the pedigree each time it reads it. We did this because the composition of a Sheep changes with each change of an ancestor: a stored composition needs a write to each descendant, and an audit entry and a conflict risk for each one. A computed composition is always correct, and no command writes more than the Sheep that it changes.

The parts are integers in millionths, so that the sum is exact and a Passport can check "100 percent Arashan" as an equality.

## Considered Options

- **Store the composition on each Sheep, and write all descendants on each change.** Rejected: one change of an old Ram writes hundreds of Sheep, and their history shows changes that nobody made to them.
- **Decimal percents.** Rejected: the sum of decimal parts is not exact, and the halves of each generation give long fractions.

## Consequences

- A query that shows many compositions reads the Sheep of the Farm one time (the table already does), and a card reads the ancestors of its Sheep.
- A report of the compositions on a past date is not possible: the app keeps no history of the compositions.
