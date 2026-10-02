# Centro Kapper Production Operations

## Owner provisioning

1. Provide `DATABASE_URL`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME` and `OWNER_PHONE` only through the protected deployment environment or local `.env.local`.
2. Apply the committed Drizzle migrations through the deployment process.
3. Run `npm run auth:create-owner` once against the intended database.
4. Replace development seed placeholders with confirmed salon, owner and service data before enabling customer booking.
5. Do not use `STAFF_*` variables or create staff accounts. The runtime owner role is `owner`.

## Migration verification

- Run `npm run db:check` before deployment.
- Apply migrations in order from `drizzle/` using the deployment's approved migration runner.
- Never reset or drop the production database to resolve migration drift.
- Verify the owner row, `owner_profiles`, business profile, opening hours, booking settings and active services after migration.

## Security verification

- Set `NODE_ENV=production` and use HTTPS.
- Set `TRUSTED_PROXY=true` only when the deployment proxy strips and replaces forwarded client IP headers.
- Keep database credentials and owner password server-only.
- Verify secure session cookies, CSRF protection, rate limits and audit logging after deployment.
