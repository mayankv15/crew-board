# Design: running Crew Board on Azure, and what changes at scale

## On Azure

```
HR system ──► Front Door + WAF ──► webhook-ingest ──► Service Bus queue ──► worker ──► PostgreSQL
Browser   ──► Front Door + WAF ──► web (nginx) ──► api ───────────────────────────────► PostgreSQL
                          (all Container Apps)   secrets: Key Vault     logs: Application Insights
```

- **Compute: Azure Container Apps.** We already ship two container images. It gives revisions, per-app scaling and managed identity without running Kubernetes, and the webhook worker can scale on queue depth (KEDA). App Service would also do for a single API.
- **Database: Azure Database for PostgreSQL Flexible Server**, zone-redundant, point-in-time restore, private endpoint, Entra ID login through the apps' managed identity (no password). The SQL moves almost unchanged. Two things improve: the no-overlap rule becomes a constraint (`EXCLUDE USING gist (technician_id WITH =, daterange(start_date, end_date, '[]') WITH &&)`), so even a buggy code path cannot double-book, and assign takes a row lock on the technician instead of SQLite's single write lock.
- **Service Bus in front of the webhook.** The ingest app does the cheap, safe part only: size limit, signature and timestamp check, enqueue, answer 202. HR never waits on our database, and a database outage becomes queue depth, not lost events. Duplicate detection on the event id filters replays, sessions keyed by technician keep one person's events in order, and repeated failures go to a dead-letter queue with an alert. The `webhook_events` primary key stays as the final replay guard, because queues deliver at least once.
- **Key Vault** holds the webhook secret (current and previous, so it rotates without a gap). Apps read it by managed identity; nothing secret is in an image or in git.
- **Also:** private endpoints inside a VNet; Entra ID login with a coordinator role in front of the API (the single pre-handler hook is ready for it); OpenTelemetry to Application Insights using the existing request id; alerts on failed syncs, dead-letter depth and 5xx rate.

## At 50 live projects, 3,000 technicians, 200 HR events a minute

That is about 3.3 events a second and 100 pages of 30 technicians: small for the data, so what breaks first is the coupling around it. Measured on a database of this size, the main queries take under 8 ms and a booking 0.3 ms, so it is not the database. In order:

1. **The webhook path.** Events are handled inside the request, and the per-IP limit is 300 a minute, so a burst or an HR retry storm gets 429s, HR retries, and it worsens. The limiter is in memory, so each replica multiplies it. _Fix:_ the Service Bus design above, an allow-list for HR's addresses, and a limiter in Front Door or Redis.
2. **One writer, one node.** SQLite cannot be shared by a second replica, and the single-flight sync lock is only correct within one database. _Fix:_ PostgreSQL, the exclusion constraint, and an advisory lock for single-flight sync.
3. **Full sync time.** 100 sequential pages is a minute or two. Fine nightly, wasteful as the only way to catch up. _Fix:_ a few pages at once, a "changed since" call if HR offers one, and webhooks for the day-to-day load.
4. **Search and counts.** The board already pages, sorts and filters on the server, so it does not grow with the data. `LIKE '%text%'` and the `COUNT(*)` behind each page total do: fine now, slow at tens of thousands. _Fix:_ a trigram index, keyset paging, a cached total.
5. **Polling.** The sync page polls only the active run, once a second, and pauses while the tab is hidden. The header chip checks the latest run every five seconds while one is going. Every open board also polls `GET /changes` every ten seconds. It is one primary-key read of a version number that database triggers move on every write, so replicas that share the database agree on it once the triggers are ported to PostgreSQL. Cheap for tens of coordinators. With hundreds of open screens that is steady background load, so I would push a "changed" event over server-sent events instead. The one-row counter would also become a hot row at a high write rate, and a Postgres sequence or LISTEN/NOTIFY would replace it.

Unchanged at any size: the booking rule and the derived "filled" count, because each assign touches one technician's rows through an index.
