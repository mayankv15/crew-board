# Crew Board

A coordinator's tool for a staffing company that places technicians on datacentre projects. It shows open positions, lets a coordinator assign the right person without breaking the booking rule, and shows whether the HR data it relies on is current.

- **API:** Node 24, TypeScript, Fastify, Zod, SQLite (plain parameterised SQL)
- **Web:** React 19, MUI 9 with the MUI X data grid, Redux Toolkit with RTK Query, Vite
- **Shared:** one package of Zod schemas and types used by both, so a changed field is a compile error on both sides
- **HR system:** `https://dummyjson.com/users`

## Run it

One command on a clean machine with Docker:

```bash
docker compose up --build
```

Open <http://localhost:8080> (set `WEB_PORT=8081` first if 8080 is taken). On first start it creates the database, adds three demo projects with nine positions, and pulls all 208 technicians from HR. If HR is unreachable it loads a bundled set of 60 instead, so the demo always has data.

Without Docker (Node 24 and npm 11 or newer; run `nvm use` in this folder first, it reads `.nvmrc`):

```bash
npm ci
npm run setup      # creates .env with a random webhook secret
npm run seed       # demo projects and positions, then a first HR sync
npm run dev        # API on :3000, web on http://localhost:5173
```

If something does not start, the usual cause is the wrong Node: check `node -v` prints `v24…`. Errors such as `tsx: not found` or `vite: not found` mean the dependencies were installed with another Node version; run `nvm use && npm ci` to put them right. The project stops with a plain message when it is started on an older Node.

## Tests and checks

```bash
npm test           # 117 API tests, 108 web tests
npm run typecheck
npm run lint       # zero warnings allowed (type-aware rules and accessibility rules)
npm run format:check   # Prettier; `npm run format` fixes it
npm run build
npm run knip       # finds unused code and dependencies
```

The same checks run on every push in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), followed by `npm audit` and a secret scan. Any failing step fails the run.

## The interface

Built with MUI on one small palette, each colour with one job: **indigo** is the brand and every action, **cyan-teal** means available, filled or healthy, **amber** means a conflict or something that needs attention, **rose** means an error or a failed run. The colours were chosen by research and measurement (contrast, and how well the status colours stay apart for colour-blind users) and a test keeps them that way; see [docs/COLOUR.md](docs/COLOUR.md). It follows the system light or dark setting and has a toggle in the header.

**Board.** A pinned header with the exact number of seats still to fill, then two tabs, **Open** and **Filled**, each with its count. Switching tabs slides the view across, as does moving between Board and HR sync; the board keeps its tab, sort, filters and page while you look at the sync page. Everything is in the address (`?tab=filled&sort=seats&skill=…`), so a refresh or a shared link opens the same view.

- **A real data table** (MUI X data grid) with **server-side pagination**: 10, 25, 50 or 100 rows a page, only that page is downloaded, and the count in the footer comes from the API so it stays exact. Changing the sort, filters, search or page size goes back to page one; the table steps back by itself if the page you were on no longer exists.
- **Sort** from the Sort menu or by clicking a column heading (Dates, Seats, Project); the two stay in step.
- **Search** the project name or skill. Press `/` anywhere on the board to jump to the search box.
- **Quick views**: four chips under the toolbar with live counts (needs replacement; starts within 7 days; unstaffed and starts within 14 days; partly staffed). One click applies the filter, a second clears it.
- **Filters** (behind one button, with a count badge and a removable pill for each): skill; running between two dates; starts within 7, 14 or 30 days; assigned to a person (by name); staffing (nobody assigned yet, or someone assigned); seats still open (1, 2, 3 or 5 or more); and "needs a replacement" (someone was deactivated by HR). All of it is applied on the server.
- **Page size** is remembered in the browser for the next visit. Clicking a row (outside its buttons) opens the people on that position.
- **Rows** show the project, skill, dates (with "Starts in 5 days", flagged when an open position starts within two weeks), seats as dots, and who is assigned. A row never grows: it shows the first person and "+N more", which opens a list of everyone with an Unassign button each, however many there are.
- **Actions**: one main button per row (**Assign** on open positions, **People** on filled ones) and a menu with three things the button does not do: more from this project, copy the assigned names, copy the position details for pasting into a message.
- **Assign drawer** slides in from the right with the header and search pinned. By default it lists only people who can take the position, which is far shorter than everyone; searching shows everyone matching, so a booking conflict is never hidden. It pages 25 at a time.

**HR sync.** The last ten runs with counts, errors and live progress, and a header chip on every page that says when HR data was last synced and whether it went well.

**Safety nets.** Unassigning is one click, so the toast offers **Undo** (which assigns the person again, subject to the booking rule). A refused booking stays in a banner in the drawer even after the refreshed list drops that person. "Try again" on any error refreshes everything. A loading screen shows instantly, before any script has loaded, so a slow connection never sees a blank page. The board refreshes when the window regains focus or the network returns.

Other behaviour: motion is light (drawer, tabs and pages slide, toasts slide up) and switches off for people who ask their system for reduced motion; every control works from the keyboard, dialogs trap and return focus, the arrow keys move between people and between tabs, a skip link jumps past the header and another jumps past a long table to its page controls; screens work from tablet width up (columns drop out and move under the project name as space runs out).

## UX and accessibility checks

These were run against the real stack in Chrome, not only in unit tests: an axe-core scan of every screen and state (board, filled tab, filters, sort menu, assign drawer, people dialog, HR sync, tablet width) in light and dark gave **zero violations** on the production build; the whole interface was walked with the keyboard alone (tab order, focus rings, Enter and Escape, arrow keys, the hidden tab having no tab stops); a booking conflict from a stale list, a slow network, the API being down and widths from 390 to 1440 pixels were all exercised. The axe scan also runs in the test suite, and a separate test guards colour contrast and colour-blind separation.

## Performance

Measured on a database at the scale in DESIGN.md (3,000 technicians, 2,000 positions): every list query takes under 8 ms, a booking about 0.3 ms, and the query plans use the indexes. The web app is about 360 kB of scripts over the wire on a first visit (the data grid is 217 kB of that), split so the libraries are cached across releases, with the drawer, people dialog and sync page loaded only when needed. nginx compresses scripts and API answers.

## Fire a test webhook

The script sends a correctly signed event using the secret from `.env`:

```bash
npm run webhook:test -- --type technician.deactivated --external-id 5
npm run webhook:test -- --type technician.updated --external-id 5 --city Dallas --state Texas
npm run webhook:test -- --type technician.deactivated --external-id 5 --replay     # second send returns 409
npm run webhook:test -- --type technician.updated --external-id 5 --bad-signature  # returns 401
npm run webhook:test -- --type technician.updated --external-id 5 --stale          # old timestamp, returns 401
```

With Docker the secret lives in the container, so run the same tool inside it:

```bash
docker compose exec api crew-cli webhook-test --type technician.deactivated --external-id 5
docker compose exec api crew-cli sync          # the sync job from the command line
```

Then reload the board: the person is still on their position, marked "Deactivated by HR", and the seat is open again.

## How skills and location are derived

HR has no skills field and no home location, so both are derived from what it does have. The rules are explicit in [`api/src/integration/mapping.ts`](api/src/integration/mapping.ts):

| HR field                                           | Becomes                                         |
| -------------------------------------------------- | ----------------------------------------------- |
| `company.department`                               | The main skill, from the table below            |
| `company.title`                                    | Extra skills when it contains a keyword (below) |
| `address.city`, `address.state`, `address.country` | Home location, filterable by city or state      |

| Department                               | Skill               |
| ---------------------------------------- | ------------------- |
| Engineering                              | network-engineering |
| Research and Development                 | server-installation |
| Services                                 | fibre-cabling       |
| Support                                  | hardware-support    |
| Training                                 | site-coordination   |
| Product Management, Business Development | project-management  |
| Any other department                     | no skill            |

Title keywords: database, systems administrator or systems analyst add `systems-administration`; support adds `hardware-support`; project manager adds `project-management`; quality assurance adds `commissioning`.

A technician with no skill is still stored and listed, but cannot be assigned. A department HR invents tomorrow therefore cannot break a sync.

## The brief, and where each part is

| Brief asks for                                      | Where it is                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Projects and positions with skill, dates, headcount | `api/src/routes/projects.ts`, `api/src/routes/positions.ts`, `shared/src/contracts.ts`                               |
| "Filled" decided, with the reason in a comment      | The comment above `SEATS_TAKEN` in `api/src/repositories/positions.ts`; the choice is also in the table below        |
| Technicians filtered by skill and location          | `GET /technicians` (`skill`, `location`, `state`, `city`, availability), `api/src/repositories/technicians.ts`       |
| The booking rule (no overlapping assignments)       | One immediate transaction in `api/src/services/assignments.ts`; tests in `api/test/api.test.ts`                      |
| Sync of technicians from the HR API                 | `POST /sync/technicians`, `api/src/integration/sync.ts`; retries, partial failure and progress are in the sync tests |
| Signed webhook, replay protection                   | `POST /webhooks/hr`; contract in [The webhook contract](#the-webhook-contract); replay is `409`                      |
| Coordinator interface                               | `web/src/features/board` and `web/src/features/assign`; described under [The interface](#the-interface)              |
| Tests and CI                                        | `npm test` (API and web), `.github/workflows/ci.yml`                                                                 |
| Ambiguities written down                            | [Where the brief was open](#where-the-brief-was-open-and-what-i-chose)                                               |
| AI use and design                                   | [AI_NOTES.md](AI_NOTES.md), [DESIGN.md](DESIGN.md)                                                                   |

## Where the brief was open, and what I chose

The brief says to pick an answer and write the assumption down. Every place it did not decide, in one table:

| Open question                                                                                  | What I chose                                                                                                                                                                                                                                | Why, and where to look                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the end date part of the job? What does "one assignment ends the day the next begins" mean? | Dates are inclusive calendar days (`YYYY-MM-DD`, no times). Ending on the 14th and starting on the 14th **overlaps** (409); starting on the 15th is fine.                                                                                   | The same person cannot be in two places on one day. Both cases are tested in `api/test/booking.test.ts`.                                                                                  |
| What dates does an assignment have?                                                            | The position's dates, copied when the person is assigned.                                                                                                                                                                                   | The brief lists dates on Assignment but gives no way for them to differ. Keeps the overlap rule exact.                                                                                    |
| Skills and home location from dummyjson                                                        | Department gives the main skill, job title keywords add more; city, state and country are the location.                                                                                                                                     | The full mapping is in the section below. Unknown departments give no skill, so a new HR value cannot break a sync.                                                                       |
| What does "available between two dates" mean?                                                  | The technician has no assignment that shares a day with the period.                                                                                                                                                                         | It is the same overlap test the booking rule uses.                                                                                                                                        |
| "Filled": stored or derived?                                                                   | Derived, counted from assignments to active technicians on every read.                                                                                                                                                                      | A stored flag is a second source of truth that assign, unassign, deactivation and sync would all have to keep right. The reasoning is the comment in `api/src/repositories/positions.ts`. |
| What happens to open assignments when a technician is deactivated?                             | They are kept, the person stops counting as a seat (so the position reopens), and the board flags them for replacement. Nothing is deleted.                                                                                                 | History survives, the coordinator chooses the replacement, and one wrong or late HR event cannot silently destroy bookings.                                                               |
| Who may bring a deactivated person back?                                                       | HR, through an explicit `active: true` event, or the sync seeing someone that the sync itself deactivated.                                                                                                                                  | A webhook deactivation is never undone by a sync, because dummyjson has no "active" flag and would otherwise resurrect everyone.                                                          |
| What about people HR stops listing? (HR is the source of truth, but the brief does not say)    | They are deactivated, only after a run where every page and record succeeded, and never more than 20% of the roster in one run.                                                                                                             | A failed or empty answer from HR must not wipe the roster.                                                                                                                                |
| The webhook's headers, body and signature format                                               | The contract in the next section.                                                                                                                                                                                                           | The brief only names the two events and says HMAC, event id and deactivate-not-delete.                                                                                                    |
| What status for a replayed event id?                                                           | `409 DUPLICATE_EVENT`, with no effect.                                                                                                                                                                                                      | The brief says "reject".                                                                                                                                                                  |
| Events that arrive out of order                                                                | An event older than the change already applied is ignored.                                                                                                                                                                                  | A late retry must not undo a newer update.                                                                                                                                                |
| How is a sync triggered and followed?                                                          | `POST /sync/technicians` answers `202` with a run id and works in the background, one run at a time (a second gets 409). The screen polls the run.                                                                                          | A sync takes seconds; a request should not wait on it.                                                                                                                                    |
| Timeouts and retries                                                                           | 5 second timeout per page; up to 3 retries on network errors, timeouts, 429 and 5xx with exponential backoff and jitter (about 0.5, 1, 2 seconds, capped at 8) and `Retry-After` honoured; a page that still fails is recorded and skipped. | The timeout and retry count are settings in `api/src/config.ts`.                                                                                                                          |
| What does "paginate the lists" mean?                                                           | Page numbers: `page` and `pageSize` (default 20, at most 100) with a total. The board's table pages on the server (10 to 100 rows).                                                                                                         | Offset paging is exact and fine at this size; DESIGN.md says what changes at scale.                                                                                                       |
| Limits on field sizes (names, headcount)                                                       | Names up to 120 characters; headcount 1 to 50; search text up to 80.                                                                                                                                                                        | Sensible caps, set in `shared/src/contracts.ts`.                                                                                                                                          |
| Login and roles                                                                                | None.                                                                                                                                                                                                                                       | The brief defines no users. The API is not published to the host in Docker, and one pre-handler hook is where login would go (DESIGN.md).                                                 |
| Database                                                                                       | SQLite with plain parameterised SQL.                                                                                                                                                                                                        | The brief allows it; no Docker needed to develop; DESIGN.md covers the PostgreSQL move.                                                                                                   |
| Which state library, which UI library                                                          | RTK Query (reasons below) and MUI.                                                                                                                                                                                                          | Below.                                                                                                                                                                                    |
| Deadline                                                                                       | The brief says Monday 20 October, the email says Monday 19 October. I planned for the 19th.                                                                                                                                                 | Confirm by email.                                                                                                                                                                         |

Other conventions: the API serves `/projects`, `/positions`, `/technicians`, `/sync/...` and `/webhooks/hr` exactly as in the brief, and the web container forwards `/api/*` to it with the prefix removed, so the browser sees one origin. `GET /docs` serves Swagger UI built from the Zod schemas (development only); `GET /docs/json` serves the OpenAPI document everywhere.

## The webhook contract

```
POST /webhooks/hr
X-HR-Timestamp: <unix seconds>
X-HR-Signature: sha256=<hex>      HMAC-SHA256 of "<timestamp>.<raw body>" with HR_WEBHOOK_SECRET
{ "id": "evt_...", "type": "technician.updated" | "technician.deactivated", "occurredAt": "<ISO time>", "data": ... }
```

`data` is the technician as HR sees them (`id`, `firstName`, `lastName`, `company.department`, `company.title`, `address.city/state/country`, and an optional `active`) for an update, and just `{ "id": <HR id> }` for a deactivation. Answers: `200` (`processed` or `ignored`), `400` invalid event, `401` for any signature problem (always the same message), `409` replay, `413` body over 64 KB. The timestamp must be within five minutes, the comparison is constant-time, and the signature is checked before the body is parsed. `npm run webhook:test` sends a correctly signed event.

## Why RTK Query

The team already uses Redux Toolkit. RTK Query adds caching, loading and error flags, tag-based refetching and optimistic updates inside the same store, so no second state library is needed. TanStack Query would do the job equally well but would be a new dependency for something we already have. State is split three ways: server data in RTK Query, the screen's own state (open drawer, toast) in a small slice, and the view itself (tab, sort, filters) in the address.

## For a Java developer: the TypeScript equivalent of a DTO

A Java DTO with validation annotations is one Zod schema here, and the TypeScript type comes from it, so the check and the type can never disagree:

```ts
const CreatePosition = z
  .strictObject({
    skill: SkillSchema,
    startDate: IsoDate,
    endDate: IsoDate,
    headcount: z.number().int().min(1).max(50),
  })
  .refine((p) => p.endDate >= p.startDate, {
    path: ['endDate'],
    message: 'End date must be on or after the start date',
  });
type CreatePosition = z.infer<typeof CreatePosition>;
```

| Spring Boot                    | Here                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| DTO class with Bean Validation | A Zod schema; `z.infer` gives the type. All of them are in `shared/src/contracts.ts` |
| `ignoreUnknown = false`        | `z.strictObject` rejects unknown fields                                              |
| Class-level constraint         | `.refine(...)`                                                                       |
| `@RestController` and `@Valid` | A Fastify route with `schema: { body, querystring, params, response }`               |
| `@ControllerAdvice`            | `setErrorHandler` in `api/src/app.ts`, one place that builds the error shape         |
| `@Transactional`               | `db.transaction(fn).immediate()`, see `api/src/services/assignments.ts`              |
| Flyway                         | numbered migrations in `api/src/db/migrations.ts`                                    |

The same schemas are shared with the React app, so a changed field is a compile error on both sides.

## API in one table

| Method and path                                                                      | Purpose                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /projects`, `POST /projects`, `GET /projects/:id`                               | List (paged), create, read                                                                                                                                                                                                                                                               |
| `POST /projects/:id/positions`                                                       | Create a position                                                                                                                                                                                                                                                                        |
| `GET /positions`                                                                     | Board data, paged and sorted on the server. Filters: `status, skill, from, to, q` (project or skill), `assignee`, `staffing`, `needsReplacement`, `minSeats`, `startsWithin`; `sort` is `start`, `start-desc`, `seats` or `project`. Each row has `assigned`, `seatsRemaining`, `filled` |
| `GET /positions/summary`                                                             | Exact open, filled and seats-to-fill figures across all positions, plus the counts behind the board's quick views                                                                                                                                                                        |
| `GET /positions/:id`                                                                 | One position                                                                                                                                                                                                                                                                             |
| `GET /positions/:id/candidates`                                                      | Drawer data: each technician with `hasSkill`, `available`, and the exact `conflict`; `assignableOnly=true` lists only people who could be assigned now                                                                                                                                   |
| `POST /positions/:id/assignments`, `DELETE /positions/:id/assignments/:assignmentId` | Assign (201 or 409), unassign (204)                                                                                                                                                                                                                                                      |
| `GET /technicians`, `GET /technicians/:id`                                           | Filters `skill, location` (free text over city, state and country), `state, city, q, active, availableFrom, availableTo`, paged                                                                                                                                                          |
| `POST /sync/technicians`                                                             | Start a sync, returns 202 at once with a run id                                                                                                                                                                                                                                          |
| `GET /sync/runs`, `GET /sync/runs/:id`                                               | Last runs with live progress, counts and errors                                                                                                                                                                                                                                          |
| `POST /webhooks/hr`                                                                  | Signed HR events                                                                                                                                                                                                                                                                         |
| `GET /health`, `GET /ready`                                                          | Liveness, readiness                                                                                                                                                                                                                                                                      |

Every failure has the same shape: `{ "error": { "code", "message", "details?", "requestId" } }`. Lists return `{ data, page, pageSize, total, totalPages }`.

## Security in short

Strict Zod validation on every input (unknown fields rejected); parameterised SQL only, enforced by a lint rule; HMAC-SHA256 webhook signatures over timestamp and raw body, compared in constant time, with a five-minute window and a primary-key replay guard; sensitive HR fields (password, SSN, bank and so on) are dropped at the boundary and never stored or logged; helmet headers, a single allowed CORS origin, rate limits, a 64 KB body limit; generic 500 messages with no stack traces; no secrets in the repo (`.env` is ignored, the secret is generated); the web container sends a strict Content-Security-Policy in which scripts come only from our own files and MUI's and the data grid's runtime styles are allowed only through a fresh random nonce per page load (generated by nginx, never `unsafe-inline`); containers run as a non-root user with a read-only filesystem and dropped capabilities; npm install scripts are disabled; CI actions are pinned to commits with read-only permissions.

## Layout

```
api/      Fastify service: routes, services (booking rule), repositories (SQL), integration (HR client, sync, webhook), cli, migrations, tests
web/      React app: app (store, router), features (board, assign, sync), shared (API layer, UI primitives), tests
shared/   Zod schemas and types used by both
deploy/   nginx config and container entry scripts
```

## Time spent and what was skipped

Time spent per part (fill in your own hours before sending):

| Part                     | Hours |
| ------------------------ | ----- |
| 1. API                   |       |
| 2. HR sync and webhook   |       |
| 3. React screen          |       |
| 4. Pipeline and write-up |       |

**Skipped on purpose, and what I would do next:**

- Browser end-to-end tests (Playwright); the UI is covered by component tests against a mocked API.
- Login and roles (Microsoft Entra ID), and an audit trail of who assigned whom.
- Webhook secret rotation (accept the current and previous secret at once).
- Keyset pagination and a trigram index for search, once the lists outgrow offset paging (the board pages by offset today, which is exact and fine at this size).
- A real two-process concurrency test for the booking rule; today it is tested sequentially in one process.

See [DESIGN.md](DESIGN.md) for how this would run on Azure and what changes at 50 projects, 3,000 technicians and 200 HR events a minute, and [AI_NOTES.md](AI_NOTES.md) for how AI assistance was used.
