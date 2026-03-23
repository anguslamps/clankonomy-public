# Zola Frontend Audit

Commit reviewed: `4d4fb06`

## Summary

The web app has strong visual direction, but the implementation contract with the API is not coherent enough to ship. The biggest issues are compile failures, broken client/server data shapes, and navigation paths that point users at the wrong surfaces.

## Findings

- High: the web package does not type-check. `BigInt` is used in `AgentCard` while the package targets `ES2017`, and the generic `qs()` helper rejects the actual filter types used by `getBounties()` and `getAgents()`. Evidence: `apps/web/tsconfig.json:2-25`, `apps/web/src/components/AgentCard.tsx:30-36`, `apps/web/src/lib/api.ts:44-52`, `apps/web/src/lib/api.ts:75-77`, `apps/web/src/lib/api.ts:111-113`.
- High: the API client expects response shapes that the server does not return. `getBounties()` is typed as `{ data, total, page, limit }`, but the API returns `{ bounties, limit, offset }`, so the home page filters `bountiesData?.data` and will miss the actual payload. Evidence: `apps/web/src/lib/api.ts:68-79`, `apps/web/src/app/page.tsx:51-69`, `apps/api/src/routes/bounties.ts:48-113`.
- High: several client routes and methods do not match the backend at all. The web client posts submissions to `/submissions` while the API only implements `POST /bounties/:id/submit`, and hire actions use `POST` where the API exposes `PATCH`. Evidence: `apps/web/src/lib/api.ts:92-97`, `apps/web/src/lib/api.ts:141-156`, `apps/api/src/routes/bounties.ts:338-345`, `apps/api/src/routes/hires.ts:94-169`.
- Medium: primary navigation is miswired. The nav "Browse" link points to `/bounties` even though the browse UI lives at `/`, and the home page "View all" under active bounties points to `/create` instead of a browse/archive route. Evidence: `apps/web/src/components/Nav.tsx:8-13`, `apps/web/src/app/page.tsx:173-184`.
- Medium: the build is fragile because layout depends on `next/font/google`, which fails hard in restricted or offline environments. The review run hit that exact failure on `JetBrains_Mono`. Evidence: `apps/web/src/app/layout.tsx:1-12`.
- Low: some visible affordances are dead ends, such as the "Edit Profile" button, which renders without any action path. Evidence: `apps/web/src/app/profile/[address]/page.tsx:123-126`.

## Missing Tests

- Add package-level `tsc --noEmit` and `next build` checks for the web app.
- Add integration tests that boot against the API schema and verify real response shapes.
- Add route tests for navigation: `/`, `/agents`, `/create`, `/bounty/[id]`, `/profile/[address]`.
- Add action tests for submission and hire flows so method/path drift is caught before merge.

## 10x Recommendations

- Generate the frontend client from shared API contracts, or at minimum centralize response envelopes so web and API cannot drift independently.
- Make type-checking a gate, not a suggestion. Right now visual progress hides broken interfaces.
- Separate "landing page" and "browse page" intentionally if both are needed; otherwise align nav and CTA links to the actual browse surface.
- Prefer locally hosted fonts or a resilient fallback strategy so builds do not depend on Google Fonts availability.
