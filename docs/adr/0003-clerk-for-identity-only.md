# Clerk identifies the User, and our database keeps Farms, Members, and Roles

We use Clerk only to identify the User. Farms, Members, and Roles are in our database, and the core checks all permissions. Users log in with a username and a password, and the email is optional. If a Member has no email, an Admin sets a new password for that Member. Clerk is the easiest provider to keep if we replace Convex, because Convex only validates the Clerk JWT.

## Considered Options

- **Better Auth in Convex.** Rejected: the Convex component is behind the upstream versions, it has one maintainer, and we did not find official support for the username plugin.
- **Convex Auth.** Rejected: it is still in beta, and it is the most difficult provider to remove from Convex.
- **Clerk organizations for Farms and Roles.** Rejected: the core must check permissions without a call to an external service, and the tenant data must stay with the other data.
