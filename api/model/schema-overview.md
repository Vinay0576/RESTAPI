# Schema/domain inventory

122 proposed application tables in 16 business schemas; two additional purpose-specific schemas hold extension/API objects.

| Schema | Purpose | Tables |
|---|---|---|
| `identity` | Actors, contracting accounts, app admission, consent and device binding | `profiles`, `accounts`, `memberships`, `app_registrations`, `customer_login_links`, `device_bindings`, `session_bindings`, `consents`, `phone_session_proofs` |
| `access_control` | Capability grants and non-exposed authorization helpers | `roles`, `capabilities`, `role_capabilities`, `role_grants` |
| `geography` | Administrative regions and saved places | `regions`, `sites` |
| `catalogue` | Equipment reference data and versioned compatibility | `equipment_categories`, `manufacturers`, `manufacturer_aliases`, `models`, `variants`, `attachment_categories`, `attachments`, `compatibility_rules`, `compatibility_policies` |
| `fleet` | Physical equipment, stock and listing prices | `machines`, `machine_spec_overrides`, `machine_photos`, `machine_rate_versions`, `attachment_stock`, `attachment_units`, `attachment_rate_versions`, `included_attachments`, `onboarding_rule_versions` |
| `workforce` | Operator identity, reviewed skills, roster consent and availability | `operators`, `skill_claims`, `skill_reviews`, `roster_memberships`, `roster_invitations`, `availability_sessions`, `category_rate_versions` |
| `compliance` | Private evidence submissions and immutable reviews | `documents`, `document_reviews`, `licence_categories`, `identity_cases` |
| `rentals` | Demand, contracts, staffing and operator-only hires | `customer_vehicles`, `nominated_operators`, `requests`, `request_attachments`, `offers`, `bookings`, `site_snapshots`, `operator_nominations`, `verification_links`, `party_snapshots`, `attachment_lines`, `staffing`, `assignments`, `operator_hires`, `lifecycle_events`, `schedule_changes`, `overtime`, `incidents`, `work_sessions` |
| `scheduling` | Shared resource reservation and matching | `resources`, `blocks`, `checkout_holds`, `reservations`, `match_searches`, `match_attempts` |
| `logistics` | Custody, inspections, movement, transport and position | `custody_events`, `challenges`, `condition_reports`, `condition_photos`, `attachment_movements`, `pickup_checks`, `positions`, `tariff_versions`, `quotes`, `booking_quotes` |
| `finance` | Commercial terms, payment, refund, settlement and accounting | `currencies`, `policy_versions`, `contracts`, `contract_lines`, `invoices`, `obligations`, `payment_attempts`, `payment_events`, `captures`, `refunds`, `payee_profiles`, `payouts`, `payout_tax_lines`, `payout_events`, `wage_adjustments`, `wage_receipts`, `wage_acknowledgements`, `deposit_events`, `access_plan_versions`, `access_purchases`, `access_entitlements`, `ledger_accounts`, `journals`, `entries` |
| `reputation` | Perspective-specific reviews and private favorites | `reviews`, `scores`, `responses`, `reports`, `favorites` |
| `support` | Help, disputes, damage claims and conversation history | `cases`, `damage_details`, `payout_holds`, `conversations`, `messages`, `agent_presence`, `app_feedback` |
| `messaging` | Transactional outbox, inbox and push devices | `outbox`, `notifications`, `push_devices` |
| `referrals` | Consent-bound referral provenance; feature stays gated | `codes`, `intents`, `attributions` |
| `audit` | Append-only business and privileged-access evidence | `events` |
| `db_extensions` | PostgreSQL extension objects only; no application tables | None |
| `rental_api` | Future sanitized invoker API entry points; no tables | None |

Supabase owns `auth`, `storage`, `realtime`, `cron`, `vault`, and its migration schemas. They are prerequisites/integrations, not proposed application domains. These scripts create no application objects in `public` or `private`.
