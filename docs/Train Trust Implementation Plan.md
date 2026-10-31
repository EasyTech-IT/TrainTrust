# Train Trust: Implementation Plan

Version 0.1 · 29 October 2026 · Based on PRD v0.1 · Assumes one developer at about 15 to 20 hours per week

All durations are estimates, not guarantees. Review them at the end of every phase.

## 1. Plan at a glance

| Phase | Goal | Weeks | Exit gate |
| --- | --- | --- | --- |
| 0. Validate | Prove data access and demand, clear name and legal basics | 1 to 3 | Go or no-go decision |
| 1. Design | Flows, wireframes, design system, click prototype | 4 to 6 | Prototype tested with about 5 riders |
| 2. MVP build | Core app, API, trust rules and admin panel for one region | 7 to 22 | All Must requirements done and tested |
| 3. Beta and launch | Closed beta, store release | 23 to 28 | Stable release in both stores |
| 4. Version 1.1 | Live map, push alerts, Premium subscription | 29 to 36 | First paying subscribers |

Total: about 8 to 9 months from today to Premium. The MVP itself is ready for beta after about 5 months.

## 2. Working agreements

- One language across the stack: TypeScript for app, API and admin panel.
- One repository with the folders app, backend, admin and db. The existing scaffold is the starting point.
- Two-week sprints with a Monday plan (30 minutes) and a Friday demo to yourself on a real device.
- Backlog in GitHub Projects. Every task has an owner (you), an estimate and a done-when line.
- Definition of done: code reviewed by you, tests written for logic, no secrets in the repository, works on a real phone, requirement ID noted in the commit message.
- AI coding assistants are used to speed up work, but every generated change is read, tested and understood before it is merged.

## 3. Phase 0: Validate (weeks 1 to 3)

| Work package | Tasks | Output |
| --- | --- | --- |
| WP0.1 Data access | Register at DB API Marketplace (Timetables, plan Free) and Mobilithek. Add keys to the scaffold and run the departure script with real data. Check header names, base URL and XML format against the documentation. Fix the parser and add a test with a real sample. Read the terms for commercial use. Ask DB about real-time forecast data and conditions | Working departure board with real data, written summary of terms and limits |
| WP0.2 Competitor teardown | Install DB Navigator, Railwise, Bahnsparer, Google Maps and use Zugfinder in the browser. Record main flows and screens. Collect 1 to 3 star reviews with links and count themes (three mentions from two sources minimum) | Filled competitor matrix and top complaint list |
| WP0.3 Interviews | 10 to 15 commuters. Ask what annoys them, which apps they use, what they do when a train is late, whether they would report and whether they would pay | Interview notes and a theme summary |
| WP0.4 Name and legal basics | Check Train Trust at DPMA and EUIPO, domains (.de, .com, .app), social handles and both app stores. Book a short consultation with a lawyer for privacy, user content and terms | Name decision, list of legal to-dos |
| WP0.5 Landing page and waitlist | Update the hero mockup to Train Trust, add a waitlist form with privacy notice, share in commuter groups | Live page and waitlist count |

**Gate (decide the numbers before you start):** a real-time data path is clear, enough interviewees would use it, the waitlist reaches your target, and the name is free. If the data path fails, pause or change scope before writing app code.

## 4. Phase 1: Design (weeks 4 to 6)

| Work package | Tasks | Output |
| --- | --- | --- |
| WP1.1 Flows and wireframes | Draw flows A to E from the PRD, wireframe every screen | Wireframes for all MVP screens |
| WP1.2 Design system | Colors, status tokens, type scale, spacing, icon set, components (status chip, train row, report sheet, report card) | Token file and component sheet |
| WP1.3 Click prototype | Link the screens for the main flows, including two-tap reporting | Clickable prototype |
| WP1.4 Usability test | Test with about 5 riders, time the report flow, note confusion | Findings and fixes |
| WP1.5 Backlog | Turn requirements into tickets with estimates, cut anything that does not fit the sprints | Prioritized backlog |

**Gate:** at least 4 of 5 testers complete a report without help.

## 5. Phase 2: MVP build (weeks 7 to 22)

Eight two-week sprints. The order follows dependencies: data first, then accounts, then reports, then trust rules, then admin.

| Sprint | Weeks | Focus | Deliverables | Done when |
| --- | --- | --- | --- | --- |
| S1 | 7 to 8 | Project setup and data layer | Repo and CI, staging server, error tracking, GTFS import for the launch region, stations table filled, hardened departures endpoint | Departure board data for the region comes from the API with tests |
| S2 | 9 to 10 | App shell and departure board | Expo app, navigation, home with search, station search, departure board screen, local favorites | Real board visible on a phone |
| S3 | 11 to 12 | Accounts | Login with Google, Apple and email, token check in the API, users table, account deletion | Sign up, sign in, delete account work on iOS and Android |
| S4 | 13 to 14 | Train detail and connections | Train detail with stops and official status, connection search A to B (MOTIS or own GTFS routing), favorite routes | A commuter route can be searched and saved |
| S5 | 15 to 16 | Reports | Create report endpoint, report sheet with two taps, report feed on the train detail, confirm and dispute, rate limits | A report from one phone appears on another within seconds |
| S6 | 17 to 18 | Trust and verification | Location check, confirmation threshold, trust score, privacy job that deletes reporter locations after 24 hours | Rules proven with simulated data and unit tests |
| S7 | 19 to 20 | Admin panel and safety | Report queue, approve, reject, remove, ban, moderation log, data-source health, content flags and user blocking | A moderator can handle a flagged report end to end |
| S8 | 21 to 22 | Hardening | Performance pass, offline cache for last board, accessibility pass, legal pages in the app, privacy-friendly analytics, end-to-end tests, bug bash | No open high-severity bugs |

**Scope control.** If a sprint slips by more than one week, cut in this order: favorite routes sync, connection search polish, offline cache, analytics. Never cut: location check, rate limits, moderation, account deletion, legal pages.

## 6. Phase 3: Beta and launch (weeks 23 to 28)

1. Create the Apple Developer account (99 USD per year) and the Google Play Console account (25 USD once). Check the current testing requirements for new Google accounts before planning the beta dates.
2. Distribute builds through TestFlight and a closed test on Google Play.
3. Recruit 20 to 50 riders in the launch region, ask them to report for two weeks, collect feedback in a simple form.
4. Watch the metrics from the PRD: reports per active rider, time to confirmation, accuracy, crashes.
5. Prepare store listings: name check, description, screenshots, privacy details, support contact.
6. Final legal review: privacy policy, terms, imprint, notice that community reports are unofficial.
7. Release, monitor errors daily for the first two weeks.

## 7. Phase 4: Version 1.1 (weeks 29 to 36)

| Work package | Tasks |
| --- | --- |
| Live map | Show trains of the region from real-time feeds on a MapLibre map, filters by line |
| Push alerts | Alerts for saved commute routes from official data and community-confirmed disruptions |
| Premium | Store billing, entitlement check in the API, Premium screen, commuter alerts, delay-risk history, widgets, ad-free |
| Conversion test | Test price points with the waitlist and early users |

## 8. Environments and tools

| Need | Tool | Cost |
| --- | --- | --- |
| Editor and version control | VS Code, Git, GitHub | Free |
| App | Expo (React Native), Expo Go for testing, EAS for builds | Free tier to start |
| API and admin | Node.js, Fastify, TypeScript | Free |
| Database | PostgreSQL with PostGIS (Docker locally) | Free locally |
| Staging and production | One VPS, Docker, reverse proxy with HTTPS | Roughly 5 to 20 EUR per month |
| Auth and push | Firebase Auth or Supabase, FCM and Apple Push | Free tier |
| Maps | MapLibre with OpenStreetMap and OpenRailwayMap | Check tile hosting terms |
| API testing | Bruno or Postman | Free |
| Error tracking | A hosted tracker with a free tier | Free tier |
| Design | The Design canvas here or Figma | Free tier |
| Stores | Apple Developer, Google Play Console | 99 USD per year, 25 USD once |

## 9. Testing strategy

- **Unit tests:** parsers, time conversion, trust and threshold rules, rate limits.
- **Integration tests:** API with a real PostgreSQL and PostGIS instance in Docker.
- **End-to-end tests:** the main flows on a device or emulator with a mobile test tool (for example Maestro).
- **Simulation:** scripted fake riders to test confirmation thresholds, spam and abuse cases.
- **Manual:** a small device matrix (one iPhone, one Android phone, one older device), poor network, airplane mode.
- **Security:** authorization checks on every endpoint, admin role separation, rate limiting, dependency updates, secrets scan.
- **Moderation drill:** before beta, create fake abusive reports and confirm the admin panel handles them.

## 10. Release checklist

- Real-time data terms confirmed in writing for the intended use.
- Privacy policy, terms and imprint live and linked in the app and in the store listings.
- Account deletion works and removes personal data.
- Reporter location deletion job runs daily and is monitored.
- Reporting, blocking and moderation tools work.
- Name, logo and store text contain no DB or Bahn trademarks.
- Backups of the database are running and a restore was tested.
- Error tracking and uptime alerts are active.
- Support email and a process for takedown requests exist.

## 11. Dependencies and critical path

Real-time data access leads to everything else. Accounts must exist before reports. Reports must exist before trust rules can be tested. The admin panel must exist before any public beta. The critical path is therefore: data access, data layer, auth, reports, trust rules, admin panel, beta.

## 12. Decision points and contingency

| Trigger | Action |
| --- | --- |
| No acceptable real-time data by the end of Phase 0 | Build on GTFS and the Free plan only, or pause the project |
| Waitlist or interviews show low demand | Narrow to one route or user group, or stop before Phase 2 |
| Sprint slips by more than one week | Apply the scope-cut order in section 5 |
| Fewer than expected reporters in the beta | Narrow the region, run a seeding campaign on the route, keep official data as the base |
| Legal advice requires changes | Add a hardening sprint before the beta |
| Other businesses need more of your time | Pause after a sprint, never in the middle of one |

## 13. Weekly routine and tracking

- Monday: 30 minutes to pick tasks for the week.
- Friday: demo on a real phone, update the backlog, write three lines of notes.
- End of each sprint: compare plan and actual hours, adjust the next sprint.
- End of each phase: review the gate, update this plan and the PRD.

## 14. First seven days

| Day | Task |
| --- | --- |
| 1 | Create accounts: DB API Marketplace, Mobilithek, GitHub, Expo. Install Node and Docker. Unpack the scaffold and run npm test |
| 2 | Add real keys, run the departure script, fix header names or parser if needed |
| 3 | Start the database with Docker, run the server, call the stations and departures endpoints |
| 4 | Install and test the competitor apps, record screens and flows |
| 5 | Write the interview questions, line up the first five commuters |
| 6 | Name checks at DPMA, EUIPO, domain registrars and both stores |
| 7 | Update the hero mockup to Train Trust, set up the waitlist form, write the DB data-access request |

## Open points before you start

1. Which launch region or commuter route?
2. Android first, iOS first, or both?
3. How many hours per week are realistic next to your other businesses?
4. Who moderates after launch?
