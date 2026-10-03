DO $$
BEGIN
  IF (SELECT count(*) FROM "users" WHERE "role" = 'owner') > 1 THEN
    RAISE EXCEPTION 'Owner-only invariant violated: more than one owner account exists';
  END IF;
END $$;

CREATE UNIQUE INDEX "users_single_owner_idx" ON "users" ("role") WHERE "role" = 'owner';
