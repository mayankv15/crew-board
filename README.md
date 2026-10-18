# Crew Board

Crew Board is a tool for a staffing company that places technicians on data-centre projects. A coordinator can see which positions are open, assign someone suitable without double-booking them, and check that the HR data behind it is current.

- API: Node 24, TypeScript, Fastify, Zod, SQLite with plain parameterised SQL
- Web: React 19, MUI 9 with the MUI X data grid, Redux Toolkit with RTK Query, Vite
- Shared: one package of Zod schemas and types that both sides import, so renaming a field breaks the build on both
- HR system: `https://dummyjson.com/users`

## Run it

With Docker, one command:

```bash
docker compose up --build
```

Then open <http://localhost:8080>. If that port is taken, set `WEB_PORT=8081` first. On the first start it creates the database, adds three demo projects with nine positions, and pulls all 208 technicians from HR. If HR cannot be reached it falls back to a bundled set of 60, so there is always something to look at.

Without Docker you need Node 24 and npm 11 or newer. Run `nvm use` in this folder first, since it reads `.nvmrc`.

```bash
npm ci
npm run setup      # creates .env with a random webhook secret
npm run seed       # demo projects and positions, then a first HR sync
npm run dev        # API on :3000, web on http://localhost:5173
```

If you see `tsx: not found` or `vite: not found`, the dependencies were installed with a different Node. Run `nvm use && npm ci`. On an older Node the project stops straight away with a clear message.

## Settings and secrets (.env)

All settings are environment variables, checked with Zod when the API starts. A missing or too-short webhook secret stops it from booting.

- **Local development:** put them in a `.env` file in the repo root, next to `package.json`. `npm run setup` creates it from [`.env.example`](.env.example) and fills in a random `HR_WEBHOOK_SECRET`. `.env` is git-ignored, so it never gets committed. `.env.example` is the only env file in the repo and holds no real secret.
- **Docker:** nothing to set. On first start the container generates a secret and stores it in the `crew-data` volume (`/data/.webhook-secret`). To use your own, pass `HR_WEBHOOK_SECRET` to the `api` service under `environment:` in `docker-compose.yml`.
- **CI:** needs no secrets. The tests set their own values.
- **Azure (see DESIGN.md):** the secret would live in Key Vault and be injected as an environment variable.

| Variable                  | Default                 | Meaning                                         |
| ------------------------- | ----------------------- | ----------------------------------------------- |
| `HR_WEBHOOK_SECRET`       | none, required          | Shared secret for webhook signatures, 32+ chars |
| `HR_BASE_URL`             | `https://dummyjson.com` | The HR API (must be https in production)        |
| `HR_TIMEOUT_MS`           | 5000                    | Timeout per HR page                             |
| `HR_MAX_RETRIES`          | 3                       | Retries per HR page                             |
| `DATABASE_PATH`           | `./data/crewboard.db`   | SQLite file                                     |
| `PORT`, `HOST`            | 3000, 127.0.0.1         | Where the API listens                           |
| `CORS_ORIGIN`             | `http://localhost:5173` | The one origin allowed to call the API          |
| `RATE_LIMIT_*`            | 100 / 5 / 300 a minute  | General, sync and webhook limits                |
| `TRUST_PROXY`, `NODE_ENV` | false, development      | Set by the container                            |

## Tests and checks

```bash
npm test
npm run typecheck
npm run lint           # no warnings allowed; includes type-aware and accessibility rules
npm run format:check   # `npm run format` fixes it
npm run build
npm run knip           # unused code and dependencies
```

The same steps run on every push in [`.github/workflows/ci.yml`](.github/workflows/ci.yml), followed by `npm audit` and a secret scan. If any step fails, the run fails.

## Fire a test webhook

The script sends a correctly signed event using the secret in `.env`:

```bash
npm run webhook:test -- --type technician.deactivated --external-id 5
npm run webhook:test -- --type technician.updated --external-id 5 --city Dallas --state Texas
npm run webhook:test -- --type technician.deactivated --external-id 5 --replay     # second send returns 409
npm run webhook:test -- --type technician.updated --external-id 5 --bad-signature  # returns 401
npm run webhook:test -- --type technician.updated --external-id 5 --stale          # old timestamp, returns 401
```

With Docker the secret is inside the container, so run the same tools there:

```bash
docker compose exec api crew-cli webhook-test --type technician.deactivated --external-id 5
docker compose exec api crew-cli sync     # the sync job from the command line
```

Reload the board afterwards. The person is still on their position, marked "Deactivated by HR", and the seat is open again.

## The screens

Colours are indigo for the brand and actions, cyan-teal for available or filled, amber for things that need attention, and rose for errors. I checked contrast and how well the status colours stay apart for colour-blind users, and a test keeps it that way ([docs/COLOUR.md](docs/COLOUR.md)). It follows the system light or dark setting, with a toggle in the header.

**Board.** The header shows how many seats are still to fill. Below it are two tabs, Open and Filled. Switching tabs slides the view, and so does moving between Board and HR sync. The board remembers its tab, sort, filters and page while you look at the sync page. All of that lives in the address (`?tab=filled&sort=seats&skill=...`), so a refresh or a shared link opens the same view.

- The table is the MUI X data grid with server-side pagination (10, 25, 50 or 100 rows). Only the current page is downloaded and the total comes from the API. The page size is remembered.
- Sort from the Sort menu or by clicking a column heading.
- Search by project name or skill. Pressing `/` jumps to the search box.
- Four quick views with live counts: needs replacement, starts within 7 days, unstaffed and starting within 14 days, partly staffed.
- Filters behind one button: skill, date range, starts within 7, 14 or 30 days, assigned to a person, staffing, seats still open, and needs replacement. Each active filter shows as a pill you can remove. All of it runs on the server.
- Each row shows project, skill, dates, seats and who is assigned. A row never grows. It shows the first person and "+N more", which opens the full list with an Unassign button for each.
- Each row has one main button (Assign, or People once filled) and a menu for more from this project, copying the names, and copying the position details. Clicking the row also opens the people on it.
- The assign drawer lists only people who can take the position by default. Searching shows everyone, so you can see why someone cannot be booked. The conflict is shown on the person before you click.

**HR sync.** The last ten runs with counts, errors and live progress, plus a chip in the header on every page that says when HR was last synced and whether it went well. While a run is going, the page polls only that one run once a second, and stops while the browser tab is hidden. When the run finishes, the list and the chip refresh once. The chip asks for the latest run only, and checks again every five seconds while that run is going, so a sync started by someone else or from the command line still shows up.

**What loads when.** The landing page asks for four small things: the open positions (one page), the seat and quick-view counts, the latest sync run, and a one-row request for the Filled tab, only to get its total for the tab badge. The Filled table and the HR sync page, with its code, load the first time you open them, and stay mounted after that so they keep their state. The assign drawer and the people dialog load when first opened, and the candidates load when the drawer opens.

**Keeping it current.** The API keeps one number, `data_version`, that moves whenever a row the board shows is written. Database triggers do this, so every write path counts, including assigning, unassigning, a sync and an HR webhook. The web app asks `GET /changes` for that number every ten seconds while the tab is visible, which is one primary-key read. The first answer is only the starting point. When a later answer is different, the position and candidate lists refetch. So a change from another coordinator or from HR shows up within about ten seconds, and a sync that finds nothing new, a replayed webhook and plain reads cause no refresh. A tab that was hidden checks as soon as it is shown. Your own change also moves the number, so the next poll refreshes the board once more, which returns the same data. `/changes` is not rate limited per address, because every open board polls it. The tests are in `api/test/changes.test.ts` and `web/test/changes.test.tsx`.

**When things go wrong.** Unassigning offers Undo in the toast. A refused booking stays visible in the drawer even after the list refreshes. Every error has a Try again button. The board also refreshes when the window regains focus, at most once every 30 seconds (`web/src/shared/focusListeners.ts`), because RTK Query alone would refetch on every tab switch. That is the backstop for the change poll, for example if one poll fails.

Everything works from the keyboard. Dialogs trap and return focus, and there are skip links past the header and past a long table to its page controls. Motion is switched off for people who ask for reduced motion. It works from tablet width up. I ran an axe scan on each screen in light and dark in Chrome against the production build with zero violations, and the same scan runs in the test suite.

## How skills and location are derived

HR has no skills field and no home location, so I derive both from what it does have. The rules are in [`api/src/integration/mapping.ts`](api/src/integration/mapping.ts).

| HR field                                           | Becomes                                                |
| -------------------------------------------------- | ------------------------------------------------------ |
| `company.department`                               | The main skill (table below)                           |
| `company.title`                                    | Extra skills when it contains a keyword (see below)    |
| `address.city`, `address.state`, `address.country` | Home location, filterable by city, state or `location` |

| Department                               | Skill               |
| ---------------------------------------- | ------------------- |
| Engineering                              | network-engineering |
| Research and Development                 | server-installation |
| Services                                 | fibre-cabling       |
| Support                                  | hardware-support    |
| Training                                 | site-coordination   |
| Product Management, Business Development | project-management  |
| Anything else                            | no skill            |

Title keywords: "database", "systems administrator" or "systems analyst" add `systems-administration`; "support" adds `hardware-support`; "project manager" adds `project-management`; "quality assurance" adds `commissioning`.

A technician with no skill is still stored and listed but cannot be assigned, so a new department showing up in HR cannot break a sync.

## Where the brief was open

The brief says to pick an answer and write it down. These are the places it did not decide.

| Question                                                           | What I chose                                                                                                                                                                                           | Why                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Is the end date part of the job?                                   | Dates are inclusive calendar days. Ending on the 14th and starting on the 14th overlaps (409). Starting on the 15th is fine.                                                                           | One person cannot be in two places on the same day. Both cases are tested.                               |
| What dates does an assignment have?                                | The position's dates, copied when the person is assigned.                                                                                                                                              | The brief lists dates on Assignment but gives no way to set them.                                        |
| What does "available between two dates" mean?                      | No assignment shares a day with that period.                                                                                                                                                           | It is the same overlap test the booking rule uses.                                                       |
| Is "filled" stored or derived?                                     | Derived: assignments to active technicians, counted on every read.                                                                                                                                     | A stored flag would be a second source of truth. The comment is in `api/src/repositories/positions.ts`.  |
| What happens to open assignments when a technician is deactivated? | They stay. The person stops counting as a seat, so the position reopens, and the board flags it for replacement. Nothing is deleted.                                                                   | History survives and the coordinator picks the replacement.                                              |
| Who can bring a deactivated person back?                           | HR, with an explicit `active: true` event, or a sync that sees someone the sync itself deactivated.                                                                                                    | A webhook deactivation is never undone by a sync, because dummyjson would otherwise bring everyone back. |
| What about people HR stops listing?                                | They are deactivated, but only after a fully clean run and never more than 20% of the roster at once.                                                                                                  | A failed or empty answer from HR must not wipe the roster.                                               |
| Webhook headers, body and signature format                         | The contract below.                                                                                                                                                                                    | The brief only names the events and says HMAC and event id.                                              |
| Status for a replayed event id                                     | `409 DUPLICATE_EVENT`, no effect.                                                                                                                                                                      | The brief says "reject"; 409 tells the sender it was a duplicate.                                        |
| Events that arrive out of order                                    | An event older than the change already applied is ignored.                                                                                                                                             | A late retry must not undo a newer update.                                                               |
| How is a sync triggered and followed?                              | `POST /sync/technicians` returns `202` with a run id and works in the background, one run at a time (a second gets 409). The screen polls that run while it is going, and not while the tab is hidden. | A sync takes seconds, so the request should not wait.                                                    |
| Timeouts and retries                                               | 5 second timeout per page. Up to 3 retries on network errors, timeouts, 429 and 5xx, with exponential backoff, jitter and `Retry-After`. A page that still fails is recorded and skipped.              | One bad page should not abort the run. Both numbers are settings.                                        |
| What does "paginate" mean?                                         | `page` and `pageSize` (default 20, max 100) with a total.                                                                                                                                              | Offset paging is exact and fine at this size. DESIGN.md covers when to change.                           |
| Field limits                                                       | Names up to 120 characters, headcount 1 to 50, search text up to 80.                                                                                                                                   | Sensible caps, set in `shared/src/contracts.ts`.                                                         |
| Login and roles                                                    | None.                                                                                                                                                                                                  | The brief defines no users, and the API is not published to the host in Docker.                          |
| Database                                                           | SQLite.                                                                                                                                                                                                | Allowed by the brief and needs no extra setup.                                                           |
| Deadline                                                           | The PDF says Monday 20 October and the email says Monday 19. I planned for the 19th.                                                                                                                   | To confirm.                                                                                              |

The API serves `/projects`, `/positions`, `/technicians`, `/sync/...` and `/webhooks/hr` as in the brief. The web container forwards `/api/*` to it, so the browser only sees one origin. `GET /docs` serves Swagger UI in development, and `GET /docs/json` serves the OpenAPI document everywhere.

## The webhook contract

```
POST /webhooks/hr
X-HR-Timestamp: <unix seconds>
X-HR-Signature: sha256=<hex>      HMAC-SHA256 of "<timestamp>.<raw body>" with HR_WEBHOOK_SECRET
{ "id": "evt_...", "type": "technician.updated" | "technician.deactivated", "occurredAt": "<ISO time>", "data": ... }
```

For an update, `data` is the technician as HR sees them: `id`, `firstName`, `lastName`, `company.department`, `company.title`, `address.city/state/country`, and an optional `active`. For a deactivation it is just `{ "id": <HR id> }`.

Answers: `200` (processed or ignored), `400` invalid event, `401` for any signature problem (always the same message), `409` replay, `413` body over 64 KB. The timestamp must be within five minutes, the signature is compared in constant time, and it is checked before the body is parsed.

## Why RTK Query

The team already uses Redux Toolkit. RTK Query gives caching, loading and error flags, tag-based refetching and optimistic updates inside the same store, so there is no second state library. TanStack Query would do the job too, but it would be a new dependency for something that is already there. I split state three ways: server data in RTK Query, the screen's own state (open drawer, toast) in a small slice, and the view itself (tab, sort, filters) in the address.

## For a Java developer: DTOs in TypeScript

A Java DTO with validation annotations becomes one Zod schema, and the TypeScript type is taken from it, so the check and the type cannot disagree.

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

| Spring Boot                    | Here                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| DTO class with Bean Validation | A Zod schema; `z.infer` gives the type. All in `shared/src/contracts.ts`   |
| `ignoreUnknown = false`        | `z.strictObject` rejects unknown fields                                    |
| Class-level constraint         | `.refine(...)`                                                             |
| `@RestController` and `@Valid` | A Fastify route with `schema: { body, querystring, params, response }`     |
| `@ControllerAdvice`            | `setErrorHandler` in `api/src/app.ts`, the one place that builds the error |
| `@Transactional`               | `db.transaction(fn).immediate()` in `api/src/services/assignments.ts`      |
| Flyway                         | Numbered migrations in `api/src/db/migrations.ts`                          |

## API

| Method and path                                                                      | Purpose                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /projects`, `POST /projects`, `GET /projects/:id`                               | List (paged), create, read                                                                                                                                                                                               |
| `POST /projects/:id/positions`                                                       | Create a position                                                                                                                                                                                                        |
| `GET /positions`                                                                     | Board data, paged and sorted on the server. Filters: `status`, `skill`, `from`, `to`, `q`, `assignee`, `staffing`, `needsReplacement`, `minSeats`, `startsWithin`. `sort` is `start`, `start-desc`, `seats` or `project` |
| `GET /positions/summary`                                                             | Open, filled and seats-to-fill figures for the whole board, plus the counts behind the quick views                                                                                                                       |
| `GET /positions/:id`                                                                 | One position                                                                                                                                                                                                             |
| `GET /positions/:id/candidates`                                                      | Drawer data: each technician with `hasSkill`, `available` and the exact `conflict`. `assignableOnly=true` lists only people who could be booked now                                                                      |
| `POST /positions/:id/assignments`, `DELETE /positions/:id/assignments/:assignmentId` | Assign (201 or 409), unassign (204)                                                                                                                                                                                      |
| `GET /technicians`, `GET /technicians/:id`                                           | Filters `skill`, `location` (free text over city, state and country), `state`, `city`, `q`, `active`, `availableFrom`, `availableTo`; paged                                                                              |
| `POST /sync/technicians`                                                             | Start a sync; returns 202 at once with a run id                                                                                                                                                                          |
| `GET /sync/runs`, `GET /sync/runs/:id`                                               | Recent runs with progress, counts and errors                                                                                                                                                                             |
| `POST /webhooks/hr`                                                                  | Signed HR events                                                                                                                                                                                                         |
| `GET /changes`                                                                       | A number that moves when anything on the board changes. Polled by the web app, never cached                                                                                                                              |
| `GET /health`, `GET /ready`                                                          | Liveness and readiness                                                                                                                                                                                                   |

Every failure has the same shape: `{ "error": { "code", "message", "details?", "requestId" } }`. Lists return `{ data, page, pageSize, total, totalPages }`.

## Security

- Every input is validated with Zod and unknown fields are rejected. SQL is parameterised only, and a lint rule enforces it.
- Webhooks are signed with HMAC-SHA256 over the timestamp and raw body, compared in constant time, with a five-minute window and an event-id replay guard.
- Sensitive HR fields (password, SSN, bank details and so on) are dropped at the boundary and never stored or logged.
- helmet headers, one allowed CORS origin, rate limits, a 64 KB body limit, and generic 500 messages with no stack traces.
- The web container sends a strict Content-Security-Policy. Scripts come only from our own files, and MUI's runtime styles are allowed through a fresh random nonce on each page load, never `unsafe-inline`.
- Containers run as a non-root user with a read-only filesystem and dropped capabilities. npm install scripts are disabled, and CI actions are pinned to commits with read-only permissions.
- No secrets in the repo. `.env` is ignored and the Docker secret is generated on first start.

## Layout

```
api/      Fastify service: routes, services (booking rule), repositories (SQL), integration (HR client, sync, webhook), cli, migrations, tests
web/      React app: app (store, router), features (board, assign, sync), shared (API layer, UI pieces), tests
shared/   Zod schemas and types used by both
deploy/   nginx config and container entry scripts
docs/     Notes on the colour choices
```

## Time spent and what I skipped

| Part                     | Hours |
| ------------------------ | ----- |
| 1. API                   | 2.5   |
| 2. HR sync and webhook   | 1.5   |
| 3. React screen          | 2.5   |
| 4. Pipeline and write-up | 1     |
| Total                    | 7.5   |

What I left out, and what I would do next:

- Browser end-to-end tests with Playwright. The UI is covered by component tests against a mocked API.
- Login and roles (Microsoft Entra ID), and an audit trail of who assigned whom.
- Webhook secret rotation, accepting the current and previous secret together.
- Keyset pagination and a trigram index for search, once the lists outgrow offset paging.
- A real two-process concurrency test for the booking rule. Today it is tested in one process.
- Pushing changes instead of polling for them. Today every open board asks `/changes` every ten seconds, so an update can be up to ten seconds late and each tab sends a small request all the time. With many more open screens I would push a "changed" event from the API and keep the same refetch on the client. Server-Sent Events fit better than a WebSocket because the traffic is one way, and the browser reconnects by itself. A WebSocket only pays off if the screen later needs to send live messages back.

DESIGN.md covers running this on Azure and what changes at 50 projects, 3,000 technicians and 200 HR events a minute. AI_NOTES.md covers how I used AI tools.
