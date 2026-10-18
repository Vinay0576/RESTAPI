# EquipRent database REST API

Runnable Node.js/Fastify API for the supplied **122-table normalized proposal**, with PostgreSQL 17, Docker Compose, sample data, OpenAPI, and Postman requests. This is the **local database API** scope selected for this delivery. It is separate from the earlier assessment and 13-operation draft in the parent folder.

## Start

Prerequisites: Docker with Compose, and Node.js 24 for the credential setup script.

```sh
cd /Users/vineeth_raj/Documents/ChatGPT/RestApi/api
npm run setup
docker compose up -d --build
```

`setup` creates random credentials in `.env` and a private Postman environment. It never overwrites an existing `.env`. The database becomes healthy first; a one-shot migration service creates/updates the schema; the API starts only after migrations succeed. Re-running Compose preserves the named database volume and checks applied migration checksums.

- API: `http://localhost:3100`
- Interactive API reference: [Swagger UI](http://localhost:3100/docs/)
- OpenAPI JSON: [API definition](http://localhost:3100/openapi.json), also saved as `docs/openapi.json`
- Readiness: [health check](http://localhost:3100/health/ready)
- PostgreSQL: `127.0.0.1:55440`, database `equiprent_model`

Both published ports bind to **127.0.0.1**. Containers are isolated under the Compose project `equiprent-model-api`; the original application and its database are not modified.

## Use Postman

1. Import `postman/equiprent.postman_collection.json`.
2. Import `postman/local.postman_environment.json` and select that environment. It contains the generated local keys; do not commit/share it. A blank distributable template is in `postman/environment.example.json`.
3. Run **Quickstart — runnable seeded examples** in order. Its 11 requests check readiness, inspect resources, read machines/bookings, create/read/update/archive a manufacturer, and post a balanced journal in one transaction.
4. Browse the 16 domain folders for all supported table operations. These are editable templates: fill empty primary-key variables and valid foreign-key values before executing their writes. Do not run the entire template catalogue as a sequential fixture script.

Collection authorization is `Bearer {{apiKey}}`. Use `API_ADMIN_KEY` for writes or `API_READ_KEY` for read-only access. Both are privileged **whole-dataset** keys, not customer/company sessions. The collection includes saved example IDs for seeded records and captures the manufacturer ID during Quickstart.

Example read:

```http
GET http://localhost:3100/v1/admin/fleet/machines?limit=25&offset=0
Authorization: Bearer <API_READ_KEY from .env>
```

Example create:

```http
POST http://localhost:3100/v1/admin/catalogue/manufacturers
Authorization: Bearer <API_ADMIN_KEY from .env>
Content-Type: application/json

{"name":"Example Equipment Ltd"}
```

Success responses contain `data` and `meta.requestId`. Lists also contain `page: {limit,offset,total,hasMore}`. `total` is an exact integer **string**. Errors use `{error:{code,message,details?},requestId}`. A successful archive returns HTTP 204 without a body.

## Endpoint coverage

The generated [resource dictionary](docs/resources.json) contains each table's purpose, columns, primary key, database constraints, writable schemas, hidden output columns and endpoint paths. [Coverage summary](docs/coverage.json) records the counts.

| Route | Behavior |
|---|---|
| `GET /v1/resources` | Describe all 122 resources and their schemas |
| `GET /v1/admin/{domain}/{resource}` | List any model table |
| `GET /v1/admin/{domain}/{resource}/{primary-key...}` | Read a row; composite keys occupy separate path segments |
| `POST /v1/admin/{domain}/{resource}` | Create rows in 121 tables; audit events are server-generated |
| `PATCH /v1/admin/{domain}/{resource}/{primary-key...}` | Partial update for 75 mutable/archive tables |
| `DELETE /v1/admin/{domain}/{resource}/{primary-key...}` | Soft archive for the 20 archive tables; never physically delete |
| `GET /v1/admin/finance/booking-balances` | Read the supplied derived balance view; optional `booking_id`, `limit`, `offset` |
| `POST /v1/transactions` | Up to 25 validated writes committed or rolled back together |

These are **463 documented operations**, registered for a fixed allowlist from the supplied model; arbitrary schemas, SQL and RPC names are not accepted. Schema/table underscores become hyphens in paths, e.g. `access_control.role_capabilities` becomes `/v1/admin/access-control/role-capabilities/{role_code}/{capability_code}`. Column names remain `snake_case`.

All 47 append-only tables reject PATCH/DELETE. Non-archive mutable tables also reject DELETE: end/revoke/close them using the appropriate column under the supplied constraints. Archived rows are excluded from lists by default, but remain retrievable by primary key for historical reference. Updates to an archived row return 404. Generic PUT replacement is not supported.

### Filtering and JSON types

- `limit`: 1–100, default 25. `offset`: 0–100000, default 0.
- `filter`: URL-encoded JSON equality object, maximum 20 fields. Example in Postman's Params tab: `{"state":"requested"}`. `null` selects SQL NULL where that column permits NULL. Unknown/hidden fields are rejected.
- `sort`: comma-separated columns, up to three; `-created_at` means descending. Primary keys supply stable tie-breakers. Count and page share a repeatable-read database snapshot.
- `q`: literal case-insensitive substring search across visible text columns, maximum 200 characters.
- `includeArchived=true`: include archived rows in lists.
- PostgreSQL `bigint`, `xid8`, and `numeric` use JSON **strings** for exact values. Send `"rate_minor":"1500000"`, not a floating-point amount. Minor-unit fields follow the model's currency scale; INR has two minor-unit digits.
- Timestamps use ISO 8601 with an offset, e.g. `2026-10-19T10:00:00Z`; dates use `YYYY-MM-DD`. Range fields use PostgreSQL textual range syntax, validated by PostgreSQL.
- Binary input uses Base64. Binary/token/secret/fingerprint columns are omitted from all row responses, including batch results. They cannot be used for list filtering/sorting. Arbitrary JSON payloads are not recursively redacted; only place synthetic, non-secret data in this local demo.
- Unknown fields, client-supplied audit/archive fields, generated transaction IDs, empty PATCH bodies and primary-key changes are rejected. Nullable fields accept explicit JSON null; omitted PATCH fields remain unchanged.

### Atomic writes

Use `/v1/transactions` for related inserts and the ledger. Its body is:

```json
{
  "operations": [
    {
      "resource": "catalogue.manufacturers",
      "method": "POST",
      "body": {"id":"11111111-1111-4111-8111-111111111111","name":"Example"}
    },
    {
      "resource": "catalogue.models",
      "method": "POST",
      "body": {"manufacturer_id":"11111111-1111-4111-8111-111111111111","category_code":"excavator","name":"Example Model"}
    }
  ]
}
```

PATCH operations require `key` and `body`; DELETE operations require `key` only. Each operation uses the same validation and retention policy as its standalone endpoint. All mutation audit rows commit atomically with the business rows. Deferred database checks run before HTTP success. Pre-generate UUIDs to reference new rows; the endpoint does not accept executable SQL or dynamic response expressions. It is not a general idempotency service: after an ambiguous response, read by the client-generated UUID or natural request key before retrying.

## Database and implementation

The three supplied SQL migrations are copied **unchanged**, with checksums in `model/source-manifest.json`. They create all 122 application tables, the derived balance view, relationships, indexes, audit/immutability triggers, booking transition guards, reservation exclusion constraints and ledger/refund checks. The original proposal already seeds INR.

Separate local migrations add minimal `auth.users`, `auth.sessions`, `auth.uid()` and `auth.jwt()` dependencies, the runtime role and fictitious sample data. These are standalone compatibility objects, **not** Supabase Auth/OTP/Storage/Realtime implementations. Never apply these migrations to a hosted Supabase project or existing application database. `api_admin.migrations` is infrastructure metadata, outside the 122 business tables.

The application connects as non-superuser `equiprent_api`, then selects the privileged `service_role` **inside each transaction** after API-key authentication. This intentionally permits local dataset administration across account boundaries; it is not an implementation of the proposal's end-user RLS contracts. Existing RLS definitions remain installed. The seeded API actor is server-selected, and clients cannot set audit actors. Per-table database business guards still run under this role.

```text
src/app.js          App setup, module registration, metadata and batch endpoints
src/auth.js         Constant-time API-key checks and write authorization
src/model.js        Fixed model allowlist + database type/constraint inspection
src/services.js     Transaction orchestration and retention policies
src/repository.js   Parameterized queries, allowlisted identifiers, audit writes
src/db.js           Connection pool, transaction-local context and timeouts
src/errors.js       Consistent sanitized error responses
src/http/          Shared HTTP schemas, resource handlers and route registration
src/modules/       Domain controllers, module route manifests and resource routes
scripts/migrate.mjs Checksum-controlled, transaction-safe migrations
scripts/export.mjs OpenAPI/resource/Postman generation from registered routes
```

Each of the 16 domain modules has one controller, a route manifest and a
`routes/` directory with one route file per resource. For example:

```text
src/modules/
├── index.js                         Explicit registry of all 16 modules
├── register.js                      Coverage checks and Fastify registration
├── finance/
│   ├── finance.controller.js        Finance handlers, including booking balances
│   ├── finance.routes.js            Finance resource route manifest
│   └── routes/
│       ├── contracts.routes.js
│       ├── contract-lines.routes.js
│       ├── booking-balances.routes.js
│       └── ...
├── rentals/
│   ├── rentals.controller.js
│   ├── rentals.routes.js
│   └── routes/
│       ├── bookings.routes.js
│       └── ...
└── ...
```

The modules are identity, geography, access-control, catalogue, fleet, workforce,
compliance, rentals, scheduling, logistics, finance, reputation, support,
messaging, referrals and audit. The `access-control` folder and URL retain the
`access_control` database name and Swagger tag.

`app.js` registers modules after the shared authentication hook. Startup checks
that each of the 122 model resources has exactly one route registration in its
own domain. The module controller exposes handlers by resource name, such as
`controller.contracts.list`. Resource routes select these handlers and reuse
`src/http/resource-routes.js` for schemas and allowed methods. Controllers reuse
`src/http/resource-controller.js` for standard operations and can add or override
handlers in their own module. Services and repositories continue to own
transactions, filtering, pagination, audit writes and database constraints.

To customize a resource, start in its `routes/<resource>.routes.js` and its
module controller. When adding a model resource, add its route file to the
module manifest too; incomplete coverage fails startup. Changes in shared HTTP
helpers apply across all modules.

Contracts remain append-only, and batch operations still use the shared
`/v1/transactions` service. The derived booking-balances route now belongs to
the finance module and is handled by `finance.controller.js`.

The API has bounded payloads/pagination, strict input validation, security headers, per-IP rate limiting, sanitized logs, generated request IDs, and graceful shutdown. No provider payment, refund, payout, SMS, upload, or background job is executed by these data endpoints. Writing a provider-status column is a local data operation, not evidence of a real payment. Production marketplace commands, actor authorization, verified integrations and legacy-data migration remain outside this confirmed scope.

## Verify and maintain

For local development/testing after the Compose database starts:

```sh
npm ci
npm test
npm run export
npm run validate
npm run check:swagger
npm run smoke
```

Integration tests use the configured **demo database** and add clearly labeled test fixtures. They exercise every table's list endpoint, permissions, FK/uniqueness constraints, composite keys, append-only restrictions, archives, SQL-injection rejection, rollback, exact bigint handling, concurrent reservation conflicts and deferred ledger balancing. Do not point them at a production database.

`npm run check:swagger` builds the current app against the local database,
checks Swagger UI and `/openapi.json`, validates OpenAPI, compares it with the
saved specification and prints coverage for all 16 modules (122 resources,
463 operations). It checks each resource's methods, response codes and domain
tag, plus the derived finance view, metadata and batch endpoints. All table
routes also have integration checks for inherited authentication, validation
and unsupported methods. For intentional API changes, review the generated
specification with `npm run export` before rerunning this check.

`npm run smoke` sends the exported Quickstart requests to the running HTTP server; it does not automate the Postman application. `npm run validate` validates generated OpenAPI and collection structure. `npm run export` refreshes the private Postman environment after key/port changes.

To run Node directly while keeping PostgreSQL in Docker: `docker compose up -d db`, `npm run migrate`, then `npm start` (stop the Compose API first to free port 3100). Keep `PG_PORT`/`PGPORT` and `API_PORT`/`PORT` aligned when editing host ports. Normal `docker compose down` stops services and retains data; do not add `-v` unless intentionally discarding this demo database.

Design references: [Fastify validation](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [node-postgres transactions](https://node-postgres.com/features/transactions), [Compose startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/).
