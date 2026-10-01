# Contract: the web client (`apps/web`, port 18401)

**AS-BUILT, 2026-09-30.** Frozen in G0 as part of `packages/contracts` and rewritten here in G6.

**AS-BUILT** — the client holds no permission table and no role list: there is no role literal anywhere
in `apps/web/src`. What it imports from `packages/contracts` is shapes and constants only. Its pages
call their API route and show the answer; a 403 becomes one sentence.

**AS-BUILT** — `/auth/*` and `/api/*` are proxied to the API by the Rsbuild dev server
(`apps/web/rsbuild.config.ts`), so the browser sees one origin, as it would behind a reverse proxy.

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
  board). **AS-BUILT**: a hidden page is not merely unlinked — its route renders "Not available"
  instead, so navigating straight to the address shows nothing of the page.
- Tenant that is not integrated: nothing hidden; landing `/home` (as before). Every function returns
  "nothing hidden" before looking at anything else when `integrated` is false. (FR-026)

## The auth gate

Every route that needs a user renders through one `AuthGate`, and every path to sign-in (a 401 from the
API, an expired session, an explicit "sign in" link) goes through it. (FR-027)

**AS-BUILT** — the one exit is `startSignIn` in `apps/web/src/auth/gate.tsx`, and it is the only place
in the client that navigates to `/auth/login`. It remembers which tenant is being signed into, so that
a return that carries no query can try again — and meet the guard — rather than falling back to the
sign-in page. For the tenant that is not integrated the same function routes to the application's own
password form instead (FR-031).

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
