# Contract: the web client (`apps/web`, port 18401)

Frozen in G0 as part of `packages/contracts`.

## The visibility registry

One module answers, for the signed-in tenant:

```ts
type Visibility = {
  hiddenPages: PageId[];        // routes that are not reachable and not linked
  hiddenTabs: TabId[];          // tabs inside visible pages
  hiddenSections: SectionId[];  // sections inside visible pages
  landing: RoutePath;           // where a completed sign-in lands
};
visibilityFor(session: SessionInfo): Visibility
```

- Integrated tenant: hidden pages `settings/password`, `users/invite`, `settings/delete-tenant`; hidden
  tab `settings/security`; hidden section `users/pending-invitations`; landing `/board` (the task
  board).
- Tenant that is not integrated: nothing hidden; landing `/home` (as before). Every function returns
  "nothing hidden" before looking at anything else when `integrated` is false. (FR-026)

## The auth gate

Every route that needs a user renders through one `AuthGate`, and every path to sign-in (a 401 from the
API, an expired session, an explicit "sign in" link) goes through it. (FR-027)

## The loop guard

- Stage 1: before sending the browser to sign-in, the gate sets a one-time marker in session storage;
  a second attempt while the marker is set stops.
- Stage 2: if a sign-in would start within 60 s of `sessionCreatedAt` from `GET /auth/session`, the gate
  shows the error page "Sign-in is looping" instead of redirecting.
- Either stage ends on the error page, with a link that clears the marker. (FR-028, SC-007)

## Permissions in the web client

The web client decides no permission. `/devices` and `/users` call their API routes and show the
answer; a 403 `forbidden` is shown as "You do not have permission to see this page". Links may be left
out for a role that cannot use them, but the server's answer is the check. (FR-033)

## Pages used by the tests

`/home`, `/board`, `/settings/password`, `/users/invite`, `/settings/delete-tenant`, `/settings`
(with the `security` tab), `/users` (with the `pending-invitations` section), `/devices`, `/error/loop`.
