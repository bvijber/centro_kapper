# Database Foundation

This directory is server-only database infrastructure. It must not be imported by browser components, routes, contexts, or other client-reachable modules.

## Settings foundation

The schema supports the future `/staff/settings` area:

- `services` supports editing, activation/deactivation, and soft archival with `archivedAt`.
- Appointment service name, price, and duration are snapshots, so service edits do not change history.
- `opening_hours` stores one row per weekday. `break_periods` is reserved for future dated breaks.
- `business_profile` is a singleton and currently constrains the timezone to `Europe/Amsterdam`.
- `staff_profiles` stores display name, phone, and active status.
- Future staff-only settings mutations must record changes in `audit_logs` with validated JSON metadata such as `{ before, after }`.

The settings UI, settings API, authentication/authorization, and audit-writing behavior are deferred to a later staff-management phase. Only staff may change settings once that phase is implemented.

Future authentication must use Argon2id. Authentication is intentionally not implemented here.

## Appointment behavior deferred

The schema does not prevent overlapping appointments. The future appointment service must use a transaction and a server-side overlap query. The appointment indexes support those queries.

## Development seed

`seed.ts` contains clearly marked neutral development placeholders only. Replace the business details, staff details, hours, services, and prices with confirmed Centro Kapper data before production. It creates no usable production password or production user.
