# Migrating from Google Sheets / JSON file to PostgreSQL

1. **Repository layer**  
   Introduce `src/db/repository/` with interfaces mirroring `SheetDb` (`list`, `append`, `update`, `findById`).  
   Implement `PostgresRepository` using `pg` or Prisma/Drizzle.

   The current `SheetDb` contract is defined in `src/db/sheet-db.interface.ts` and implemented by `file-sheet-db.ts` and `google-sheet-db.ts`.

2. **Mapping**  
   Each current **sheet tab** maps 1:1 to a **Postgres table** (see `docs/schema/postgresql.sql`).

3. **IDs**  
   Keep UUID string IDs for minimal API churn.

4. **Google Sheets (optional hybrid)**  
   Use Sheets as export/reporting only, or sync via scheduled job from Postgres.

5. **Environment**  
   Add `DATABASE_URL` and run migrations (e.g. `node-pg-migrate`, Drizzle Kit, or Prisma migrate).

6. **Auth**  
   Move password hashes to `users.password_hash`; consider refresh tokens and OAuth for staff SSO later.
