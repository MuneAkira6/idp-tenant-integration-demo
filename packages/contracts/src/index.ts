/**
 * The shared contracts of this feature, frozen in G0 before the parts that depend on them are built
 * (constitution VII).
 *
 * **AS-BUILT, 2026-09-30.** Every name and shape below survived the run unchanged: nothing here was
 * renamed or reshaped after the freeze, so this file is the frozen set and the built set at once. What
 * the run learned went into the prose of specs/001-idp-tenant-integration/contracts/*.md, marked
 * AS-BUILT there, and into facts.md F11 to F19 — chiefly that `aud` is a string or an array (F13),
 * that `resource_access` is in the access token and not the ID token (F18), and that a second client
 * of the same realm puts its own client id in `aud` (F19). The readers those facts required —
 * `audiences()` in tokens.ts — were part of the freeze already.
 *
 * Every name and shape here comes from the spec folder — specs/001-idp-tenant-integration/contracts/
 * (api, platform, web) and data-model.md — or from a measurement recorded in facts.md (the token
 * shapes, F12 to F16). Nothing here is invented at the call site.
 */

export * from './api.ts'
export * from './events.ts'
export * from './permissions.ts'
export * from './platform.ts'
export * from './roles.ts'
export * from './tokens.ts'
export * from './visibility.ts'
