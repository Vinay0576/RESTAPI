# Detailed table definitions

Generated from build_model.py. SQL is normative; all columns, nullability, defaults, PKs, FKs and row constraints appear below. An omitted NOT NULL permits NULL. Unspecified FK delete action is NO ACTION: historical dependencies prevent destructive deletion.

Every table has created_at/created_by. Mutable tables additionally have server-maintained updated_at/updated_by. Archive tables have archived_at/archived_by. Append-only tables reject UPDATE/DELETE. Audit actors reference stable identity.profiles rows, not a removable Auth login. Backend commands must validate/set the initiating actor; defaults are not proof of user intent.

The integrity migration adds a B-tree index for each FK not already covered by the leading columns of a non-partial B-tree index. Primary/unique constraints create their own indexes. The access migration enables RLS on EVERY application table and denies unlisted client operations. Per-table specialized indexes are listed below.

## identity.profiles

Stable application actor, separate from a removable Supabase login. Never infer a shared person from a shared phone.

**Access:** Authenticated actor can read self and update display_name/locale only.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table identity.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  locale text not null default 'en',
  deactivated_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## identity.accounts

Contracting customer, company, fleet or operator business; each account is an isolation boundary.

**Access:** Active account members can read; registration/admin commands write.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table identity.accounts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer_individual','customer_company','owner_fleet','operator_business')),
  legal_name text not null check (length(btrim(legal_name)) > 0),
  tax_registration text,
  country_code text not null default 'IN' check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## identity.memberships

Explicit user-to-business authorization; individual and company accounts remain distinct.

**Access:** Self membership read; membership changes are privileged commands.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table identity.memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references identity.accounts(id),
  profile_id uuid not null references identity.profiles(id),
  member_role text not null check (member_role in ('owner','manager','member','billing')),
  ended_at timestamptz,
  unique (account_id, profile_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## identity.app_registrations

Explicit admission to each mobile app with exclusive owner/operator Partner role.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table identity.app_registrations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.profiles(id),
  app text not null check (app in ('customer','partner')),
  partner_role text check (partner_role in ('owner','operator')),
  revoked_at timestamptz,
  unique (profile_id, app),
  check ((app = 'partner' and partner_role is not null) or (app = 'customer' and partner_role is null)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## identity.customer_login_links

Server-verified routing from a phone-login actor to separate customer accounts; no raw phone copy.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table identity.customer_login_links (
  id uuid primary key default gen_random_uuid(),
  login_profile_id uuid not null references identity.profiles(id),
  account_id uuid not null references identity.accounts(id),
  customer_kind text not null check (customer_kind in ('customer_individual','customer_company')),
  verified_at timestamptz not null,
  unique (login_profile_id, customer_kind),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## identity.device_bindings

Active device generation for one actor and mobile app; not a duplicate Auth session store.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table identity.device_bindings (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references identity.app_registrations(id),
  device_fingerprint bytea not null,
  generation bigint not null default 1 check (generation > 0),
  activated_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## identity.session_bindings

Revocable session-to-device-generation evidence. Auth session UUID is opaque; its lifecycle belongs to Supabase.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table identity.session_bindings (
  session_id uuid primary key,
  device_binding_id uuid not null references identity.device_bindings(id),
  generation bigint not null check (generation > 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## identity.consents

Append-only acceptance/withdrawal of a named, versioned policy, including access-plan and referral consent.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table identity.consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.profiles(id),
  policy_code text not null,
  policy_version text not null,
  action text not null check (action in ('accept','withdraw')),
  evidence_hash bytea,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## identity.phone_session_proofs

Short-lived server-verified phone-login proof used when binding a distinct customer account identity. Does not itself grant account membership.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table identity.phone_session_proofs (
  id uuid primary key default gen_random_uuid(),
  source_session_id uuid not null,
  source_profile_id uuid not null references identity.profiles(id),
  target_profile_id uuid not null references identity.profiles(id),
  proof_hmac bytea not null unique,
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  check (expires_at > verified_at),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## geography.regions

Administrative geographic hierarchy for scope and tax jurisdiction; not copied city strings on every profile.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table geography.regions (
  code text primary key,
  parent_code text references geography.regions(code),
  name text not null,
  kind text not null check (kind in ('country','state','district','city')),
  check (code is distinct from parent_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## geography.sites

Editable saved work sites and yards; a rental freezes its own location separately.

**Access:** Account members read; controlled site commands write.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table geography.sites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references identity.accounts(id),
  label text not null,
  address text not null,
  region_code text references geography.regions(code),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## access_control.roles

Administrative role definitions, never client-assigned profile flags.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table access_control.roles (
  code text primary key,
  description text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## access_control.capabilities

Named business permissions such as compliance.review and finance.reconcile.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table access_control.capabilities (
  code text primary key,
  description text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## access_control.role_capabilities

Normalized many-to-many administrative permission matrix.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table access_control.role_capabilities (
  role_code text not null references access_control.roles(code),
  capability_code text not null references access_control.capabilities(code),
  primary key (role_code, capability_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## access_control.role_grants

Time-bounded, optionally region-scoped administrative delegation.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table access_control.role_grants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.profiles(id),
  role_code text not null references access_control.roles(code),
  region_code text references geography.regions(code),
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz,
  revoked_at timestamptz,
  check (valid_until is null or valid_until > valid_from),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## catalogue.equipment_categories

Canonical machine types; archive referenced types rather than deleting history.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table catalogue.equipment_categories (
  code text primary key,
  name text not null unique,
  requires_licence boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## catalogue.manufacturers

Canonical manufacturer identity.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table catalogue.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## catalogue.manufacturer_aliases

Search aliases as rows rather than repeated names or arrays.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table catalogue.manufacturer_aliases (
  alias_key text primary key check (alias_key = lower(btrim(alias_key))),
  manufacturer_id uuid not null references catalogue.manufacturers(id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## catalogue.models

Manufacturer/category-specific equipment models.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table catalogue.models (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references catalogue.manufacturers(id),
  category_code text not null references catalogue.equipment_categories(code),
  name text not null,
  unique (manufacturer_id, category_code, name),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## catalogue.variants

Model variants and typed technical specifications used by compatibility checks.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table catalogue.variants (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references catalogue.models(id),
  name text not null,
  operating_weight_kg numeric(12,3) check (operating_weight_kg > 0 and operating_weight_kg < 10000000),
  hydraulic_flow_lpm numeric(10,3) check (hydraulic_flow_lpm > 0 and hydraulic_flow_lpm < 100000),
  hydraulic_pressure_bar numeric(10,3) check (hydraulic_pressure_bar > 0 and hydraulic_pressure_bar < 100000),
  mounting_type text,
  pin_diameter_mm numeric(8,3) check (pin_diameter_mm > 0 and pin_diameter_mm < 10000),
  connection_type text,
  unique (model_id, name),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## catalogue.attachment_categories

Canonical implement categories.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table catalogue.attachment_categories (
  code text primary key,
  name text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## catalogue.attachments

An implement product definition, separate from any owner's stock.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table catalogue.attachments (
  id uuid primary key default gen_random_uuid(),
  category_code text not null references catalogue.attachment_categories(code),
  manufacturer_id uuid references catalogue.manufacturers(id),
  name text not null,
  mounting_type text,
  connection_type text,
  weight_kg numeric(12,3) check (weight_kg > 0 and weight_kg < 10000000),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## catalogue.compatibility_rules

Versioned fit decision at exactly one scope: variant overrides model overrides category. Null specs mean unknown.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table catalogue.compatibility_rules (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null references catalogue.attachments(id),
  category_code text references catalogue.equipment_categories(code),
  model_id uuid references catalogue.models(id),
  variant_id uuid references catalogue.variants(id),
  version integer not null check (version > 0),
  decision text not null check (decision in ('compatible','conditional','incompatible')),
  minimum_weight_kg numeric(12,3) check (minimum_weight_kg >= 0 and minimum_weight_kg < 10000000),
  maximum_weight_kg numeric(12,3) check (maximum_weight_kg > 0 and maximum_weight_kg < 10000000),
  minimum_flow_lpm numeric(10,3) check (minimum_flow_lpm >= 0 and minimum_flow_lpm < 100000),
  maximum_pressure_bar numeric(10,3) check (maximum_pressure_bar > 0 and maximum_pressure_bar < 100000),
  required_mounting_type text,
  required_connection_type text,
  effective_from timestamptz not null,
  check (num_nonnulls(category_code, model_id, variant_id) = 1),
  check (maximum_weight_kg is null or minimum_weight_kg is null or maximum_weight_kg >= minimum_weight_kg),
  unique nulls not distinct (attachment_id, category_code, model_id, variant_id, version),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## catalogue.compatibility_policies

Versioned treatment of unknown fit; no implicit compatibility when evidence is absent.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table catalogue.compatibility_policies (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  unknown_action text not null check (unknown_action in ('block','review')),
  effective_from timestamptz not null unique,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## fleet.machines

Owner's physical machine. Choose exactly one classification depth; do not copy category/model/manufacturer onto a linked variant.

**Access:** Owner-account members read full rows. Guest catalogue must use a sanitized API projection.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table fleet.machines (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references identity.accounts(id),
  category_code text references catalogue.equipment_categories(code),
  model_id uuid references catalogue.models(id),
  variant_id uuid references catalogue.variants(id),
  unmatched_make text,
  unmatched_model text,
  identification_number text not null,
  registration_jurisdiction text not null default 'IN',
  yard_site_id uuid not null references geography.sites(id),
  manufacture_year smallint check (manufacture_year between 1900 and 2200),
  lifetime_hours numeric(12,2) not null check (lifetime_hours >= 0 and lifetime_hours < 1000000000),
  publication_state text not null default 'draft' check (publication_state in ('draft','pending','listed','suspended','retired')),
  check (num_nonnulls(category_code, model_id, variant_id) = 1),
  check (category_code is not null or (unmatched_make is null and unmatched_model is null)),
  unique (registration_jurisdiction, identification_number),
  unique (id, owner_account_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## fleet.machine_spec_overrides

Only physical-unit overrides of catalogue specs; NULL inherits the linked variant.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table fleet.machine_spec_overrides (
  machine_id uuid primary key references fleet.machines(id),
  operating_weight_kg numeric(12,3) check (operating_weight_kg > 0 and operating_weight_kg < 10000000),
  hydraulic_flow_lpm numeric(10,3) check (hydraulic_flow_lpm > 0 and hydraulic_flow_lpm < 100000),
  hydraulic_pressure_bar numeric(10,3) check (hydraulic_pressure_bar > 0 and hydraulic_pressure_bar < 100000),
  pin_diameter_mm numeric(8,3) check (pin_diameter_mm > 0 and pin_diameter_mm < 10000),
  mounting_type text,
  connection_type text,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## fleet.machine_photos

Ordered gallery; position zero is the cover, eliminating a duplicate cover URL.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table fleet.machine_photos (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references fleet.machines(id),
  bucket text not null,
  object_key text not null,
  position smallint not null check (position >= 0),
  unique (machine_id, position),
  unique (bucket, object_key),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## fleet.machine_rate_versions

Immutable listing-price versions. One row per billing mode; accepted contracts keep their own rounded terms.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table fleet.machine_rate_versions (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references fleet.machines(id),
  version integer not null check (version > 0),
  billing_mode text not null check (billing_mode in ('hour','day','month')),
  currency_code text not null default 'INR',
  rate_minor bigint not null check (rate_minor >= 0),
  effective_from timestamptz not null,
  unique (machine_id, billing_mode, version),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## fleet.attachment_stock

Owner's implement listing. Available quantity is counted from physical units and reservations.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table fleet.attachment_stock (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references identity.accounts(id),
  attachment_id uuid not null references catalogue.attachments(id),
  yard_site_id uuid not null references geography.sites(id),
  title text not null,
  unique (id, owner_account_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## fleet.attachment_units

One reservable implement unit, even when unnumbered. Prevents aggregate stock overselling.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table fleet.attachment_units (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references fleet.attachment_stock(id),
  inventory_tag text not null,
  condition_state text not null default 'usable' check (condition_state in ('usable','maintenance','retired')),
  unique (stock_id, inventory_tag),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## fleet.attachment_rate_versions

Immutable implement listing rates.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table fleet.attachment_rate_versions (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references fleet.attachment_stock(id),
  version integer not null check (version > 0),
  billing_mode text not null check (billing_mode in ('hour','day','month')),
  currency_code text not null default 'INR',
  rate_minor bigint not null check (rate_minor >= 0),
  effective_from timestamptz not null,
  unique (stock_id, billing_mode, version),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## fleet.included_attachments

Included standard equipment declaration, not separately rentable stock or a second charged line.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table fleet.included_attachments (
  machine_id uuid not null references fleet.machines(id),
  attachment_id uuid not null references catalogue.attachments(id),
  quantity smallint not null check (quantity > 0),
  primary key (machine_id, attachment_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## fleet.onboarding_rule_versions

Versioned category publication requirements, including maximum lifetime hours.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table fleet.onboarding_rule_versions (
  id uuid primary key default gen_random_uuid(),
  category_code text not null references catalogue.equipment_categories(code),
  version integer not null check (version > 0),
  max_lifetime_hours numeric(12,2) not null check (max_lifetime_hours > 0 and max_lifetime_hours < 1000000000),
  effective_from timestamptz not null,
  unique (category_code, version),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## workforce.operators

One work profile per actor, shared across fleets; licence evidence and reviews live in compliance.

**Access:** Operator reads own work profile; discovery uses reviewed, consented projection.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table workforce.operators (
  profile_id uuid primary key references identity.profiles(id),
  expected_day_rate_minor bigint check (expected_day_rate_minor >= 0),
  currency_code text not null default 'INR',
  travel_radius_km numeric(7,2) not null default 25 check (travel_radius_km > 0 and travel_radius_km <= 1000),
  base_latitude numeric(9,6) check (base_latitude between -90 and 90),
  base_longitude numeric(9,6) check (base_longitude between -180 and 180),
  check ((base_latitude is null) = (base_longitude is null)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## workforce.skill_claims

Declared equipment skills. A separate review grants matching eligibility.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table workforce.skill_claims (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references workforce.operators(profile_id),
  category_code text not null references catalogue.equipment_categories(code),
  experience_months smallint check (experience_months between 0 and 1200),
  unique (operator_id, category_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## workforce.skill_reviews

Immutable review decisions for a skill; latest effective review determines eligibility.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table workforce.skill_reviews (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references workforce.skill_claims(id),
  decision text not null check (decision in ('approved','rejected','revoked')),
  valid_until timestamptz,
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## workforce.roster_memberships

Fleet-to-operator relationship only. No copied phone, name, licence, default rate or GPS.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table workforce.roster_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references identity.accounts(id),
  operator_id uuid not null references workforce.operators(profile_id),
  state text not null check (state in ('active','paused','ended')),
  joined_at timestamptz not null,
  ended_at timestamptz,
  check ((state = 'ended') = (ended_at is not null)),
  unique (id, owner_account_id, operator_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Specialized indexes:

```sql
create unique index roster_one_current on workforce.roster_memberships(owner_account_id, operator_id) where ended_at is null;
```

## workforce.roster_invitations

Consent and re-invitation history, including invitation before an operator has registered.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table workforce.roster_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references identity.accounts(id),
  operator_id uuid references workforce.operators(profile_id),
  phone_hmac bytea,
  state text not null default 'pending' check (state in ('pending','accepted','declined','withdrawn','expired')),
  expires_at timestamptz not null,
  membership_id uuid references workforce.roster_memberships(id),
  check (num_nonnulls(operator_id, phone_hmac) = 1),
  check ((state = 'accepted') = (membership_id is not null)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## workforce.availability_sessions

Operator opt-in availability windows and permission evidence; independent of committed reservations.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table workforce.availability_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references workforce.operators(profile_id),
  available_from timestamptz not null,
  available_until timestamptz not null,
  closed_at timestamptz,
  permission_snapshot jsonb not null check (jsonb_typeof(permission_snapshot) = 'object'),
  check (available_until > available_from),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## workforce.category_rate_versions

Platform-published customer/operator rate terms by reviewed equipment skill category.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table workforce.category_rate_versions (
  id uuid primary key default gen_random_uuid(),
  category_code text not null references catalogue.equipment_categories(code),
  version integer not null check (version > 0),
  currency_code text not null default 'INR',
  customer_hour_minor bigint not null check (customer_hour_minor > 0),
  operator_hour_minor bigint not null check (operator_hour_minor >= 0 and operator_hour_minor <= customer_hour_minor),
  effective_from timestamptz not null,
  unique (category_code, version),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## compliance.documents

Immutable submitted evidence revision for exactly one actor, account, rental machine or customer vehicle; private Storage path, never a signed URL.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table compliance.documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references identity.profiles(id),
  account_id uuid references identity.accounts(id),
  machine_id uuid references fleet.machines(id),
  customer_vehicle_id uuid,
  nominated_operator_id uuid,
  document_type text not null,
  bucket text not null,
  object_key text not null,
  content_sha256 bytea check (octet_length(content_sha256) = 32),
  issued_on date,
  expires_on date,
  supersedes_id uuid references compliance.documents(id),
  check (num_nonnulls(profile_id, account_id, machine_id, customer_vehicle_id, nominated_operator_id) = 1),
  check (expires_on is null or issued_on is null or expires_on >= issued_on),
  unique (bucket, object_key),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## compliance.document_reviews

Append-only verification decisions. Pending is absence of a decision; expiry is derived from the evidence date.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table compliance.document_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references compliance.documents(id),
  decision text not null check (decision in ('verified','rejected','revoked')),
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## compliance.licence_categories

Categories authorized by a specific licence submission, rather than trusting self-declared skills.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table compliance.licence_categories (
  document_id uuid not null references compliance.documents(id),
  category_code text not null references catalogue.equipment_categories(code),
  primary key (document_id, category_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## compliance.identity_cases

Potential duplicate/conflicting operator identities; review before linking, never automatic phone merges.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table compliance.identity_cases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.profiles(id),
  other_profile_id uuid not null references identity.profiles(id),
  evidence_fingerprint bytea not null,
  state text not null default 'open' check (state in ('open','distinct','linked','rejected')),
  resolved_at timestamptz,
  check (profile_id <> other_profile_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.customer_vehicles

Customer-owned equipment used for operator-only hire. Ownership evidence is optional and never a hire gate.

**Access:** Customer account members read; verified evidence remains immutable.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table rentals.customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  category_code text not null references catalogue.equipment_categories(code),
  identification_number text not null,
  unique (customer_account_id, identification_number),
  unique (id, customer_account_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## rentals.nominated_operators

Customer-managed operator identity, including a person without a platform login. Linked actors use their profile rather than copied name/contact fields.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table rentals.nominated_operators (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  profile_id uuid references identity.profiles(id),
  external_name text,
  external_phone_ciphertext bytea,
  check ((profile_id is not null and external_name is null and external_phone_ciphertext is null) or (profile_id is null and external_name is not null and external_phone_ciphertext is not null)),
  unique (id, customer_account_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## rentals.requests

Unfulfilled demand and ordinary request intake, including missing custom types. Not a confirmed reservation.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.requests (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  category_code text references catalogue.equipment_categories(code),
  custom_equipment text,
  site_id uuid not null references geography.sites(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  operator_required boolean not null,
  notes text,
  state text not null default 'open' check (state in ('open','fulfilled','cancelled','expired')),
  expires_at timestamptz not null,
  request_key uuid not null,
  check (ends_at > starts_at),
  check (num_nonnulls(category_code, custom_equipment) = 1),
  unique (customer_account_id, request_key),
  check (isfinite(starts_at) and isfinite(ends_at)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.request_attachments

Normalized requested implement quantities, not a JSON list inside demand.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.request_attachments (
  request_id uuid not null references rentals.requests(id),
  attachment_id uuid not null references catalogue.attachments(id),
  quantity smallint not null check (quantity > 0),
  primary key (request_id, attachment_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.offers

Owner response/custom-hours quote to a request. Price and expiry must be revalidated at conversion.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references rentals.requests(id),
  machine_id uuid not null references fleet.machines(id),
  state text not null default 'offered' check (state in ('offered','accepted','declined','withdrawn','expired')),
  expires_at timestamptz not null,
  quoted_hours numeric(7,2) not null check (quoted_hours > 0 and quoted_hours <= 744),
  currency_code text not null default 'INR',
  rental_minor bigint not null check (rental_minor >= 0),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## rentals.bookings

Equipment rental aggregate: parties, agreed interval and operational state only. Funding, custody, pricing and staffing are separate.

**Access:** Customer/supplier members and accepted assigned operator read; no direct client writes.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  supplier_account_id uuid not null references identity.accounts(id),
  machine_id uuid not null references fleet.machines(id),
  offer_id uuid unique references rentals.offers(id),
  request_key uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  mode text not null check (mode in ('operated','machine_only')),
  priority boolean not null default false,
  state text not null default 'requested' check (state in ('requested','confirmed','dispatched','on_site','in_use','completed','cancelled','expired')),
  check (ends_at > starts_at),
  check (customer_account_id <> supplier_account_id),
  unique (customer_account_id, request_key),
  unique (id, supplier_account_id),
  check (isfinite(starts_at) and isfinite(ends_at)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Specialized indexes:

```sql
create index bookings_customer_timeline on rentals.bookings(customer_account_id, created_at desc, id);
create index bookings_supplier_state on rentals.bookings(supplier_account_id, state, starts_at);
```

## rentals.site_snapshots

Immutable jobsite revision; preserves the agreed address when a saved site changes.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table rentals.site_snapshots (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  revision integer not null check (revision > 0),
  source_site_id uuid references geography.sites(id),
  address text not null,
  region_code text references geography.regions(code),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  unique (booking_id, revision),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.operator_nominations

Immutable nomination changes for machine-only rentals, including the accepted licence submission.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table rentals.operator_nominations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  nominated_operator_id uuid not null references rentals.nominated_operators(id),
  licence_document_id uuid not null references compliance.documents(id),
  supersedes_id uuid references rentals.operator_nominations(id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.verification_links

Evidence submissions relied upon for a rental decision, distinct from a person's current verification state.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table rentals.verification_links (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  document_id uuid not null references compliance.documents(id),
  purpose text not null check (purpose in ('customer_company','operator_licence','machine_compliance')),
  unique (booking_id, document_id, purpose),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.party_snapshots

Immutable legal/display identity at agreement time, not a cache of the current profile.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table rentals.party_snapshots (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  party_role text not null check (party_role in ('customer','supplier')),
  legal_name text not null,
  tax_registration text,
  billing_address text not null,
  unique (booking_id, party_role),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.attachment_lines

Accepted implement configuration and price source, independent of present catalogue/rate changes.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table rentals.attachment_lines (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  stock_id uuid not null references fleet.attachment_stock(id),
  rate_version_id uuid not null references fleet.attachment_rate_versions(id),
  compatibility_rule_id uuid references catalogue.compatibility_rules(id),
  description_snapshot text not null,
  quantity smallint not null check (quantity > 0),
  unique (booking_id, stock_id),
  unique (id, booking_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.staffing

One provider decision per booking; accepted assignment locks owner/platform/self provider changes.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.staffing (
  booking_id uuid primary key references rentals.bookings(id),
  provider text not null check (provider in ('owner_roster','platform','owner_self','customer')),
  locked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.assignments

Operator offer/acceptance history. Stable operator FK plus frozen wage and payout route; owner roster is optional provenance.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  operator_id uuid not null references workforce.operators(profile_id),
  roster_membership_id uuid references workforce.roster_memberships(id),
  state text not null default 'offered' check (state in ('offered','accepted','declined','withdrawn','completed','cancelled','expired')),
  provider text not null check (provider in ('owner_roster','platform','owner_self','customer')),
  payout_route text not null check (payout_route in ('combined_owner','separate_operator','customer_managed')),
  currency_code text not null default 'INR',
  agreed_wage_minor bigint not null check (agreed_wage_minor >= 0),
  offered_until timestamptz not null,
  accepted_at timestamptz,
  ended_at timestamptz,
  check ((provider in ('owner_roster','owner_self') and payout_route = 'combined_owner') or (provider = 'platform' and payout_route = 'separate_operator') or (provider = 'customer' and payout_route = 'customer_managed')),
  check (state not in ('accepted','completed') or accepted_at is not null),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

Specialized indexes:

```sql
create unique index assignment_one_active on rentals.assignments(booking_id) where state = 'accepted' and ended_at is null;
```

## rentals.operator_hires

Operator-only request for customer equipment. Frozen quote; acceptance confirms it. No collection or paid flag is implied.

**Access:** Requesting customer members and chosen operator read.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.operator_hires (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  vehicle_id uuid not null,
  operator_id uuid not null references workforce.operators(profile_id),
  rate_version_id uuid not null references workforce.category_rate_versions(id),
  request_key uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  site_address text not null,
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  notes text,
  currency_code text not null default 'INR',
  quoted_total_minor bigint not null check (quoted_total_minor > 0),
  state text not null default 'requested' check (state in ('requested','accepted','declined','cancelled','completed','expired')),
  expires_at timestamptz not null,
  foreign key (vehicle_id, customer_account_id) references rentals.customer_vehicles(id, customer_account_id),
  check (ends_at >= starts_at + interval '1 hour' and ends_at <= starts_at + interval '12 hours'),
  unique (customer_account_id, request_key),
  check (isfinite(starts_at) and isfinite(ends_at)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## rentals.lifecycle_events

Append-only equipment and operator-hire transitions, with actor and reason.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table rentals.lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references rentals.bookings(id),
  operator_hire_id uuid references rentals.operator_hires(id),
  from_state text,
  to_state text not null,
  reason text,
  check (num_nonnulls(booking_id, operator_hire_id) = 1),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.schedule_changes

Requested date changes; preserves old/new intervals rather than overwriting historical consent.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.schedule_changes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  old_starts_at timestamptz not null,
  old_ends_at timestamptz not null,
  new_starts_at timestamptz not null,
  new_ends_at timestamptz not null,
  state text not null default 'requested' check (state in ('requested','approved','rejected','withdrawn')),
  reason text not null,
  check (old_ends_at > old_starts_at and new_ends_at > new_starts_at),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.overtime

Separate approval and charge basis for extra work; does not rewrite the original contract.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.overtime (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  revision integer not null check (revision > 0),
  minutes integer not null check (minutes > 0),
  state text not null default 'requested' check (state in ('requested','approved','rejected','disputed','cancelled')),
  currency_code text not null default 'INR',
  amount_minor bigint not null check (amount_minor >= 0),
  unique (booking_id, revision),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## rentals.incidents

Operational interruptions and delays, independent of money and rental completion state.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  kind text not null,
  description text not null,
  blocks_work boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## rentals.work_sessions

Actual metered work intervals. Closing a session records finish/pause independently of payment, completion and custody return.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table rentals.work_sessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('pause','finish','correction')),
  check (ended_at is null or ended_at > started_at),
  check ((ended_at is null) = (end_reason is null)),
  exclude using gist (booking_id with =, tstzrange(started_at,ended_at,'[)') with &&),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## scheduling.resources

One concurrency key for each machine, operator or attachment unit across all booking channels.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table scheduling.resources (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid unique references fleet.machines(id),
  operator_id uuid unique references workforce.operators(profile_id),
  attachment_unit_id uuid unique references fleet.attachment_units(id),
  check (num_nonnulls(machine_id, operator_id, attachment_unit_id) = 1),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## scheduling.blocks

Maintenance/unavailability intent. Reservations are the authoritative contention surface.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table scheduling.blocks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references scheduling.resources(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  cancelled_at timestamptz,
  check (ends_at > starts_at),
  check (isfinite(starts_at) and isfinite(ends_at)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## scheduling.checkout_holds

Short-lived server-created checkout claims. A request alone never reserves inventory.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table scheduling.checkout_holds (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  request_key uuid not null,
  expires_at timestamptz not null,
  released_at timestamptz,
  unique (customer_account_id, request_key),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## scheduling.reservations

Shared blocking occupancy including turnaround/custody. Released rows retain history; expiry requires an explicit transaction.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table scheduling.reservations (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references scheduling.resources(id),
  booking_id uuid references rentals.bookings(id),
  operator_hire_id uuid references rentals.operator_hires(id),
  block_id uuid references scheduling.blocks(id),
  checkout_hold_id uuid references scheduling.checkout_holds(id),
  busy_during tstzrange not null,
  released_at timestamptz,
  check (num_nonnulls(booking_id, operator_hire_id, block_id, checkout_hold_id) = 1),
  check (not isempty(busy_during) and not lower_inf(busy_during) and lower_inc(busy_during) and not upper_inc(busy_during)),
  exclude using gist (resource_id with =, busy_during with &&) where (released_at is null) deferrable initially immediate,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Specialized indexes:

```sql
create index reservation_booking_active on scheduling.reservations(booking_id) where released_at is null;
```

## scheduling.match_searches

Operator matching retry/deadline state for a booking.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table scheduling.match_searches (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  state text not null check (state in ('open','matched','exhausted','cancelled')),
  deadline_at timestamptz not null,
  next_attempt_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## scheduling.match_attempts

One offer attempt per operator per search; links to the resulting assignment instead of copying its state.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table scheduling.match_attempts (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references scheduling.match_searches(id),
  operator_id uuid not null references workforce.operators(profile_id),
  assignment_id uuid references rentals.assignments(id),
  outcome text not null,
  unique (search_id, operator_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.custody_events

Append-only yard/site transfers and cancellation returns. Completion does not imply physical return.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.custody_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  sequence_no integer not null check (sequence_no > 0),
  leg text not null check (leg in ('yard_release','site_handover','site_release','yard_return','cancellation_return')),
  from_profile_id uuid references identity.profiles(id),
  to_profile_id uuid references identity.profiles(id),
  occurred_at timestamptz not null default clock_timestamp(),
  unique (booking_id, sequence_no),
  unique (id, booking_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.challenges

Expiring hashed custody codes. Never store plaintext OTPs in readable booking rows.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table logistics.challenges (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  leg text not null check (leg in ('yard_release','site_handover','site_release','yard_return','cancellation_return')),
  code_hmac bytea not null,
  expires_at timestamptz not null,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.condition_reports

Immutable inspection at a custody leg, with a self-FK correction trail.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.condition_reports (
  id uuid primary key default gen_random_uuid(),
  custody_event_id uuid not null references logistics.custody_events(id),
  inspection_side text not null check (inspection_side in ('sender','recipient')),
  meter_hours numeric(12,2) check (meter_hours >= 0 and meter_hours < 1000000000),
  notes text,
  supersedes_id uuid references logistics.condition_reports(id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.condition_photos

Evidence photos as rows, independently orderable and retainable.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.condition_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references logistics.condition_reports(id),
  bucket text not null,
  object_key text not null,
  unique (bucket, object_key),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.attachment_movements

Per-unit dispatch/return/damage facts; returned quantity is derived, never an independently editable counter.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.attachment_movements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  line_id uuid not null,
  custody_event_id uuid not null,
  unit_id uuid not null references fleet.attachment_units(id),
  condition_state text not null check (condition_state in ('ok','damaged','missing')),
  foreign key (line_id, booking_id) references rentals.attachment_lines(id, booking_id),
  foreign key (custody_event_id, booking_id) references logistics.custody_events(id, booking_id),
  unique (custody_event_id, unit_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.pickup_checks

Registration/licence evidence for the actual pickup actor, separate from duty opt-in.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.pickup_checks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  operator_id uuid not null references workforce.operators(profile_id),
  vehicle_identification_snapshot text not null,
  licence_document_id uuid references compliance.documents(id),
  result text not null check (result in ('passed','failed')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.positions

Latest operational location only, retained briefly and visible only during eligible rental stages.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table logistics.positions (
  booking_id uuid not null references rentals.bookings(id),
  actor_id uuid not null references identity.profiles(id),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  primary key (booking_id, actor_id),
  check (expires_at > observed_at),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.tariff_versions

Separate machine-mobilization and transport-vehicle tariffs, versioned rather than overwritten.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.tariff_versions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('machine_mobilization','transport_vehicle')),
  category_code text references catalogue.equipment_categories(code),
  vehicle_registration text,
  version integer not null check (version > 0),
  currency_code text not null default 'INR',
  minimum_minor bigint not null check (minimum_minor >= 0),
  per_km_minor bigint not null check (per_km_minor >= 0),
  effective_from timestamptz not null,
  check ((kind = 'machine_mobilization' and category_code is not null and vehicle_registration is null) or (kind = 'transport_vehicle' and vehicle_registration is not null and category_code is null)),
  unique nulls not distinct (kind, category_code, vehicle_registration, version),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## logistics.quotes

Immutable route/amount evidence with expiry; booking consumption is a separate FK relation.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  tariff_version_id uuid not null references logistics.tariff_versions(id),
  origin_lat numeric(9,6) not null check (origin_lat between -90 and 90),
  origin_lon numeric(9,6) not null check (origin_lon between -180 and 180),
  destination_lat numeric(9,6) not null check (destination_lat between -90 and 90),
  destination_lon numeric(9,6) not null check (destination_lon between -180 and 180),
  distance_metres bigint not null check (distance_metres >= 0),
  amount_minor bigint not null check (amount_minor >= 0),
  expires_at timestamptz not null,
  route_provider text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## logistics.booking_quotes

Quote consumption by booking and transport leg; prevents reuse of a one-time quote.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table logistics.booking_quotes (
  quote_id uuid primary key references logistics.quotes(id),
  booking_id uuid not null references rentals.bookings(id),
  leg text not null check (leg in ('outbound','return')),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.currencies

Supported currency precision. Monetary values are integer minor units, never float or PostgreSQL money.

**Access:** Read-only reference data to anon/authenticated.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table finance.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  minor_unit_digits smallint not null check (minor_unit_digits between 0 and 4),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.policy_versions

Immutable typed pricing/payout rules; no mutable global rate can rewrite an accepted contract.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.policy_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  currency_code text not null default 'INR',
  tax_rate numeric(7,6) not null check (tax_rate between 0 and 1),
  commission_rate numeric(7,6) not null check (commission_rate between 0 and 1),
  retention_rate numeric(7,6) not null check (retention_rate between 0 and 1),
  check (commission_rate + retention_rate <= 1),
  advance_rate numeric(7,6) not null check (advance_rate between 0 and 1),
  security_deposit_minor bigint not null check (security_deposit_minor >= 0),
  free_cancel_seconds integer not null default 120 check (free_cancel_seconds >= 0),
  effective_from timestamptz not null unique,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.contracts

Immutable commercial revision for a booking, including the agreed full/advance/mobilization plan.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.contracts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  revision integer not null check (revision > 0),
  policy_version_id uuid not null references finance.policy_versions(id),
  machine_rate_version_id uuid not null references fleet.machine_rate_versions(id),
  currency_code text not null default 'INR',
  payment_plan text not null check (payment_plan in ('full','advance20','mobilization20')),
  agreed_at timestamptz not null,
  unique (booking_id, revision),
  unique (id, currency_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.contract_lines

Exact agreed components: rent, operator, implement, transport, tax, deposit, insurance or adjustment. Deposit is a liability, not taxable revenue.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.contract_lines (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references finance.contracts(id),
  line_no smallint not null check (line_no > 0),
  kind text not null check (kind in ('rental','operator','attachment','mobilization','tax','deposit','insurance','adjustment')),
  description text not null,
  quantity numeric(14,4) not null check (quantity > 0 and quantity < 10000000000),
  unit_rate_minor numeric(18,4) not null check (unit_rate_minor >= 0 and unit_rate_minor < 100000000000000),
  amount_minor bigint not null,
  attachment_line_id uuid references rentals.attachment_lines(id),
  check (kind = 'adjustment' or amount_minor >= 0),
  check ((kind = 'attachment') = (attachment_line_id is not null)),
  unique (contract_id, line_no),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.invoices

Issued document identity for a frozen contract revision. Legal party/site/line content remains in immutable contract snapshots; PDF is optional evidence.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.invoices (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references finance.contracts(id),
  number text not null unique,
  kind text not null check (kind in ('invoice','credit_note')),
  issued_at timestamptz not null,
  reverses_id uuid references finance.invoices(id),
  document_bucket text,
  document_key text,
  document_sha256 bytea check (octet_length(document_sha256) = 32),
  check ((kind = 'credit_note') = (reverses_id is not null)),
  check ((document_bucket is null) = (document_key is null)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.obligations

Payable installment or other approved charge. An operator-only hire has no obligation in the present product.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table finance.obligations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references finance.contracts(id),
  overtime_id uuid references rentals.overtime(id),
  damage_case_id uuid,
  access_purchase_id uuid,
  stage text not null check (stage in ('full','advance','balance','overtime','damage','access')),
  currency_code text not null default 'INR',
  amount_minor bigint not null check (amount_minor > 0),
  due_at timestamptz,
  voided_at timestamptz,
  check (num_nonnulls(contract_id, overtime_id, damage_case_id, access_purchase_id) = 1),
  check ((contract_id is not null and stage in ('full','advance','balance')) or (overtime_id is not null and stage = 'overtime') or (damage_case_id is not null and stage = 'damage') or (access_purchase_id is not null and stage = 'access')),
  unique nulls not distinct (contract_id, overtime_id, damage_case_id, access_purchase_id, stage),
  unique (id, currency_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.payment_attempts

One gateway checkout attempt for one obligation; failure/cancellation is not booking cancellation or proof of non-capture.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table finance.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null,
  currency_code text not null default 'INR',
  amount_minor bigint not null check (amount_minor > 0),
  provider text not null,
  provider_order_id text not null,
  request_key uuid not null unique,
  state text not null default 'created' check (state in ('created','pending','verifying','failed','cancelled','expired','captured')),
  expires_at timestamptz not null,
  foreign key (obligation_id, currency_code) references finance.obligations(id, currency_code),
  unique (provider, provider_order_id),
  unique (id, currency_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

Specialized indexes:

```sql
create unique index attempt_one_unresolved on finance.payment_attempts(obligation_id) where state in ('created','pending','verifying');
```

## finance.payment_events

Append-only provider callbacks and client checkout outcomes, deduplicated by provider event ID. Client outcomes cannot create captures.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.payment_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references finance.payment_attempts(id),
  source text not null check (source in ('provider','client','reconciler')),
  event_key text not null,
  event_kind text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  unique (source, event_key),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.captures

Only server-verified money receipts. First payment is MIN(verified_at) across base booking obligations, never reset by a later installment.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.captures (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null,
  currency_code text not null default 'INR',
  provider text not null,
  provider_payment_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  verified_at timestamptz not null default clock_timestamp(),
  provider_captured_at timestamptz not null,
  foreign key (attempt_id, currency_code) references finance.payment_attempts(id, currency_code),
  unique (provider, provider_payment_id),
  unique (id, currency_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.refunds

Refund obligation/attempt tied to an actual capture; pending is not paid. Aggregate caps require row locking.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table finance.refunds (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null,
  currency_code text not null default 'INR',
  request_key uuid not null unique,
  provider_refund_id text unique,
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null,
  state text not null default 'owed' check (state in ('owed','submitted','succeeded','failed','cancelled')),
  completed_at timestamptz,
  foreign key (capture_id, currency_code) references finance.captures(id, currency_code),
  check (state <> 'succeeded' or completed_at is not null),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.payee_profiles

Payout onboarding token/masked account information only; raw bank credentials remain with the provider.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table finance.payee_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references identity.accounts(id),
  provider text not null,
  provider_payee_id text not null,
  masked_destination text not null,
  verified_at timestamptz,
  unique (provider, provider_payee_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## finance.payouts

Versioned owner/operator payable. Combined-owner route creates no second platform operator transfer.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table finance.payouts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  assignment_id uuid references rentals.assignments(id),
  payee_id uuid not null references finance.payee_profiles(id),
  revision integer not null check (revision > 0),
  component text not null check (component in ('base','retention','overtime','adjustment')),
  route text not null check (route in ('combined_owner','owner','operator')),
  currency_code text not null default 'INR',
  gross_minor bigint not null check (gross_minor >= 0),
  state text not null default 'pending' check (state in ('pending','held','ready','submitted','paid','failed','superseded')),
  release_after timestamptz,
  provider_transfer_id text unique,
  unique (booking_id, payee_id, component, revision),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.payout_tax_lines

Individual deductions attached to one payable; tax calculation evidence is not a second collection.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.payout_tax_lines (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references finance.payouts(id),
  tax_code text not null,
  rate numeric(7,6) not null check (rate between 0 and 1),
  amount_minor bigint not null check (amount_minor >= 0),
  unique (payout_id, tax_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.payout_events

Append-only settlement status/provider evidence.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references finance.payouts(id),
  event_key text not null unique,
  event_kind text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.wage_adjustments

Signed owner-managed wage additions/advances, separate from platform payout obligations.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.wage_adjustments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references rentals.assignments(id),
  amount_minor bigint not null check (amount_minor <> 0),
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.wage_receipts

Reported owner-to-operator transfer evidence, never counted as an additional platform disbursement.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.wage_receipts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references rentals.assignments(id),
  amount_minor bigint not null check (amount_minor > 0),
  transfer_reference text not null,
  reported_at timestamptz not null,
  unique (assignment_id, transfer_reference),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.wage_acknowledgements

Operator receipt acknowledgement or contest as separate immutable evidence.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.wage_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references finance.wage_receipts(id),
  decision text not null check (decision in ('received','contested')),
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.deposit_events

Deposit held/refund/deduction evidence; retained independently of rental revenue.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.deposit_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rentals.bookings(id),
  kind text not null check (kind in ('held','refund_owed','refunded','deduction_approved')),
  amount_minor bigint not null check (amount_minor > 0),
  capture_id uuid references finance.captures(id),
  refund_id uuid references finance.refunds(id),
  reason text not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.access_plan_versions

Versioned operator access products and trial policy.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.access_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null,
  version integer not null check (version > 0),
  duration_seconds integer not null check (duration_seconds > 0),
  currency_code text not null default 'INR',
  price_minor bigint not null check (price_minor >= 0),
  terms_version text not null,
  effective_from timestamptz not null,
  unique (plan_code, version),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.access_purchases

Operator acceptance of an access plan; links to the common payment system rather than duplicating orders/refunds.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.access_purchases (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references workforce.operators(profile_id),
  plan_version_id uuid not null references finance.access_plan_versions(id),
  consent_id uuid not null references identity.consents(id),
  request_key uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## finance.access_entitlements

Granted paid/trial access interval and revocation. A refunded purchase cannot regrant access.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table finance.access_entitlements (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references workforce.operators(profile_id),
  purchase_id uuid unique references finance.access_purchases(id),
  kind text not null check (kind in ('trial','paid','admin')),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  revoked_at timestamptz,
  check (valid_until > valid_from),
  check ((kind = 'paid') = (purchase_id is not null)),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Specialized indexes:

```sql
create unique index one_operator_trial on finance.access_entitlements(operator_id) where kind = 'trial';
```

## finance.ledger_accounts

Currency-specific accounting accounts; balances are sums of entries, not user-editable wallet numbers.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table finance.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid references identity.accounts(id),
  code text not null,
  currency_code text not null default 'INR',
  kind text not null check (kind in ('asset','liability','revenue','expense','equity')),
  unique nulls not distinct (business_account_id, code, currency_code),
  unique (id, currency_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.journals

Append-only accounting postings with exactly one explicit source, including adjustments with a reason.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.journals (
  id uuid primary key default gen_random_uuid(),
  created_txid xid8 not null default pg_current_xact_id(),
  currency_code text not null default 'INR',
  capture_id uuid unique references finance.captures(id),
  refund_id uuid unique references finance.refunds(id),
  payout_id uuid unique references finance.payouts(id),
  adjustment_reason text,
  request_key uuid not null unique,
  check (num_nonnulls(capture_id, refund_id, payout_id, adjustment_reason) = 1),
  unique (id, currency_code),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## finance.entries

Signed debit(+)/credit(-) minor-unit postings; each journal must sum to zero at commit.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table finance.entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null,
  ledger_account_id uuid not null,
  currency_code text not null default 'INR',
  line_no smallint not null check (line_no > 0),
  amount_minor bigint not null check (amount_minor <> 0),
  foreign key (journal_id, currency_code) references finance.journals(id, currency_code),
  foreign key (ledger_account_id, currency_code) references finance.ledger_accounts(id, currency_code),
  unique (journal_id, line_no),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## reputation.reviews

One perspective-specific review per rental/author/target. Machine/operator/customer perspectives share storage but not visibility.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table reputation.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references rentals.bookings(id),
  operator_hire_id uuid references rentals.operator_hires(id),
  author_profile_id uuid not null references identity.profiles(id),
  author_role text not null check (author_role in ('customer','owner','operator')),
  target_account_id uuid references identity.accounts(id),
  target_operator_id uuid references workforce.operators(profile_id),
  target_machine_id uuid references fleet.machines(id),
  comment text,
  publish_after timestamptz not null,
  moderation_state text not null default 'pending' check (moderation_state in ('pending','approved','hidden')),
  audience text not null check (audience in ('public_customer','participants','staff')),
  check (num_nonnulls(booking_id, operator_hire_id) = 1),
  check (num_nonnulls(target_account_id, target_operator_id, target_machine_id) = 1),
  unique nulls not distinct (booking_id, operator_hire_id, author_profile_id, author_role, target_account_id, target_operator_id, target_machine_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## reputation.scores

Dimension scores, rather than duplicate review tables for communication/care/machine/operator.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table reputation.scores (
  review_id uuid not null references reputation.reviews(id),
  dimension text not null check (dimension in ('overall','communication','readiness','care','reliability','skill')),
  score smallint not null check (score between 1 and 5),
  primary key (review_id, dimension),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## reputation.responses

Participant response to one review.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table reputation.responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reputation.reviews(id),
  author_profile_id uuid not null references identity.profiles(id),
  body text not null,
  unique (review_id, author_profile_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## reputation.reports

Moderation report against a review; reporter is not exposed publicly.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table reputation.reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references reputation.reviews(id),
  reporter_profile_id uuid not null references identity.profiles(id),
  reason text not null,
  resolved_at timestamptz,
  unique (review_id, reporter_profile_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## reputation.favorites

Private customer saved machines/preferred operators, with real foreign keys for both targets.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table reputation.favorites (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references identity.accounts(id),
  machine_id uuid references fleet.machines(id),
  operator_id uuid references workforce.operators(profile_id),
  check (num_nonnulls(machine_id, operator_id) = 1),
  unique nulls not distinct (customer_account_id, machine_id, operator_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## support.cases

Common case envelope with explicit dispute/damage subtype. Damage claims retain their own financial/custody semantics.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table support.cases (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references rentals.bookings(id),
  opened_by uuid not null references identity.profiles(id),
  kind text not null check (kind in ('help','dispute','machine_damage','customer_damage','identity')),
  state text not null default 'open' check (state in ('open','investigating','awaiting_response','resolved','closed')),
  summary text not null,
  assigned_agent_id uuid references identity.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## support.damage_details

One damage claim extension; identifies liable party and custody evidence without deducting operator wages automatically.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table support.damage_details (
  case_id uuid primary key references support.cases(id),
  condition_report_id uuid references logistics.condition_reports(id),
  claimed_minor bigint not null check (claimed_minor > 0),
  awarded_minor bigint check (awarded_minor >= 0 and awarded_minor <= claimed_minor),
  currency_code text not null default 'INR',
  respondent_profile_id uuid references identity.profiles(id),
  respondent_account_id uuid references identity.accounts(id),
  check (num_nonnulls(respondent_profile_id, respondent_account_id) = 1),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Additional FK: `currency_code → finance.currencies.code`.

## support.payout_holds

Explicit dispute-to-payable hold, not a second mutable boolean on every booking.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table support.payout_holds (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references support.cases(id),
  payout_id uuid not null references finance.payouts(id),
  released_at timestamptz,
  unique (case_id, payout_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## support.conversations

Single conversation across automated help and human escalation; avoids copying a JSON transcript into ticket messages.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table support.conversations (
  id uuid primary key default gen_random_uuid(),
  opened_by uuid not null references identity.profiles(id),
  case_id uuid references support.cases(id),
  closed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## support.messages

Ordered append-only messages; sender FK absent only for system/bot messages.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table support.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support.conversations(id),
  sequence_no bigint not null check (sequence_no > 0),
  sender_profile_id uuid references identity.profiles(id),
  sender_kind text not null check (sender_kind in ('user','agent','bot','system')),
  body text not null,
  check ((sender_kind in ('user','agent')) = (sender_profile_id is not null)),
  unique (conversation_id, sequence_no),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## support.agent_presence

Support-agent capacity and heartbeat, distinct from end-user presence.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table support.agent_presence (
  profile_id uuid primary key references identity.profiles(id),
  capacity smallint not null check (capacity >= 0),
  available boolean not null default false,
  heartbeat_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## support.app_feedback

App experience feedback, separate from rental ratings and case resolution.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table support.app_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references identity.profiles(id),
  app text not null check (app in ('customer','partner')),
  body text not null,
  score smallint check (score between 1 and 5),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## messaging.outbox

Transactional event-to-notification delivery queue; workers retry with a stable deduplication key.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table messaging.outbox (
  id uuid primary key default gen_random_uuid(),
  event_key uuid not null unique,
  event_type text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  available_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  delivered_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Specialized indexes:

```sql
create index outbox_pending on messaging.outbox(available_at, id) where delivered_at is null;
```

## messaging.notifications

Per-recipient inbox record; read state separate from event payload and push delivery.

**Access:** Recipient reads own inbox; column-limited read_at updates only.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table messaging.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references identity.profiles(id),
  outbox_id uuid not null references messaging.outbox(id),
  title text not null,
  body text not null,
  read_at timestamptz,
  unique (recipient_profile_id, outbox_id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

Specialized indexes:

```sql
create index inbox_unread on messaging.notifications(recipient_profile_id, created_at desc) where read_at is null;
```

## messaging.push_devices

Push delivery token attached to a device binding; tokens are not general profile attributes.

**Access:** Backend commands only; no client table grant.

**Retention:** No generic soft delete. Use the table's terminal/revocation/end state where present; otherwise retain until an explicit retention process. Historical FKs prevent accidental cascades.

```sql
create table messaging.push_devices (
  id uuid primary key default gen_random_uuid(),
  device_binding_id uuid not null references identity.device_bindings(id),
  provider text not null,
  token_ciphertext bytea not null,
  token_hash bytea not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict
);
```

## referrals.codes

Referral invitation identity only; this design does not activate unapproved rewards.

**Access:** Backend commands only; no client table grant.

**Retention:** Soft archive with actor/time; referenced records retained and identifiers are not recycled. Archive is not erasure.

```sql
create table referrals.codes (
  id uuid primary key default gen_random_uuid(),
  referrer_profile_id uuid not null references identity.profiles(id),
  code text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references identity.profiles(id) on delete restrict,
  archived_at timestamptz,
  archived_by uuid references identity.profiles(id) on delete restrict,
  check ((archived_at is null) = (archived_by is null))
);
```

## referrals.intents

Expiring preregistration intention using keyed phone fingerprint; HMAC key is stored outside application tables.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table referrals.intents (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references referrals.codes(id),
  phone_hmac bytea not null,
  expires_at timestamptz not null,
  consented_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## referrals.attributions

Accepted, consented referral provenance, one per new actor; no self referral.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table referrals.attributions (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null unique references referrals.intents(id),
  referred_profile_id uuid not null unique references identity.profiles(id),
  consent_id uuid not null references identity.consents(id),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

## audit.events

Append-only application/admin/PII-access evidence. Object key is audit metadata, deliberately not a polymorphic operational FK.

**Access:** Backend commands only; no client table grant.

**Retention:** Append-only evidence; correction by new event/revision. No soft-delete flag. Governed retention/anonymization is a separate privileged maintenance process.

```sql
create table audit.events (
  id bigint generated always as identity primary key,
  event_type text not null,
  object_schema text not null,
  object_table text not null,
  object_key text not null,
  request_id uuid,
  reason text,
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references identity.profiles(id) on delete restrict
);
```

Specialized indexes:

```sql
create index audit_object_timeline on audit.events(object_schema, object_table, object_key, created_at desc);
```

## Deferred dependency FKs

- compliance.documents.customer_vehicle_id → rentals.customer_vehicles.id
- compliance.documents.nominated_operator_id → rentals.nominated_operators.id
- finance.obligations.damage_case_id → support.damage_details.case_id
- finance.obligations.access_purchase_id → finance.access_purchases.id

Cross-table business guards, immutability, automatic audit columns, ledger balance checks and the shared reservation exclusion are documented in README.md and the integrity migration.
