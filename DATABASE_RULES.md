# Centro Kapper — Database Rules

**Document:** Database Rules  
**Versie:** 1.0  
**Status:** Living Document / Source of Truth  
**Project:** Centro Kapper  
**Laatste update:** 2026-09-03

## Current Owner Model

Nieuwe productieaccounts gebruiken `owner` of `customer`. Oude staff-rijen worden via de owner-backfillmigration geconverteerd. `owner_profiles` is de actuele persistence-tabel; staff-termen in historische migrations zijn legacy.

De eigenaar is een database-afgedwongen singleton: `users_single_owner_idx` is een partiele unieke index op `users(role) WHERE role = 'owner'` (migration `0010_single_owner.sql`). Provisioning (`createInitialOwnerAccount()` / `scripts/create-owner.ts`) controleert dit binnen dezelfde transactie en faalt met `SETUP_FAILED` wanneer er al een eigenaar bestaat. Concurrente aanmaakpogingen worden door de index afgewezen. `src/db/seed.ts` maakt bewust geen eigenaar aan.

---

## 1. Doel en status

Dit document is de technische source of truth voor databaseontwikkeling binnen Centro Kapper. Het beschrijft de bestaande databasebasis en de regels voor toekomstige schema-, persistence- en transactiewijzigingen.

Claims over de huidige database zijn gebaseerd op de repository, `PRODUCT_REQUIREMENTS.md`, `BUSINESS_RULES.md`, `ARCHITECTURE.md`, de Drizzle-schema’s en de bestaande migrations.

In dit document betekenen de labels:

- **CURRENT:** daadwerkelijk aanwezig in schema, code of migration;
- **DATABASE RULE:** regel voor toekomstige databaseontwikkeling;
- **FUTURE/MISSING:** benodigde capaciteit die nog niet als bestaande functionaliteit aanwezig is.

Productbeslissingen blijven afkomstig uit `PRODUCT_REQUIREMENTS.md` en `BUSINESS_RULES.md`. De database mag open beslissingen ondersteunen, maar mag ze niet zelfstandig invullen.

---

## 2. Database stack

**CURRENT**

- PostgreSQL via Neon;
- `@neondatabase/serverless` voor de runtimeverbinding;
- Drizzle ORM `^0.45.2`;
- Drizzle Kit `^0.31.10`;
- schema-entrypoint: `src/db/schema/index.ts`;
- migration-output: `drizzle/`;
- databaseconfiguratie in `drizzle.config.ts`;
- connection string via `DATABASE_URL`.

`drizzle.config.ts` gebruikt dialect `postgresql`, leest `./src/db/schema/index.ts`, schrijft naar `./drizzle` en staat op `strict: true` en `verbose: true`.

`src/db/client.server.ts` valideert dat `DATABASE_URL` aanwezig is, maakt een Neon HTTP-client en exporteert een Drizzle databaseclient met het schema.

---

## 3. Database access

**DATABASE RULE**

- Database access is uitsluitend server-side.
- Client-code mag nooit rechtstreeks met PostgreSQL of Neon communiceren.
- Queries horen in server-only/domain/data code.
- `DATABASE_URL` en andere databasecredentials blijven server-only.
- Databaseclient en schema-imports mogen niet vanuit browsercomponents, routes, contexts of andere client-reachable modules worden geïmporteerd.

De bestaande server-only conventie gebruikt onder andere `client.server.ts`. Nieuwe databasecode volgt die conventie.

---

## 4. Schema ownership

**CURRENT**

`src/db/schema/index.ts` exporteert de afzonderlijke schema’s voor:

- appointments;
- audit logs;
- business profile, opening hours en breaks;
- enums;
- owner notifications (interne eigenaar-notificaties);
- profiles;
- rate limits;
- services;
- users en sessions;
- waiting-list entries.

De Drizzle-schema’s zijn de technische representatie van de database. TypeScript `relations` beschrijven queryrelaties; de feitelijke referentiële integriteit wordt door PostgreSQL foreign keys afgedwongen.

**DATABASE RULE**

Wijzigingen worden eerst in het Drizzle-schema gemodelleerd en daarna met een nieuwe migration vastgelegd. Schema’s, relations en migrations mogen niet uit elkaar lopen.

---

## 5. Migrations

**DATABASE RULE**

Normale schemawijzigingen volgen deze volgorde:

1. wijzig het Drizzle-schema;
2. genereer een nieuwe migration via Drizzle Kit;
3. inspecteer de gegenereerde SQL en schema-diff;
4. controleer de migration met Drizzle Kit;
5. pas de migration toe via het afgesproken deploymentproces;
6. controleer daarna schema en applicatiegedrag.

Bestaande migrations worden niet achteraf herschreven om nieuwe functionaliteit te implementeren. Nieuwe wijzigingen krijgen nieuwe migrations. Handmatige SQL buiten het migrationsysteem is niet de normale route voor applicatieschemawijzigingen.

De status/consistentie van migrations wordt momenteel gecontroleerd met:

```bash
npm run db:check
```

Nieuwe migrations worden momenteel voorbereid met:

```bash
npm run db:generate
```

`package.json` bevat geen migration-applyscript. De repository bevat ook geen production migration runner; het toepassen van migrations moet daarom door het bestaande deploymentproces worden geregeld.

---

## 6. Bestaande migrations en databasebasis

**CURRENT**

### `drizzle/0000_breezy_vanisher.sql`

Deze migration maakt de core databasebasis aan:

- enum types voor user roles, appointment statuses, appointment sources en waiting-list statuses;
- `appointments`;
- `audit_logs`;
- `break_periods`;
- `business_profile`;
- `opening_hours`;
- `customer_profiles`;
- `staff_profiles`;
- `services`;
- `sessions`;
- `users`;
- `waiting_list_entries`.

De migration bevat foreign keys, checks en de bestaande indexes voor appointments, breaks, opening hours, services, sessions, users en waiting list.

### `drizzle/0001_grey_brood.sql`

Deze migration maakt `rate_limits` aan met:

- `id` UUID primary key;
- `key`;
- `window_start`;
- `count`;
- `created_at`;
- unieke index op `key` en `window_start`;
- index op `window_start`.

### `drizzle/0002_oval_hitman.sql`

Deze migration maakt actieve whole-day blocks en de bijbehorende datum-indexen aan.

### `drizzle/0003_panoramic_liz_osborn.sql`

Deze migration maakt de singleton `booking_settings`-tabel aan met buffer, cancellation deadline, overlap behavior, confirmation behavior en no-show release behavior.

### `drizzle/0004_unique_wolf_cub.sql`

Deze migration breidt appointments uit met buffer snapshot, no-show slot release, barber override metadata en een nullable barber foreign key voor historische compatibiliteit. Het oude `source`-veld en `appointment_source`-enum worden verwijderd. Bestaande appointments krijgen bij backfill de actuele booking buffer, met `0` als fallback wanneer de settingsrij ontbreekt.

### `drizzle/0007_tense_spectrum.sql`, `0008_owner_backfill.sql`, `0009_owner_profiles.sql`, `0010_single_owner.sql`

Deze owner-only reeks voegt de `owner`-rol toe aan `user_role`, converteert bestaande `staff`-rijen naar `owner`, hernoemt `staff_profiles` naar `owner_profiles` en legt de single-owner garantie vast met `users_single_owner_idx`. De `staff`-waarde blijft in het enum staan als historische compatibiliteit en biedt geen runtime-authorisatie. De unieke index faalt expliciet wanneer er meerdere owner-accounts bestaan, zodat de invariant niet stil wordt overschreven.

### `drizzle/0011_premium_the_liberteens.sql`

Deze migration maakt de Web Push v1-persistentie aan: `push_subscriptions` (koppeling aan wachtrij-entry en optionele klant, uniek endpoint, server-side sleutelmateriaal, active/deactiveer-status), `push_notifications` (logische notificatie met deterministische unieke idempotency key, zonder payload of persoonsgegevens) en `push_notification_deliveries` (delivery per notificatie/subscription-combinatie met begrensde attempt-teller, claim-metadata en foutcategorie). Alle relaties gebruiken foreign keys met `ON DELETE CASCADE`, behalve de optionele klantrelatie (`ON DELETE SET NULL`); pogingen zijn database-begrensd op maximaal drie. De migration bevat uitsluitend de nieuwe tabellen; bestaande tabellen worden niet gewijzigd.

### `drizzle/0012_dazzling_roland_deschain.sql`

Deze migration maakt de persistentie voor interne eigenaar-notificaties aan: `owner_notification_events` (duurzaam gebeurtenisregister met een deterministische unieke `dedup_key`, de ontvanger en de entiteitsverwijzing) en `owner_notifications` (bell-readmodel met titel, tekst en `read_at`). Beide tabellen verwijzen naar `users` met `ON DELETE CASCADE`; `owner_notifications.event_id` verwijst met `ON DELETE CASCADE` naar het gebeurtenisregister. Er zijn database-constraints op `event`, `entity_type` en op de uniciteit van `dedup_key` en `event_id`. De migration bevat uitsluitend de nieuwe tabellen; bestaande tabellen worden niet gewijzigd.

### Metadata

`drizzle/meta/0000_snapshot.json`, `drizzle/meta/0001_snapshot.json` en `drizzle/meta/_journal.json` zijn de bestaande Drizzle metadata/snapshots. Zij horen bij de migrations en mogen niet handmatig worden aangepast om schemawijzigingen te simuleren.

---

## 7. Primary keys en IDs

**CURRENT/DATABASE RULE**

De relevante entiteiten gebruiken UUID primary keys met `defaultRandom()`, vertaald naar PostgreSQL `gen_random_uuid()`:

- users;
- sessions;
- services;
- appointments;
- audit logs;
- opening hours;
- break periods;
- waiting-list entries.

`customer_profiles` en `owner_profiles` gebruiken `user_id` als one-to-one primary key en foreign key. `business_profile` is de uitzondering: die gebruikt een integer ID met default `1` en een singleton check.

Nieuwe relevante entiteiten behouden het UUID-patroon. Sequentiële IDs worden niet toegevoegd zonder expliciete technische reden. Foreign keys moeten type-consistent zijn met de primary key waarnaar zij verwijzen.

---

## 8. Foreign keys

**CURRENT**

- `sessions.user_id` verwijst naar `users.id` met `ON DELETE CASCADE`.
- `customer_profiles.user_id` en `owner_profiles.user_id` verwijzen naar `users.id` met `ON DELETE CASCADE`.
- `appointments.customer_user_id` verwijst nullable naar `users.id` met `ON DELETE SET NULL`.
- `appointments.barber_user_id` verwijst nullable naar `users.id` met `ON DELETE SET NULL`.
- `appointments.service_id` verwijst verplicht naar `services.id` met `ON DELETE RESTRICT`.
- `appointments.created_by_user_id` verwijst nullable naar `users.id` met `ON DELETE SET NULL`.
- `audit_logs.actor_user_id` verwijst nullable naar `users.id` met `ON DELETE SET NULL`.
- `waiting_list_entries.customer_user_id` verwijst nullable naar `users.id` met `ON DELETE SET NULL`.
- `waiting_list_entries.service_id` verwijst verplicht naar `services.id` met `ON DELETE RESTRICT`.
- `waiting_list_entries.created_by_user_id` verwijst nullable naar `users.id` met `ON DELETE SET NULL`.

**DATABASE RULE**

Relaties die onderdeel zijn van domeinintegriteit worden waar mogelijk ook door PostgreSQL afgedwongen. `NOT NULL`, nullable foreign keys en deletegedrag moeten bewust worden gekozen. Application-only checks zijn onvoldoende wanneer een relatie ook door andere writes of processen kan worden geschonden.

Bestaande foreign keys worden niet door dit document gewijzigd.

---

## 9. Constraints en integrity boundary

**DATABASE RULE**

Databaseconstraints zijn onderdeel van de integrity boundary naast server-side domain logic. Gebruik waar passend:

- `NOT NULL` voor vereiste waarden;
- `CHECK` voor geldige ranges en combinaties;
- `UNIQUE`/unique indexes voor uniciteit;
- foreign keys voor referential integrity;
- indexes voor aantoonbare querypatronen;
- exclusion constraints wanneer tijdsinterval-integriteit dat vereist.

Essentiële data-integriteit mag niet uitsluitend in React of TypeScript bestaan. Een databaseconstraint vervangt echter geen authorization of volledige business workflow.

---

## 10. Services

**CURRENT**

De tabel `services` bevat:

- `id` UUID primary key;
- `name` verplicht;
- `description` verplicht;
- `duration_minutes` verplicht;
- `price_cents` verplicht;
- `active` verplicht met default `true`;
- `archived_at` nullable;
- `created_at` en `updated_at` met timezone.

Bestaande constraints:

- `price_cents >= 0`;
- `duration_minutes > 0`;
- `archived_at IS NULL OR active = false`.

De bestaande index `services_active_idx` ondersteunt filtering op `active` en `archived_at`.

**DATABASE RULE**

Archiveren/deactiveren is het normale mechanisme. Services worden niet destructief verwijderd wanneer historische appointments ernaar verwijzen. De bestaande `ON DELETE RESTRICT`-foreign key ondersteunt dat behoud. Product- en beheerregels bepalen wanneer een service actief mag worden gebruikt.

---

## 11. Appointment persistence

**CURRENT**

De tabel `appointments` bevat:

- `id` UUID primary key;
- nullable `customer_user_id`;
- nullable guest name, phone en email;
- verplicht `service_id`;
- `service_name_snapshot`;
- `price_cents_snapshot`;
- `duration_minutes_snapshot`;
- `buffer_minutes_at_booking`;
- `starts_at` en `ends_at`;
- `status`;
- nullable `barber_user_id`;
- `note`;
- nullable `created_by_user_id`;
- `cancelled_at` en `completed_at`;
- `slot_released_at`;
- `override_opening_hours`, `override_break` en `override_whole_day_block`;
- `created_at` en `updated_at`.

De status gebruikt het PostgreSQL enum `appointment_status`: `new`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`. Het oude `source`-enum is in migration 0004 verwijderd.

### Current service data versus historical snapshot

`services` bevat de actuele naam, prijs, duur en active/archive-status. Bij het aanmaken van een appointment worden service name, price en duration afzonderlijk in de appointment opgeslagen.

**DATABASE RULE**

Historische afspraakgegevens worden uit de appointment snapshots en buffer snapshot gelezen. `services.price_cents` is niet de historische prijs van een bestaande appointment. Latere servicewijzigingen of booking-settingswijzigingen mogen de snapshots niet aanpassen.

---

## 12. Service snapshots

**DATABASE RULE**

Een appointment persistence workflow moet minimaal deze waarden als snapshot opslaan:

- service name;
- price;
- duration.

De snapshot wordt gemaakt binnen dezelfde consistente create/update-workflow als de appointment. Een service moet bij een nieuwe customer booking actief en geldig zijn; de exacte businessregels komen uit `BUSINESS_RULES.md`.

Een service foreign key blijft belangrijk voor referentie naar de actuele service, maar mag niet worden gebruikt om historische snapshotwaarden opnieuw te berekenen.

---

## 13. Money

**CURRENT**

Prijzen worden opgeslagen in integer cents:

- `services.price_cents`;
- `appointments.price_cents_snapshot`.

Beide hebben een databasecheck dat de waarde niet negatief is.

**DATABASE RULE**

- Gebruik integer cents voor geld.
- Gebruik geen floating point voor geldbedragen.
- Format bedragen buiten de database, in de toepassingslaag/UI.
- Bewaar de appointment price snapshot onafhankelijk van actuele serviceprijs.

---

## 14. Time en timezone

**CURRENT**

Appointment-, session-, profile-, business-, break-, audit- en rate-limit-timestamps gebruiken PostgreSQL `timestamp with time zone`. `opening_hours` gebruikt PostgreSQL `time`; `waiting_list_entries.queue_date` gebruikt PostgreSQL `date`.

`business_profile.timezone` heeft default en check `Europe/Amsterdam`.

**DATABASE RULE**

- Appointments worden timezone-aware opgeslagen.
- Availability en business dates worden geïnterpreteerd in `Europe/Amsterdam`.
- UTC/timestamp-representatie mag de business timezone-context niet verliezen.
- Zomer-/wintertijd, DST transitions en lokale datumgrenzen worden expliciet behandeld.
- De server timezone is nooit impliciet de business timezone.

De huidige database legt de business timezone vast, maar de appointment/availability workflow die deze correct toepast bestaat nog niet volledig.

---

## 15. Opening hours

**CURRENT**

`opening_hours` bevat:

- `id` UUID primary key;
- `weekday` als `smallint`;
- `is_open`;
- nullable `opening_time` en `closing_time`;
- `created_at` en `updated_at`.

Constraints en indexes:

- unieke index op `weekday`;
- `weekday BETWEEN 0 AND 6`;
- wanneer open moeten beide tijden bestaan;
- wanneer open moet opening time vóór closing time liggen.

Dit ondersteunt één openingstijdblok per weekdag, conform de huidige business rules. Er is geen persistence voor meerdere blokken per dag vastgesteld.

---

## 16. Break periods

**CURRENT**

`break_periods` bevat:

- `id` UUID primary key;
- `starts_at`;
- `ends_at`;
- nullable `note`;
- `active` met default `true`;
- `created_at` en `updated_at`.

De database controleert `starts_at < ends_at` en heeft een index op `starts_at`.

**DATABASE RULE**

Actieve break periods worden door availability als geblokkeerde intervallen behandeld wanneer de business workflow wordt gebouwd. Pauzes worden niet als hardcoded tijden in de booking-engine opgeslagen.

---

## 17. Whole-day blocks

**CURRENT**

`whole_day_blocks` bevat tijdelijke blokkades voor volledige dagen met een actieve-datum unique index.

---

## 18. Configurable settings

**CURRENT**

De huidige `booking_settings`-singleton bevat persistence voor de volgende barber-configureerbare instellingen:

- buffer;
- cancellation deadline (24 uur);
- buiten normale beschikbaarheid boeken;
- overlap behavior;
- no-show behavior (persistent, maar functioneel inert: een `no_show` geeft het tijdslot altijd automatisch vrij conform `BUSINESS_RULES.md` §17);
- availability override behavior.

`business_profile`, `opening_hours`, `break_periods`, `whole_day_blocks` en `booking_settings` vormen de settings-basis.

**DATABASE RULE**

Nieuwe configuratie moet persistent, server-side valideerbaar en waar relevant auditbaar zijn. De database mag geen standaardwaarden verzinnen voor open beslissingen. Het bookinginterval staat vast op 15 minuten en wordt niet als configureerbare databasekolom opgeslagen; er wordt dus geen `slot_interval`-kolom toegevoegd. Geen onnodige `booking_horizon_days`-kolom toevoegen voor een onbeperkte horizon.

---

## 19. Business profile

**CURRENT**

`business_profile` bevat:

- integer `id` met default `1`;
- naam;
- adres;
- telefoonnummer;
- timezone;
- `created_at` en `updated_at`.

De singleton check vereist `id = 1`. De timezone check vereist `Europe/Amsterdam`.

`opening_hours` is een afzonderlijke tabel met één unieke rij per weekday. Er is geen foreign key nodig voor die relatie met de singleton; de business profile is de context waarin de opening hours worden gebruikt.

---

## 20. Audit logs

**CURRENT**

`audit_logs` bevat:

- UUID `id`;
- nullable `actor_user_id` met `ON DELETE SET NULL`;
- `action`;
- `entity_type`;
- nullable `entity_id`;
- nullable JSONB `metadata`;
- nullable `ip_hash`;
- nullable `user_agent`;
- timezone-aware `created_at`.

De bestaande auth-auditcode schrijft auth events server-side naar deze tabel.

**DATABASE RULE**

Audit logs zijn historische records en geen normale mutable business data. Relevante auth events, instellingen, appointment status changes en andere gevoelige beheeracties worden server-side geaudit wanneer de betreffende workflows bestaan. Verwijderen of muteren van auditgeschiedenis is geen normale business update.

---

## 21. Rate limits

**CURRENT**

`rate_limits` bevat:

- UUID `id`;
- gehashte `key`;
- timezone-aware `window_start`;
- integer `count`;
- `created_at`.

Er is een unieke index op `key` en `window_start` en een index op `window_start`. De auth rate-limitcode gebruikt een database-backed fixed window en verhoogt de count met een upsert.

Een cleanupfunctie verwijdert records vóór een cutoff, maar er is momenteel geen automatische of geplande cleanup-call vastgesteld.

**DATABASE RULE**

Rate-limit persistence ondersteunt abuse prevention voor authentication en andere gevoelige publieke flows. Nieuwe publieke mutations worden op rate-limitbehoefte beoordeeld. Er worden geen claims gedaan over automatische cleanup zolang die niet bestaat.

---

## 22. Appointment overlap

Een appointment-conflict wordt bepaald door interval overlap:

```text
existing.starts_at < requested.ends_at
AND
existing.ends_at > requested.starts_at
```

**DATABASE RULE**

Een application-level availability check is niet voldoende tegen concurrente writes. Dit scenario moet worden voorkomen:

```text
Transaction A: check → free
Transaction B: check → free
Transaction A: insert
Transaction B: insert
```

Een simpele `SELECT FOR UPDATE` op bestaande appointments is geen volledige oplossing wanneer er nog geen conflicterende row bestaat.

Appointment concurrency moet database- of transactioneel worden beschermd wanneer overlap niet is toegestaan. Een PostgreSQL-native oplossing, zoals een exclusion constraint op een tijdsrange, kan worden onderzocht wanneer appointment persistence wordt gebouwd. Dit document kiest die concrete implementatie nog niet.

De huidige schema’s gebruiken geen exclusion constraint. Appointment creation gebruikt transaction-level PostgreSQL advisory locking per barber plus een transactionele overlapquery en insert.

---

## 23. Overlap override

De business rules staan toe dat de barber configureert of overlap is toegestaan.

**DATABASE RULE**

Wanneer overlap is toegestaan:

- detecteert de applicatie het conflict;
- krijgt de barber een waarschuwing;
- is expliciete bevestiging vereist;
- wordt geen conflict stilzwijgend aangemaakt.

Wanneer overlap niet is toegestaan, moet database-/transactionele integriteit concurrente writes blokkeren. De database mag de ingestelde business rule niet stilzwijgend omzeilen.

De huidige database bevat nog geen persistence voor de overlapconfiguratie en geen overlapconstraint.

---

## 24. Transactions

**DATABASE RULE**

Transacties zijn verplicht wanneer meerdere databasewrites samen één business operation vormen.

Voor appointment create/update moet de workflow als één consistente operatie worden ontworpen rond:

- relevante configuratie;
- service en snapshotwaarden;
- availability/conflict handling;
- appointment insert of update.

De concrete transactionele implementatie wordt later gekozen. Een losse read gevolgd door een onafhankelijke write is niet voldoende voor concurrencygevoelige appointment operations.

---

## 25. Guest appointments

**CURRENT**

`appointments.customer_user_id` is nullable. Guest identity bestaat uit `guest_name`, `guest_phone` en nullable `guest_email`.

De `appointments_party_check` vereist:

- óf een `customer_user_id`;
- óf zowel `guest_name` als `guest_phone`.

De service foreign key blijft verplicht. Guest appointments worden dus niet zonder service opgeslagen.

**DATABASE RULE**

Guest booking mag geen toegang tot andere appointments geven. Database ownership alleen is hiervoor niet voldoende; authorization blijft server-side. De applicatie moet guest access expliciet binden aan de gegevens en context van de betreffende booking.

Dezelfde guest/customer party-check bestaat in `waiting_list_entries`.

---

## 26. Data lifecycle

### Services

**DATABASE RULE**

Archive/deactivate is de standaard. `ON DELETE RESTRICT` op appointments voorkomt destructief verwijderen van een service waarnaar afspraken verwijzen.

### Appointments

Historische records en snapshots blijven behouden. Annulering verandert de status/lifecycle maar verwijdert de historische afspraak niet.

### Users

Users worden niet destructief verwijderd wanneer dat historische relaties beschadigt. De bestaande nullable appointment-, creator- en auditrelaties gebruiken `ON DELETE SET NULL`; sessions en profielen gebruiken `ON DELETE CASCADE`.

### Audit logs

Audit logs worden historisch behouden en zijn geen normale mutable business data.

---

## 27. Indexing

**CURRENT**

De bestaande indexes ondersteunen onder andere:

- appointments op `starts_at, status`;
- appointments op `service_id, starts_at`;
- appointments op `customer_user_id, starts_at`;
- appointments op `ends_at`;
- break periods op `starts_at`;
- opening hours uniek op weekday;
- services op `active, archived_at`;
- sessions op token hash, user ID en expiry;
- users uniek op email;
- waiting list op queue date/join time en queue date/status;
- actieve customer waiting-list uniqueness per date;
- rate limits uniek op key/window en op window start.

**DATABASE RULE**

Nieuwe indexes worden gemotiveerd door daadwerkelijke query patterns. Voor availability/appointment queries worden minimaal `starts_at` en `ends_at` relevant meegenomen; voor customer history `customer_user_id` met tijd; voor service/date queries `service_id` met starttijd. Er worden geen theoretische indexes toegevoegd zonder querybehoefte.

---

## 28. Soft delete en archive

Archiveren/deactiveren en hard delete zijn verschillende operaties.

**CURRENT**

Services hebben `active` en `archived_at`, met een check dat een gearchiveerde service niet actief is. Er is geen generiek soft-delete patroon voor alle tabellen vastgesteld.

**DATABASE RULE**

Gebruik voor services archive/deactivate als standaard. Verwijder geen actuele service wanneer daardoor historische appointment data of referentiële integriteit verloren gaat. Voeg geen generiek soft-delete model toe zonder concrete requirement.

---

## 29. Database versus business logic

### Database responsibility

- referential integrity;
- constraints en valid ranges;
- uniqueness;
- persistence;
- database-level concurrency guarantees;
- historische opslag van snapshots.

### Service/domain responsibility

- business workflows;
- authorization;
- availability calculation;
- buffer en andere configuratie interpreteren;
- appointment lifecycle;
- expliciete barber overrides;
- keuze en uitvoering van transactionele workflows.

### UI responsibility

- presentatie;
- formulier-UX;
- lokale feedback.

Geen laag neemt stilzwijgend de verantwoordelijkheid van een andere laag over. Databaseconstraints vervangen geen server-side authorization; clientvalidatie vervangt geen database-integriteit.

---

## 30. Seed data

**CURRENT**

`src/db/seed.ts` is een handmatig script dat via `client.server.ts` schrijft naar de database. Het bevat duidelijk gemarkeerde development placeholders voor:

- business profile;
- opening hours;
- drie development services.

Het script maakt bewust geen owner- of placeholder-owneraccount aan: de eigenaar wordt éénmalig via `npm run auth:create-owner` aangemaakt en mag niet worden overschreven door seed data.

Het script gebruikt `onConflictDoNothing()` en maakt geen bruikbaar production password of production user aan. Er is geen npm seedscript in `package.json` vastgesteld.

**DATABASE RULE**

Seed data is ontwikkel-/testdata tenzij expliciet anders bepaald. Productiegegevens mogen niet afhankelijk zijn van `mockData.ts` of development seed placeholders. Placeholder-adres, opening hours, services en prijzen moeten vóór productie worden vervangen door bevestigde data; de eigenaar is geen seedplaceholder maar een aangemaakt account.

---

## 31. Transitional database gaps

De volgende databasecapaciteiten of persistence-workflows zijn momenteel **MISSING/FUTURE**:

- appointment update/cancel persistence workflow;
- server-side availability calculation en conflict enforcement;
- volledige lifecycle-mutatie en no-show release workflow;
- server-side service CRUD;
- server-side business settings beheer;
- opening-hours/break beheerworkflow;
- customer appointment retrieval en wijzigingen;
- customer cancellation requests;
- persistent waiting-list operations.

De bestaande schema’s bieden hiervoor gedeeltelijk een basis, maar de bijbehorende domain services en mutations bestaan nog niet. Deze lijst beschrijft geen nieuwe productregels en vult open beslissingen niet in.

---

## 32. Open decisions

De database moet de volgende open beslissingen kunnen ondersteunen zonder zelf waarden te definiëren:

1. notification events buiten Web Push v1 (§28) en Eigenaar-notificaties v1 (§29);
2. notification preferences buiten de vastgelegde opt-ins en instellingen;
3. failed delivery/retry behavior voor die toekomstige events.

Deze waarden zijn nog niet definitief. Er worden in schema, seed data of constraints geen concrete standaardwaarden voor deze beslissingen verzonnen.

---

## 33. Database development rules

1. Lees eerst `PRODUCT_REQUIREMENTS.md`.
2. Lees daarna `BUSINESS_RULES.md`.
3. Lees daarna `ARCHITECTURE.md`.
4. Wijzig schema’s via Drizzle.
5. Maak nieuwe migrations voor nieuwe schemawijzigingen.
6. Herschrijf geen oude migrations.
7. Houd databasecode server-only.
8. Gebruik databaseconstraints voor data-integriteit.
9. Gebruik transacties voor multi-step business operations.
10. Bescherm appointment writes tegen concurrency.
11. Bewaar historische appointment snapshots.
12. Gebruik geen floating point voor geld.
13. Gebruik timezone-aware timestamps voor afspraken.
14. Hardcode geen configureerbare business rules.
15. Introduceer geen multi-barber databaseconcepten zonder expliciete requirement.
16. Verwijder historische data niet alleen omdat actuele configuratie gewijzigd is.
17. Controleer migrations met `npm run db:check` en inspecteer gegenereerde SQL voordat deze wordt toegepast.

---

## 34. Push subscriptions en device registrations

**CURRENT**

De database ondersteunt persistentie voor Web Push v1 via drie tabellen in `src/db/schema/push-subscriptions.ts` (migration `0011_premium_the_liberteens.sql`):

- `push_subscriptions`: koppeling aan één wachtrijvermelding (`queue_entry_id`, `ON DELETE CASCADE`) en optioneel aan een ingelogde klant (`customer_user_id`, `ON DELETE SET NULL`); uniek endpoint; server-side `p256dh_key` en `auth_key`; `active`-status met deactiveer-timestamp en reden; meerdere subscriptions per entry zijn toegestaan; gasten worden via de entry-koppeling ondersteund.
- `push_notifications`: één logische notificatie per queue-overgang met deterministische unieke `idempotency_key`; status (`pending`, `sending`, `sent`, `failed`, `expired`, `invalid`); geen payload, persoonsgegevens of secrets.
- `push_notification_deliveries`: één delivery per notificatie/subscription-combinatie (uniek); status, pogingenteller database-begrensd op maximaal drie, `next_attempt_at`, foutcategorie, `claim_token` en `claimed_at` voor fencing; index op status en volgende poging voor dispatch en stale recovery.

Gevoelige subscriptiongegevens blijven server-side. Credentials en secrets worden nooit client-side opgeslagen. Invalid subscriptions worden gedeactiveerd. Verzendregistraties worden maximaal 30 dagen bewaard conform `BUSINESS_RULES.md` §28; opschoning volgt via het afgesproken cleanup-proces.

---

## 35. Interne eigenaar-notificaties

**CURRENT**

De database ondersteunt interne eigenaar-notificaties via twee tabellen in `src/db/schema/owner-notifications.ts` (migration `0012_dazzling_roland_deschain.sql`):

- `owner_notification_events`: het duurzame gebeurtenisregister. Per gebeurtenis één rij met een deterministische unieke `dedup_key` (event plus entiteits-id), de ontvanger (`recipient_user_id`) en de entiteitsverwijzing (`entity_type` en `entity_id`). Dit register bevat geen weergavetekst en geen persoonsgegevens en wordt niet op leeftijd verwijderd, zodat een herhaalde verwerking van dezelfde gebeurtenis ook na het opruimen van oude meldingen een duplicaat blijft herkennen.
- `owner_notifications`: het bell-readmodel met titel, tekst, `read_at` en timestamps. Per gebeurtenis is er hoogstens één melding (`event_id` uniek). Een geregistreerd gebeurtenis zonder meldingsrij is een gebeurtenis dat nog hersteld moet worden.

Beide tabellen verwijzen naar `users` met `ON DELETE CASCADE`; `owner_notifications.event_id` verwijst met `ON DELETE CASCADE` naar het gebeurtenisregister. Er zijn `CHECK`-constraints op `event` en `entity_type`, en indexen voor de teller plus lijst (`recipient_user_id`, `read_at`, `created_at`) en voor de opschoning (`created_at`).

**DATABASE RULE**

De bewaartermijn van interne meldingen is 30 dagen, ongeacht of ze gelezen zijn, en is niet instelbaar (`BUSINESS_RULES.md` §29). Opruiming verwijdert uitsluitend rijen uit `owner_notifications`; het gebeurtenisregister blijft intact. Er worden geen payload-, secret-, capability- of pushvelden opgeslagen.

---

## 36. Pushabonnementen en verzendregistraties voor de eigenaar

**CURRENT**

De database ondersteunt pushmeldingen voor de eigenaar (`BUSINESS_RULES.md` §29) via twee tabellen in `src/db/schema/owner-push-subscriptions.ts` (migratie `0013_lyrical_luminals.sql`):

- `owner_push_subscriptions`: één abonnement per apparaat van de eigenaar (`owner_user_id`, `ON DELETE CASCADE` naar `users`); het endpoint is de apparaatidentiteit en is uniek; server-side `p256dh_key` en `auth_key`; `active`-status met deactiveer-timestamp en reden (`opt_out`, `invalid`, `expired`, `replaced`); meerdere apparaten per eigenaar zijn toegestaan en worden onafhankelijk van elkaar geschakeld.
- `owner_push_deliveries`: één delivery per combinatie van gebeurtenis en abonnement (`event_id` → `owner_notification_events` en `subscription_id` → `owner_push_subscriptions`, beide `ON DELETE CASCADE`); status (`pending`, `sending`, `sent`, `failed`, `expired`, `invalid`); pogingenteller database-begrensd op maximaal drie; `next_attempt_at`; foutcategorie; `claim_token` en `claimed_at` voor fencing; index op status en volgende poging voor dispatch en stale recovery.

De pushintentie is het duurzame gebeurtenisregister van §35; er is geen aparte intent-tabel. De ontdubbeling zit in de unieke combinatie `event_id` + `subscription_id`.

Deze tabellen zijn gescheiden van de klantenpush (§34): de klanttabellen zijn queue-entry-gebonden (`queue_entry_id` NOT NULL) en kunnen niet voor eigenaarpush worden gebruikt.

**DATABASE RULE**

Verzendregistraties van eigenaarpush volgen het gebruik, niet een vaste termijn: deliveries met een eindstatus waarvan de gebeurtenis buiten het verzendvenster ligt, worden opgeschoond, en inactieve abonnementen worden opgeschoond zodra ze niet meer nodig zijn voor verzending. Actieve, geldige abonnementen worden bewaard zolang ze nodig zijn voor verzending. Er worden geen payload-, secret-, capability- of klantgegevens opgeslagen; de endpoints en sleutels blijven server-side.
