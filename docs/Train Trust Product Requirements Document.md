# Train Trust: Product Requirements Document

Version 0.1 · 29 October 2026 · Status: draft for Phase 0 validation · Owner: Easy

## 1. Overview

**One-liner:** Train Trust is a community-based train app for Germany that combines official timetable and real-time data with live reports from passengers on board.

**Problem.** Official real-time information often lags behind what passengers experience, and delay reasons are poorly explained. Public discussion of the DB Navigator criticizes vague or missing delay reasons, a commuter widget that cannot be limited to regional traffic, and alternatives that only show later connections. Existing third-party apps focus on historical punctuality (Railwise), price (Bahnsparer) or raw data (Zugfinder, bahn.expert). In our research we found no app that shows passenger reports on causes, comfort and crowding to all other riders. This is not proven and must be verified in both app stores.

**Solution.** One app with normal connection search, departure boards and a live map, plus a community layer: passengers on board report delays, cancellations, crowding and defects in two taps. Other riders see these reports within seconds, marked as unconfirmed until enough independent riders agree.

**Product principle.** Official data is the foundation, community reports are a correction and context layer on top. The app never depends on reports alone.

## 2. Goals and non-goals

**MVP goals**

1. A reliable departure board and connection search for one launch region.
2. Reporting a problem in at most two taps, visible to others within seconds.
3. A trust mechanism that keeps spam and fake reports out.
4. An admin panel for moderation and data-source monitoring.
5. Evidence on whether people will pay for Premium.

**Non-goals for the MVP**

- Ticket sales and payments for train tickets.
- Nationwide coverage from day one.
- AI features (planned for later, not part of the MVP).
- Chat rooms and a general social feed.
- Selling data to transport companies (B2B, possible later).

**Success metrics.** Targets are set after Phase 0 and the waitlist test.

| Metric | Why it matters | Target |
| --- | --- | --- |
| Weekly active users in the launch region | Adoption | \[TBD\] |
| Share of active riders who file at least one report per month | Community health | \[TBD\] |
| Median time from first report to confirmation | Speed of the community layer | \[TBD\] |
| Share of confirmed reports later contradicted by official data or moderators | Accuracy | \[TBD\] |
| Day-30 retention | Stickiness (habit trackers lose most users within weeks) | \[TBD\] |
| Free-to-Premium conversion | Business model | \[TBD\] |

## 3. Target users

| Persona | Needs | Key pain point |
| --- | --- | --- |
| Daily commuter | Reliable alerts for a fixed route, quick alternatives | Official apps react slowly and explain little |
| Occasional long-distance traveler | Connection safety, platform and train composition info | Missed connections, unknown reasons for delays |
| Rail enthusiast / power user | Detailed live data, history, stats | Data scattered over several tools |

## 4. Scope by release

| Release | Content |
| --- | --- |
| MVP (one region) | Accounts, station search, departure board, connection search, train detail, reports and confirmations, trust and rate limits, favorites, admin panel, legal pages |
| V1.1 | Live map, push alerts, Premium subscription, widgets |
| Later | More regions, delay-risk history, seat and car-composition reports, gamification, optional AI features, B2B insights |

## 5. Functional requirements

Priority: Must, Should, Could.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Sign up and sign in with Google, Apple and email (Apple sign-in is required on iOS when other social logins are offered, to be verified in the current store rules) | Must |
| FR-2 | Delete account and personal data inside the app | Must |
| FR-3 | Station search with autocomplete | Must |
| FR-4 | Departure board per station: planned and actual time, platform, delay, cancellation | Must |
| FR-5 | Connection search A to B with transfers and platforms | Must |
| FR-6 | Favorite stations and routes | Must |
| FR-7 | Train detail: stops with planned and actual times, official status, community report feed | Must |
| FR-8 | Report in at most two taps from the train detail: delay (with minutes), cancelled, on time, crowded, defect, climate, no Wi-Fi, toilet, platform change, other (comment up to 280 characters) | Must |
| FR-9 | Other riders can confirm (Same here) or dispute (Not true) a report | Must |
| FR-10 | Visibility rules: new reports appear labeled as unconfirmed, status changes to confirmed after the threshold in section 8 | Must |
| FR-11 | Users can flag a report and block another user | Must |
| FR-12 | Location check: reporter is near the train or its route, movement is plausible | Must |
| FR-13 | Rate limits per user and per train | Must |
| FR-14 | Trust score per user that weights confirmations (simple version in the MVP) | Should |
| FR-15 | Live map of trains in the launch region from real-time feeds | Should |
| FR-16 | Push alerts for saved routes: official delay or cancellation, community-confirmed disruption | Should |
| FR-17 | Premium subscription through store billing | Should |
| FR-18 | Admin panel: report queue, approve, reject, remove, ban and unban users, moderation log, data-source health, role management | Must |
| FR-19 | German UI first, English later | Must |
| FR-20 | Imprint, privacy policy and terms reachable in the app | Must |

## 6. Key user flows

**A. Follow a train.** Search station, open departure board, tap a train, see stops, official status and community reports, save as favorite.

**B. Report a problem.** Open train detail, tap Report, choose a type (for example Delay), optionally set minutes, send. The app checks location in the background and shows the report as unconfirmed.

**C. Confirm a report.** A rider on the same train sees a prompt (Is your train also delayed?) and answers Same here or Not true. Enough independent confirmations change the status to confirmed.

**D. Moderate.** An admin opens the queue, sees flagged or suspicious reports with context, approves or removes them, and can ban repeat offenders. Every action is logged.

**E. Subscribe.** A user sets a commute route, sees a Premium prompt for alerts, buys through the store, and receives push alerts.

## 7. Data sources

| Purpose | Source | Status |
| --- | --- | --- |
| Planned timetable | GTFS data (DELFI, gtfs.de or Transitous) | Free, check license |
| Real-time at stations | DB Timetables API, plan Free | Registration needed, terms for commercial use to be checked |
| Full real-time forecasts | DB RIS interfaces | Contract with DB required, request conditions in Phase 0 |
| Routing and live positions | MOTIS (open source), self-hosted | Needs own server |
| Quick prototyping | Transitous | Community-run, no guarantee, not for the product |
| Map | OpenStreetMap with MapLibre, OpenRailwayMap for rails | Check tile hosting |
| Login | Firebase Auth or Supabase | Free tier to start |
| Push | Firebase Cloud Messaging, Apple Push | Free |
| Car composition | No verified official source | Community reports first |

Unofficial endpoints and scraping of bahn.de are not used, because they are unstable and legally risky for a paid product.

## 8. Architecture and trust rules

```
GTFS and real-time feeds --> Ingestion --> Data fusion --> API --> App and admin panel
User reports --> Location check and trust score ----^
```

**Stack.** App: Expo (React Native) with TypeScript. API: Node.js with Fastify and TypeScript. Database: PostgreSQL 16 with PostGIS. Routing: MOTIS or an own GTFS import. Admin panel: web, TypeScript. Hosting: a VPS. A first project scaffold exists (Timetables API client, 7 passing tests, database schema validated against PostgreSQL with PostGIS). The Timetables API itself is not yet tested against real data.

**Trust rules (starting values, to be tuned with real data).**

- A single report only raises a risk value for the train section and is labeled unconfirmed.
- A disruption counts as confirmed when at least 3 independent reports from verified riders arrive within about 4 minutes on the same trip.
- Users with a high trust score count more, users with rejected reports count less.
- Location check: position near the route or station and a speed that fits the train.
- The reporter location is stored only for validation and deleted after 24 hours.

## 9. Data model (summary)

Tables in `db/schema.sql`: users, stations, trips, trip\_stops, reports, report\_votes, content\_flags, moderation\_actions, favorites, push\_tokens, subscriptions. Roles are user, moderator and admin.

## 10. Design and UX

**Principles.** Minimal and clear. Reporting in two taps, no long forms. Status is always shown with color, icon and text. Real-time state is the hero, secondary details stay one tap away.

**Screens.** Home with search and favorites, connection list, train detail with report button, report sheet, map, account, Premium, admin panel (web).

**Visual starting point (from the hero mockup).** Primary teal #0E6B5C, on time green #14663B on #DDF3E6, minor delay orange #8A4B08 on #FDEBD3, cancelled or major delay red #9C1C12 on #FADCD9, typeface Plus Jakarta Sans, Lucide icons. The mockup still uses the working title Gleispuls and must be renamed to Train Trust.

**Accessibility.** Text contrast of at least 4.5:1, touch targets of at least 44 px, real buttons and labels, no meaning by color alone, system font scaling respected.

## 11. Monetization

|  | Free | Premium |
| --- | --- | --- |
| Timetable, departure board, map | Yes | Yes |
| Read and write reports | Yes | Yes |
| Alerts for saved commute routes | Limited | Full |
| Delay-risk history for connections | No | Yes |
| Widgets and live activities | No | Yes |
| Ad-free | No | Yes |

The core stays free because the community needs many users. Price: \[to be tested with the waitlist, not guessed\]. Possible later: anonymized quality insights for transport associations or companies, only after legal review.

## 12. Non-functional requirements

- **Performance:** departure board loads quickly on mobile networks (target \[TBD\]); real-time responses cached for about 30 seconds to respect API limits.
- **Reliability:** the app keeps working with official data if the community layer is empty or down; last loaded boards are available offline.
- **Security:** HTTPS only, token-based auth, role-based admin access, rate limiting, secrets outside the code.
- **Privacy:** data minimization, location only for validation, deletion on request.
- **Quality:** unit tests for parsers and trust rules, test plan for the main flows.

## 13. Legal and compliance (verify with a lawyer before launch)

- Location data and user accounts fall under the GDPR: privacy policy, legal basis, data deletion, processor agreements.
- User-generated content needs reporting, blocking and moderation, which the store rules and EU platform rules may require.
- Liability for false reports, terms of use and a clear disclaimer that community reports are unofficial.
- Name and logo: do not use DB or Bahn; run trademark, domain and store-name checks for Train Trust.
- Terms of the official data sources for commercial use.
- Imprint and consumer information for the subscription.

## 14. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| No access to real-time data on acceptable terms | App has no reliable base | Clarify access in Phase 0, start with GTFS and the Free plan, request DB contract early |
| Cold start: too few reporters | Empty community layer | Launch on one commuter route or region, seed the community, official data as fallback |
| Fake or hostile reports | Loss of trust | Location check, thresholds, trust score, moderation |
| DB improves its own app | Less differentiation | Focus on causes, comfort and community, not on timetable search |
| Legal issues (privacy, content, name) | Delay or stop | Early legal review, privacy by design, name check |
| Time: solo development next to other businesses | Slow progress | Strict MVP scope, one language across the stack, small weekly milestones |

## 15. Roadmap (estimates, not guarantees)

| Phase | Content | Time |
| --- | --- | --- |
| 0. Validate | Data access, competitor teardown, 10 to 15 commuter interviews, landing page and waitlist, go or no-go | 2 to 3 weeks |
| 1. Design | Flows, wireframes, click prototype, design system, test with about 5 riders | 2 to 3 weeks |
| 2. MVP | Core features for one region | about 3 to 4 months at 15 to 20 hours per week |
| 3. Beta and launch | Closed beta, store release, enable subscription | 4 to 6 weeks |

Fixed costs in the first year are roughly 150 to 400 EUR (Apple 99 USD per year, Google 25 USD once, domain, server), not including legal advice and possible data contracts.

## 16. Open questions

1. Which launch region or commuter route?
2. Which exact terms and costs apply to DB real-time data for a start-up?
3. Is Train Trust free as a name (trademark, domains, stores)?
4. Android first, iOS first, or both?
5. Who moderates, and how much time per week is realistic?
6. Which Premium price and which features convert best?

## Sources

- Public reporting on the DB Navigator (GIGA, t3n, unitQ) for user complaints.
- iphone-ticker.de and mobiFlip for Railwise, Bahnsparer, DB Navigator real-time data and the Bayern connection request feature.
- Bundeskartellamt decision and press coverage on real-time data access for third parties.
- DB API Marketplace and Mobilithek documentation (to be read in Phase 0).
- MOTIS and Transitous project pages.
