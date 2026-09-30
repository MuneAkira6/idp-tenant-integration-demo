# Feature Specification: Sign-in and tenant integration with the group platform

**Feature Branch**: `001-idp-tenant-integration` (the spec folder; no branch is created by an agent)

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Acme Tasks, a multi-tenant task-management SaaS with its own accounts and
sessions, joins a group-wide account and tenant platform. Users of integrated tenants sign in with
their group account; other clients call the existing API with platform tokens; roles follow the
platform; tenant lifecycle and device data come from the platform through signed events and pulls;
integrated tenants see a UI shaped for them. Tenants that are not integrated must not change, and
everything is off until configured."

## Clarifications

### Session 2026-09-30

Decided by a human, one question at a time, each against a recommendation.

- Q: How is the application's own session kept after a platform sign-in? → A: On the server: the
  browser holds only an opaque session cookie, and the platform tokens are kept encrypted on the server.
- Q: What happens to a platform role that has no mapping in the application? → A: The user gets the
  lowest application role of the tenant, and a warning naming the role is logged.
- Q: What does deleting a tenant on the platform do to its data in the application? → A: The tenant is
  marked deleted (a tombstone): sign-in and API calls for it are refused, its data is kept and removed
  30 days after the deletion.
- Q: How are hourly timers and 30-day expiries verified without waiting for them? → A: The running
  system uses the real intervals; automated tests advance an injected clock and say so. The case study
  waited for the real timer; the demo's different approach is stated in the README.
- Q: What does an integrated tenant no longer see, and where do its users land? → A: Password
  management, user invitations and tenant deletion, which the platform owns, are hidden; users land on
  the task board. All of it is decided in one registry; tenants that are not integrated are unaffected.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with the group account (Priority: P1)

A member of an integrated tenant opens Acme Tasks, is sent to the group platform's sign-in, signs in
there and comes back signed in to Acme Tasks as the right user of the right tenant. From then on the
application treats them exactly like any other signed-in user.

**Why this priority**: without it nothing else in the integration is reachable by a person.

**Independent Test**: with one integrated tenant configured, a browser completes the sign-in and lands
on the application's landing page with a session that the existing pages accept.

**Acceptance Scenarios**:

1. **Given** an integrated tenant and a user who exists on the platform, **When** the user starts
   sign-in in Acme Tasks and completes it on the platform, **Then** they arrive signed in to Acme
   Tasks, as that user, in that tenant.
2. **Given** a sign-in started in one browser, **When** the platform's answer is replayed in another
   browser, **Then** it is refused.
3. **Given** a signed-in user whose platform session has been ended, **When** the application next
   refreshes it and the platform explicitly refuses, **Then** the application session ends too.
4. **Given** a signed-in user, **When** the platform cannot be reached during a refresh, **Then** the
   application session survives and the refresh is tried again later.
5. **Given** a request that claims another tenant through its host name, **When** the tenant is
   derived, **Then** it comes from the signed identity only.

---

### User Story 2 - Other clients use the existing API with a platform token (Priority: P1)

Another group service holds a platform token for a user and calls Acme Tasks' existing API with it.
The call is served as that user, without creating a session and without writing anything on the way
in, except the one-time creation of a user who has never been seen.

**Why this priority**: the platform's value to the group is that one identity works everywhere.

**Independent Test**: a scripted client with a platform token reads the user's tasks through the
existing API; the application's stored sessions and users are unchanged afterwards (after the first
contact).

**Acceptance Scenarios**:

1. **Given** a valid platform token of an integrated tenant, **When** a client calls an existing API
   operation with it, **Then** the operation runs as that user.
2. **Given** a token that is expired, has the wrong audience or comes from an unknown issuer, **When**
   it is presented, **Then** the call is refused as unauthenticated.
3. **Given** a request that already carries an application session, **When** it also carries a token,
   **Then** the application session decides and the token is ignored.
4. **Given** a user never seen before, **When** eight requests for that user arrive at the same time,
   **Then** exactly one user record exists afterwards.

---

### User Story 3 - Roles follow the platform (Priority: P2)

An administrator changes a user's roles on the platform. The next time that user signs in, Acme Tasks
gives them the corresponding application roles — no more, no fewer.

**Why this priority**: access control that drifts from the source of truth is a security problem.

**Independent Test**: change a user's platform roles between two sign-ins and compare the application
roles and the number of writes.

**Acceptance Scenarios**:

1. **Given** a user with roles from several platform clients, **When** they sign in, **Then** the
   application roles are the mapping of the union of those roles, replacing what was stored.
2. **Given** a user whose roles did not change, **When** they sign in again, **Then** nothing is
   written.
3. **Given** a platform role with no mapping, **When** the user signs in, **Then** they get the lowest
   application role of the tenant, and a warning naming the role is logged.

---

### User Story 4 - Platform events arrive safely (Priority: P2)

The platform notifies Acme Tasks of changes by signed events. Every genuine event takes effect exactly
once, however often it is delivered and whatever the order; a forged, altered or stale event takes no
effect.

**Why this priority**: tenant sync depends on it, and an event channel is an attack surface.

**Independent Test**: send the same event three times, one with a bad signature and one with an old
timestamp; exactly one effect and two refusals are observed.

**Acceptance Scenarios**:

1. **Given** a correctly signed event, **When** it is delivered, **Then** it is acknowledged at once
   and processed afterwards.
2. **Given** the same event delivered again, **When** it arrives, **Then** it is acknowledged and has no
   second effect.
3. **Given** an event whose signature does not match its body, or whose timestamp is more than five
   minutes away, **When** it arrives, **Then** it is refused and has no effect.
4. **Given** events that were stored but not processed because the application stopped, **When** the
   application starts again, **Then** they are processed.
5. **Given** the application starting, **When** it is ready, **Then** it has registered its event
   subscriptions with the platform, with callback addresses taken from its own routes.

---

### User Story 5 - Tenants follow the platform (Priority: P2)

When a tenant is created or deleted on the platform, Acme Tasks follows. When an event does not say
enough, Acme Tasks asks the platform. It never confuses "the platform said no" with "the platform could
not be reached".

**Why this priority**: tenants are the unit of everything else in the application.

**Independent Test**: create and delete tenants on the mock platform, with events delivered twice and
out of order, and with the lookup refused or unreachable.

**Acceptance Scenarios**:

1. **Given** a tenant-created event, **When** it is processed, **Then** the tenant exists in the
   application, once.
2. **Given** a tenant-deleted event that arrives before the matching created event, **When** both have
   been processed, **Then** the tenant ends deleted.
3. **Given** a tenant-deleted event, **When** it is processed, **Then** the tenant is marked deleted:
   sign-in and API calls for it are refused, and its data is kept and removed 30 days later.
4. **Given** an event without the tenant's details, **When** it is processed, **Then** the application
   looks the tenant up on the platform with its own client credentials.
5. **Given** a lookup the platform refuses, **When** it happens, **Then** the event is recorded as
   rejected and not retried; **Given** a lookup that cannot reach the platform, **Then** it is kept
   pending, retried hourly and expires after 30 days.

---

### User Story 6 - Devices are kept current (Priority: P3)

The platform keeps each tenant's registered devices but sends no device events. Acme Tasks fetches
them every hour and when a tenant is created, and shows where each list came from and when it last
succeeded.

**Why this priority**: useful, but the application works without it.

**Independent Test**: fetch the devices of a tenant with more than one page of them; then make the
platform fail and check that the last successful time is unchanged.

**Acceptance Scenarios**:

1. **Given** a tenant with more devices than fit one page, **When** the pull runs, **Then** all of them
   are stored.
2. **Given** a failing pull, **When** it ends, **Then** the error and the time of the attempt are
   recorded and the time of the last success is unchanged.
3. **Given** the device pull switched off, **When** an hour passes, **Then** no pull runs.

---

### User Story 7 - Integrated tenants see a UI shaped for them (Priority: P2)

Users of an integrated tenant do not see the functions that the platform now owns, and land where
their work starts. A sign-in can never turn into a loop between the application and the platform.

**Why this priority**: showing a function that no longer works is worse than hiding it.

**Independent Test**: sign in as a user of an integrated tenant and of the tenant that is not
integrated, and compare what each can see and where each lands; then force a sign-in loop.

**Acceptance Scenarios**:

1. **Given** a user of an integrated tenant, **When** they sign in, **Then** the functions the platform
   owns are not shown and they land on the integrated landing page.
2. **Given** a user of the tenant that is not integrated, **When** they sign in, **Then** they see and
   land exactly as before.
3. **Given** a sign-in that would send the browser back to the platform again right after returning,
   **When** it happens within 60 seconds of completing sign-in, **Then** the application stops with an
   error page instead of redirecting.

---

### User Story 8 - Nothing changes until it is configured (Priority: P1)

An operator deploys the integration and switches it on tenant by tenant. Until then, nothing behaves
differently, and a missing setting fails closed.

**Why this priority**: the integration must be deployable before it is used.

**Independent Test**: with no integration settings at all, the tenant that is not integrated passes its
existing tests, and every token and event is refused.

**Acceptance Scenarios**:

1. **Given** no platform issuer configured, **When** any platform token is presented, **Then** it is
   refused.
2. **Given** no event signing secret configured, **When** any event arrives, **Then** it is refused.
3. **Given** a tenant whose integration flag is off, **When** its users use the application, **Then**
   nothing about the platform is visible or reachable.

### Edge Cases

- Eight first requests for one new user at the same moment.
- A refresh refused by the platform versus a refresh that cannot reach it.
- A token signed by a key the application has not seen yet (the platform rotated keys).
- An event delivered after its tenant was already deleted.
- A lookup that is still pending when the tenant is deleted.
- A device pull that fails on the second page.
- A user whose last platform role was removed.
- The same browser starting two sign-ins at once.

## Requirements *(mandatory)*

### Functional Requirements

**Sign-in and session**

- **FR-001**: The system MUST let users of an integrated tenant sign in through the platform with the
  authorisation code flow and a proof key, bound to the browser that started it.
- **FR-002**: The system MUST end every sign-in in the application's own session; the pages and
  operations downstream MUST NOT distinguish how the user signed in.
- **FR-003**: The system MUST keep the application session on the server: the browser holds only an
  opaque session cookie, and the platform tokens are kept encrypted on the server.
- **FR-004**: The system MUST end the application session when the platform explicitly refuses a
  refresh, and MUST keep it when the platform cannot be reached.
- **FR-005**: The system MUST derive the tenant from the signed identity's issuer and MUST ignore the
  host name for that purpose.
- **FR-006**: The system MUST end both sessions when the user signs out.

**Bearer tokens on the existing API**

- **FR-007**: The system MUST accept a platform token on the existing API only when the request carries
  no application session.
- **FR-008**: The system MUST verify the token's signature against the issuer's published keys, and its
  issuer, audience and expiry.
- **FR-009**: The system MUST serve a token-authenticated request without creating a session and
  without writing, except for creating a user seen for the first time.
- **FR-010**: The system MUST create a user seen for the first time exactly once, however many requests
  arrive at the same time.

**Roles**

- **FR-011**: The system MUST derive application roles at every sign-in from the union of the user's
  roles across the platform clients it knows, through one mapping table.
- **FR-012**: The system MUST replace the stored roles with the derived ones, and MUST NOT write when
  they are equal.
- **FR-013**: The system MUST map a platform role without a mapping to the lowest application role of
  the tenant, and MUST log a warning that names the role.

**Events**

- **FR-014**: The system MUST verify every event's signature over the raw body with the secret for that
  event type, compared in constant time.
- **FR-015**: The system MUST refuse an event whose timestamp is more than five minutes from its clock.
- **FR-016**: The system MUST store an accepted event under its delivery id before acknowledging it,
  acknowledge a repeated delivery id without a second effect, and forget delivery ids after 30 days.
- **FR-017**: The system MUST process stored events asynchronously, and on start-up and every hour MUST
  pick up events that were stored but not processed.
- **FR-018**: The system MUST register its event subscriptions with the platform at start-up, deriving
  the callback addresses from its own route table.

**Tenants**

- **FR-019**: The system MUST create a tenant once for a tenant-created event and mark it deleted for a
  tenant-deleted event, correctly whatever the order and however often each arrives.
- **FR-020**: The system MUST look a tenant up on the platform with its client credentials when an
  event lacks the tenant's details.
- **FR-021**: The system MUST record a lookup the platform refuses as rejected, and keep one that cannot
  reach the platform pending, retrying hourly and expiring after 30 days.
- **FR-022**: The system MUST refuse sign-in and API access for a deleted tenant, keep its data, and
  remove the data 30 days after the deletion.

**Devices**

- **FR-023**: The system MUST fetch each integrated tenant's devices every hour and when the tenant is
  created, following every page.
- **FR-024**: The system MUST keep, per tenant, the source of the list, the time of the last attempt,
  the time of the last success and the last error; a failure MUST NOT change the time of the last
  success.
- **FR-025**: The system MUST NOT pull devices while the device pull is switched off.

**What integrated tenants see**

- **FR-026**: The system MUST decide what an integrated tenant hides and where it lands in one place,
  and that place MUST answer "hide nothing, change nothing" for a tenant that is not integrated. For an
  integrated tenant it hides password management, user invitations and tenant deletion, and lands on
  the task board.
- **FR-027**: The system MUST send every path to sign-in through one gate.
- **FR-028**: The gate MUST stop with an error page instead of redirecting when a sign-in would restart
  within 60 seconds of completing one, and MUST allow a single retry marker per sign-in.

**Configuration and defaults**

- **FR-029**: The system MUST refuse every platform token while no issuer is configured, and every event
  while no signing secret is configured.
- **FR-030**: The system MUST default the device pull and each tenant's integration flag to off.
- **FR-031**: The system MUST keep the tenant that is not integrated working with its own password
  sign-in, unchanged.
- **FR-032**: The running system MUST use the real intervals (hourly pick-ups, retries and pulls;
  30-day expiries). Tests MAY advance an injected clock instead of waiting, and MUST say so where they
  do.

### Key Entities *(include if feature involves data)*

- **Tenant**: an organisation using Acme Tasks; whether it is integrated; its platform issuer; its
  state (active or deleted).
- **User**: a person in a tenant; for integrated tenants, the platform subject that identifies them;
  their application roles.
- **Application session**: what keeps a user signed in; for a platform sign-in, linked to the platform
  session.
- **Event delivery**: one received event, by delivery id: type, when received, when processed, when it
  may be forgotten.
- **Tenant lookup**: a pending or finished lookup of a tenant on the platform, with its outcome.
- **Device** and **device sync state**: a tenant's devices as last fetched, and per tenant the source,
  last attempt, last success and last error.
- **Event subscription**: what the application registered with the platform, and when.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user of an integrated tenant reaches the landing page within 10 seconds of starting
  sign-in on the local demo stack.
- **SC-002**: Eight simultaneous first requests for one new user leave exactly one user record; the same
  test without the uniqueness guard leaves more than one (the control is observed, not assumed).
- **SC-003**: An event delivered three times has exactly one effect; an event with a bad signature or a
  timestamp six minutes old has none.
- **SC-004**: Tenant events delivered twice each and in reverse order leave every tenant in the state the
  last platform change implies.
- **SC-005**: Across ten sign-ins with unchanged roles, the roles are written zero times.
- **SC-006**: After a failed device pull, the time of the last success equals the one before the
  failure.
- **SC-007**: A forced sign-in loop stops with an error page after at most one return to the platform.
- **SC-008**: With no integration settings, the tenant that is not integrated passes 100% of its
  existing checks, and 100% of tokens and events are refused.

## Assumptions

- The group platform is represented locally: an IdP with one realm per tenant, and a mock service for
  events, the tenant API and the device API. Their behaviour follows the author's published case study,
  not any real platform.
- Two integrated tenants and one tenant that is not integrated are enough to show every rule.
- Secrets reach the services through the environment; nothing secret is stored in the repository.
- Clocks on the demo stack are synchronised, so the five-minute timestamp window is meaningful.
