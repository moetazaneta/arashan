# The app never erases a record

No command erases a record. A record that is not in use now becomes Archived, and a record that someone made by mistake becomes Deleted and a Member can restore it. We did this because the records refer to each other (a Sheep is the parent of other Sheep, and an Income comes from a Sale), and because the history of the Farm must stay complete. Each repository hides Deleted records by default, so a query does not need its own filter.
