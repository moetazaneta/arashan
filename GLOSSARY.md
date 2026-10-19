# Arashan

Arashan keeps the records of a sheep farm: the sheep and their pedigree, the flocks and the shepherds, the feed, the expenses, and the income.

## Language

### Farm and people

**Farm** (рус. ферма):
The unit that owns all the data. Each Sheep, Flock, Shepherd, Location, Resource, Expense, and Income belongs to one Farm.
_Avoid_: Tenant, organization, household, хозяйство

**User** (рус. пользователь):
A person who has an account and can log in to the app.
_Avoid_: Account

**Member** (рус. участник):
A User who has access to a Farm. A Member has one Role in that Farm. One User can be a Member of more than one Farm.
_Avoid_: Employee, staff

**Role** (рус. роль):
What a Member can do in a Farm: Admin (manages the Farm and its Members) or Editor (does all other work).

**Owner** (рус. владелец):
The Member to whom a Sheep belongs. Each Sheep on the Farm has one Owner.
_Avoid_: Holder

**Operator** (рус. оператор):
The person who runs the app for all Farms. Only the Operator creates a Farm.

**Invite** (рус. приглашение):
A one-time link that makes a logged-in User a Member of one Farm, with one Role. It works for 7 days after it is made. The first Invite of a Farm comes from the Operator and gives the Role Admin.
_Avoid_: Invitation code, ссылка (when you mean the Invite)

**Shepherd** (рус. чабан):
A hired person who herds one or more Flocks. A Shepherd is not a User and cannot log in.
_Avoid_: Worker, hired worker, employee, наёмный

### Sheep

**Sheep** (рус. баран):
One animal of the Farm, of any sex and any age.
_Avoid_: Animal, head, овца (when you mean any Sheep)

**Ram** (рус. самец):
A male Sheep.

**Ewe** (рус. самка, овца):
A female Sheep.

**Lamb** (рус. ягнёнок):
A Sheep that is younger than the lamb age of its Farm.

**Mother** (рус. мать):
The Ewe that gave birth to a Sheep.

**Father** (рус. отец):
The Ram that sired a Sheep.

**Tag** (рус. бирка):
The number on the ear tag of a Sheep. People use the Tag to identify a Sheep in daily work.
_Avoid_: ID, number

**Passport** (рус. ветпаспорт):
The official veterinary document that shows that a Sheep is a legitimate Arashan. Only a Sheep with 100 percent Arashan can have a Passport.

**Grade** (рус. класс):
The class that a Sheep got at grading (бонитировка): Elite, First, or Second. A Grade does not depend on the Passport.
_Avoid_: Class, category

**Breed** (рус. порода):
A named type of sheep, for example Arashan.

**Arashan** (рус. арашан):
The main Breed of the Farm.

**Breed composition** (рус. состав породы):
The percent of each Breed in one Sheep. The sum of the percents is 100. If a parent is not known, a part of the Breed composition is Unknown.
_Avoid_: Bloodline, purity

**Status** (рус. статус):
The state of a Sheep in its life on the Farm: Active, Sold, Slaughtered, Dead, or Lost. Only an Active Sheep is on the Farm now. A change of the Status has a date. Slaughtered and Dead are final; a Lost Sheep can become Active again when it is found.

**Origin** (рус. происхождение):
How the Farm knows a Sheep: Born on the Farm, Bought, or External.

**Initial entry** (рус. начальный ввод):
The registration of a Sheep that was on the Farm before the Farm started to use the app. An Initial entry has Origin Born or Bought, but it needs no birth date and no Purchase.

**External Sheep** (рус. внешний баран):
A Sheep that was never on the Farm. The Farm records it only as the Mother or the Father of its own Sheep.

**Lambing** (рус. окот):
The event when an Ewe gives birth to one or more Lambs.

**Sale** (рус. продажа):
The event when the Farm sells one or more Sheep for one total price. A Sale always has a price, and the Farm gets all the money on the day of the Sale.

**Purchase** (рус. покупка):
The event when the Farm buys one or more Sheep for one total price. A Purchase always has a price.

**Deal** (рус. сделка):
A Sale or a Purchase. A Member who made a deal by mistake cancels it: the deal and its Automatic record become Deleted. A cancelled Sale makes its Sheep Active again, and a cancelled Purchase makes its Sheep Deleted.
_Avoid_: Transaction, operation

### Flocks and places

**Flock** (рус. стадо):
A group of Sheep with its Shepherds and its Location. At one time, a Sheep is in one Flock or in no Flock.
_Avoid_: Herd, group, отара

**Location** (рус. место):
A place where a Flock stays, for example a pasture, a sheepfold (кошара), or a yard.
_Avoid_: Pasture, place, пастбище (when you mean any Location)

### Feed

**Resource** (рус. ресурс):
A material that the Farm keeps in stock and gives to Flocks, for example hay or grain. Each Resource has one unit of measure.

**Stock** (рус. запас):
The quantity of a Resource that the Farm has now.

**Restock** (рус. пополнение):
An event that adds a quantity of a Resource to the Stock, for example a hay purchase or the Farm's own hay harvest. A Restock can have a price.
_Avoid_: Purchase, закупка (when the Farm did not pay)

**Usage** (рус. выдача):
An event that gives a quantity of a Resource to a Flock and removes it from the Stock.
_Avoid_: Consumption, расход

**Adjustment** (рус. корректировка):
An event that corrects the Stock after a count, for example when hay rots.

**Norm** (рус. норма):
The quantity of a Resource for one Sheep for one day, for one of three groups: Ram, Ewe, or Lamb.

### Money

**Expense** (рус. расход):
Money that the Farm paid. An Expense has a date, an amount, and an Expense category.
_Avoid_: Cost, spending, затрата

**Expense category** (рус. категория расхода):
A type of Expense, for example shearing or cameras. Each Farm has its own list. A treatment is an Expense of the category «Лечение»: the app has no separate record for it.

**Income** (рус. доход):
Money that the Farm got. An Income has a date, an amount, and an Income category.
_Avoid_: Revenue, earnings, выручка

**Income category** (рус. категория дохода):
A type of Income, for example wool or meat. Each Farm has its own list. The sale of wool is an Income of the category «Шерсть», without the weight.

**Money record** (рус. запись):
An Expense or an Income. A rule that is the same for both kinds talks about money records.
_Avoid_: Transaction, operation, операция

**Scope** (рус. к чему относится):
What a money record is about: the Farm as a whole, one Flock, or one Sheep. The Farm is the default.

**System category** (рус. системная категория):
An Expense category or an Income category that the app uses for automatic records, for example the category of a Sale. A Member cannot rename, archive or delete it, and cannot select it for a manual record.

**Automatic record** (рус. авто-запись):
An Expense or an Income that a Sale, a Purchase, or a Restock with a price makes. It shows the same amount as its source event, and it goes away only when someone cancels that event.

### Records

**Archived** (рус. в архиве):
A record that is correct but not in use now, for example a Shepherd who left. History and reports show Archived records, but forms do not show them.

**Deleted** (рус. удалён):
A record that someone made by mistake. Reports do not show Deleted records, but a Member can restore them. The app never erases a record.

**Audit entry** (рус. запись журнала):
A record of one change: who made it, when, with which command, and to which record. The audit log keeps all audit entries, and nothing changes or erases them. The history of a record shows its audit entries.
_Avoid_: Log line, event
