# Centro Kapper — Architecture

**Document:** Technical Architecture  
**Versie:** 1.0  
**Status:** Living Document / Source of Truth  
**Project:** Centro Kapper  
**Laatste update:** 2026-09-03

## Current Owner Model

De actuele productbeslissing gebruikt uitsluitend de rollen `owner`, `customer` en guest capability. De historische `staff`-waarde blijft alleen tijdelijk in het database-enum voor migratie van oude rijen en is geen runtime-authorisatie of productrol.

---

## 1. Doel en statuslabels

Dit document beschrijft de werkelijke huidige architectuur van Centro Kapper en de technische regels voor toekomstige ontwikkeling. Claims over de huidige implementatie zijn gebaseerd op de repository, `PRODUCT_REQUIREMENTS.md`, `BUSINESS_RULES.md`, het Drizzle-schema en de bestaande auth-code.

De applicatie is functioneel single-barber:

- er is een customer;
- er is één barber/beheerder.

De technische rolbenamingen zijn `customer` en `owner`. Er wordt geen multi-barber scheduling-, assignment- of staff-availabilitymodel toegevoegd zonder expliciete requirement.

### 1.1 Owner-only runtime

**CURRENT**

De owner-only beslissing is server-side afgedwongen, niet alleen benoemd in de UI:

- `users.role = 'owner'` is database-gedwongen uniek via `users_single_owner_idx` (migration `0010_single_owner.sql`);
- `createInitialOwnerAccount()` weigert een tweede eigenaar en is transactioneel; provisioning verloopt uitsluitend via `scripts/create-owner.ts` (`npm run auth:create-owner`);
- appointment- en queue-lifecyclemutaties werken met een owner actor (`kind: 'owner'`), niet met een staff actor;
- `resolveSingleBarber()` selecteert de actieve `owner`-gebruiker als capaciteits-eigenaar;
- legacy `staff`-rijen authenticeren niet: `toSafeUser()` en `login()` negeren de `staff`-rol;
- de owner-navigatie is `Dashboard / Afspraken / Wachtrij / Profiel`, waarbij `/owner/profile` een compacte profielhub is (eigenaaraccount, profiel bewerken, logout en navigatie-cards naar `/owner`, `/owner/appointments`, `/owner/queue` en `/owner/settings`); salon-, boekings-, openingsuur-, pauze/blokkade- en dienstenbeheer (`OwnerSettingsSections`) bestaan uitsluitend op `/owner/settings`;
- de customer- en gastenfunctionaliteit blijft multi-account: er kunnen meerdere `customer`-accounts bestaan.

**ARCHITECTURE RULE**

Nieuwe code introduceert geen staff-, employee- of multi-barberconcept, gebruikt geen `requireStaff()` en legt geen tweede eigenaar aan. Historische benamingen (`barber_user_id`, `.staff-nav`, `user_role`-enumwaarde `staff`) blijven alleen bestaan als compatibiliteits-/CSS-legacy zonder autorisatie te bieden.

In dit document betekenen de labels:

- **CURRENT:** daadwerkelijk aanwezig in de repository;
- **ARCHITECTURE RULE:** technische regel waaraan nieuwe code moet voldoen;
- **FUTURE/TRANSITION:** gewenst of noodzakelijk vervolg dat nog niet als huidige functionaliteit bestaat.

---

## 2. Architectuurprincipes

### 2.1 Veiligheid en serverautoriteit

**ARCHITECTURE RULE**

De server is de uiteindelijke autoriteit voor:

- authenticatie en autorisatie;
- ownership van klantgegevens en afspraken;
- beschikbaarheid en volledige serviceduur;
- afspraakconflicten en concurrency;
- prijzen en serviceduur;
- booking rules;
- status transitions;
- historische snapshots;
- overige data-integriteitsregels.

Frontend-validatie en UI visibility zijn uitsluitend aanvullende UX-mechanismen.

### 2.2 Scheiding van verantwoordelijkheden

**ARCHITECTURE RULE**

Client-code presenteert de applicatie en vraagt serverfunctionaliteit aan. Server-code valideert, autoriseert en voert domeinacties uit. Databaseconstraints vormen een tweede integriteitslaag naast applicatielogica.

### 2.3 Onderhoudbaarheid en eenvoud

**ARCHITECTURE RULE**

Nieuwe code sluit aan op TanStack Start, TypeScript, de bestaande UI en de bestaande server-only conventies. Business rules worden niet verspreid over React components. Er worden geen nieuwe libraries of multi-barber abstractions toegevoegd zonder concrete requirement.

---

## 3. Technology stack

**CURRENT**

- React en React DOM (`latest` in `package.json`);
- TanStack Start `^1.168.49`;
- TanStack Router via `@tanstack/react-router` `^1.170.32`;
- TypeScript (`latest`);
- Vite (`latest`);
- Drizzle ORM `^0.45.2`;
- Drizzle Kit `^0.31.10`;
- Neon PostgreSQL via `@neondatabase/serverless` `^1.1.0`;
- Zod `^4.5.4`;
- Argon2id via `@node-rs/argon2` `^2.2.0`;
- npm met `package-lock.json`;
- `lucide-react` voor iconen.

Scripts in `package.json` zijn `dev`, `build`, `test`, `test:watch`, `lint`, `typecheck`, `preview`, `db:check`, `db:generate` en `auth:create-owner`. Er is geen migratie-toepasscript of production-startscript in `package.json`. Staff provisioning (`create-staff.ts`) is verwijderd.

**ARCHITECTURE RULE**

De lockfile wordt gebruikt voor reproduceerbare installaties. Nieuwe afhankelijkheden mogen alleen worden toegevoegd wanneer de bestaande stack en productrequirements dat vereisen.

---

## 4. Application structure

**CURRENT**

```text
src/
  App.tsx
  main.tsx
  start.ts
  router.tsx
  routeTree.gen.ts
  routes/
  pages/
  components/
  auth/
  data/
  db/
    client.server.ts
    schema/
    seed.ts
  styles/
  assets/
drizzle/
scripts/
```

De huidige verantwoordelijkheden zijn:

- `src/routes/`: file-based TanStack Router route definitions en layouts;
- `src/pages/`: pagina-UI die door routes wordt gerenderd;
- `src/components/`: herbruikbare presentatie- en navigatiecomponenten;
- `src/auth/`: auth, sessies, authorization helpers, auth Server Functions en tijdelijke React contexts;
- `src/db/`: server-only databaseclient, Drizzle schema’s, seed en README;
- `src/data/mockData.ts`: hardcoded demo-data;
- `src/styles/`: globale styling en theme;
- `drizzle/`: gegenereerde SQL migrations en metadata;
- `scripts/`: operationele scripts, momenteel `create-owner.ts` (éénmalige aanmaak van de eigenaar).

`src/App.tsx` en `src/main.tsx` zijn overgangs-placeholders; routing en providers lopen via TanStack Start en `src/routes/__root.tsx`.

**ARCHITECTURE RULE**

Een gewenste toekomstige `domain`, `services` of `repositories` directory wordt niet als bestaande structuur beschouwd. Wanneer die laag wordt ingevoerd, moet zij de client/server-boundary respecteren en niet leiden tot duplicatie van business rules in pages of components.

---

## 5. TanStack Start en routing

### 5.1 Huidige routing

**CURRENT**

`src/router.tsx` gebruikt de gegenereerde `routeTree`, scroll restoration en intent preloading. `src/routes/__root.tsx` rendert de HTML-documentstructuur, metadata en `Scripts`, importeert `theme.css` en mount `AuthProvider`, `AppointmentProvider` en `WaitingListProvider`.

De huidige routes zijn:

- publiek: `/`, `/login`, `/create-account`;
- customer: `/home`, `/booking`, `/bookings`, `/queue`, `/profile`;
- owner: `/owner`, `/owner/appointments`, `/owner/queue`, `/owner/profile`, `/owner/settings`.

`src/routes/_customer.tsx` en `src/routes/_owner.tsx` zijn pathless layouts. Zij roepen in een server loader `getCurrentUserFn()` aan, redirecten op basis van de rol en renderen daarnaast een client-side `RequireAuth` guard.

`/` redirect momenteel altijd naar `/home`. Omdat `/home` onder `_customer` valt, is de huidige home niet publiek toegankelijk.

### 5.2 Routebeveiliging

**ARCHITECTURE RULE**

Route loaders en guards verbeteren navigatie en UX, maar vormen geen volledige security boundary. Iedere Server Function die data leest of wijzigt, voert zelf authenticatie, autorisatie en ownership checks uit. Verborgen routes, knoppen of links mogen nooit als beveiliging worden beschouwd.

---

## 6. Client/server boundary

### Client

**ARCHITECTURE RULE**

Client-code is verantwoordelijk voor:

- rendering en presentatie;
- interactie en formulier-UX;
- lokale validatie voor feedback;
- loading-, error- en empty states;
- navigatie;
- het tonen van serverresultaten.

Client-code mag niet de definitieve beschikbaarheid, prijs, duur, autorisatie, statusovergang of integriteit bepalen.

### Server

**CURRENT/ARCHITECTURE RULE**

Server-code is verantwoordelijk voor:

- database access;
- authenticatie en sessiebeheer;
- autorisatie en ownership;
- business rules;
- availability calculation;
- appointment mutations en transacties;
- gevoelige configuratie;
- audit logging;
- rate limiting;
- CSRF-afhandeling.

Databasecode mag uitsluitend server-side worden geïmporteerd. Bestaande `.server.ts` conventies, waaronder `client.server.ts`, `session.server.ts`, `password.server.ts`, `audit.server.ts` en `rate-limit.server.ts`, moeten worden aangehouden.

---

## 7. Server Functions

**CURRENT**

De Server Functions staan in `src/auth/auth.functions.ts`, `src/settings/settings.functions.ts`, `src/appointments/appointment.functions.ts` en `src/queue/queue.functions.ts`:

- `registerCustomerFn`;
- `loginFn`;
- `logoutFn`;
- `getCurrentUserFn`;
- `refreshSessionFn`.

Server Functions voor appointment creation, retrieval, listing en lifecycle, owner settings en de queue-boundary bestaan. Services CRUD en availability Server Functions bestaan nog niet.

**ARCHITECTURE RULE**

Iedere Server Function is een zelfstandige server-side security boundary en volgt deze volgorde:

1. externe input valideren met Zod;
2. authenticatie vaststellen wanneer nodig;
3. autorisatie en ownership controleren;
4. domain/service logic aanroepen;
5. database-operatie transactioneel uitvoeren waar nodig;
6. alleen veilige response-data retourneren;
7. fouten gecontroleerd en zonder gevoelige details afhandelen.

Een mutation mag nooit uitsluitend op route guards, UI visibility of client-side checks vertrouwen.

---

## 8. Authentication

### 8.1 Authentication versus authorization

Authentication beantwoordt de vraag wie de gebruiker is. Authorization bepaalt of die gebruiker de gevraagde actie op de betreffende data mag uitvoeren. Beide controles horen server-side plaats te vinden.

### 8.2 Bestaande implementatie

**CURRENT**

- Wachtwoorden worden met Argon2id gehasht via `@node-rs/argon2`.
- De huidige parameters zijn algorithm `2`, memory cost `19_456`, time cost `2` en parallelism `1`.
- Registratie valideert het wachtwoord client-side en opnieuw in de server-function validator via `registerCustomerSchema`.
- Validatiefouten worden als Nederlandse `AuthError`-melding teruggegeven, niet als ruwe Zod-fouten.
- Sessies zijn database-backed.
- Een random token van 32 bytes wordt base64url-gecodeerd.
- Alleen de SHA-256 hash van het sessietoken wordt opgeslagen.
- De cookie heet `ck_session`.
- De cookie is `HttpOnly`, `SameSite=Lax`, heeft path `/` en is `Secure` in production.
- Customer sessions hebben een lifetime van 30 dagen.
- Owner sessions hebben een lifetime van 7 dagen (customer sessions 30 dagen).
- Refresh is begrensd op 90 dagen vanaf het aanmaken van de sessie.
- Verlopen en ingetrokken sessies worden server-side gecontroleerd.
- Refresh roteert het token en trekt het vorige token in.
- Login, registratie, logout en relevante auth events worden geaudit.

`refreshSessionFn` bestaat, maar wordt momenteel niet aangeroepen door `AuthContext` of een route. De refresh-functionaliteit is dus geïmplementeerd maar niet volledig geïntegreerd.

### 8.3 Bestaande helpers

**CURRENT**

`src/auth/authorization.ts` bevat:

- `requireAuthenticatedUser()`;
- `requireCustomer()`;
- `requireOwner()`;
- `requireOwnership()`.

`requireStaff()` is verwijderd; owner-only authorisatie gebeurt uitsluitend via `requireOwner()`.

Deze helpers zijn de basis voor toekomstige domeinmutaties. De bestaande `authMiddleware` in `src/auth/middleware.ts` is momenteel niet aan Server Functions gekoppeld.

---

## 9. Authorization

**ARCHITECTURE RULE**

- Een customer mag alleen eigen customer-data beheren.
- Een customer mag alleen eigen afspraken lezen, wijzigen of annuleren volgens `BUSINESS_RULES.md`.
- Een guest krijgt geen ongecontroleerde toegang tot bestaande customer appointments.
- De eigenaar mag relevante salon- en afspraakdata beheren volgens de business rules.
- Owner-only mutations vereisen server-side `requireOwner()`; appointment- en queue-lifecyclemutaties vereisen de owner actor (`requireOwnerMutationActor()` / `requireOwnerQueueActor()`).
- Ownership wordt server-side gecontroleerd met de relevante identity, niet met een client-aangeleverd customer ID.

> UI visibility is geen authorization mechanism.

---

## 10. Database architecture

### 10.1 Huidige basis

**CURRENT**

De database gebruikt Neon PostgreSQL en Drizzle ORM. `src/db/schema/index.ts` is het schema-entrypoint. `src/db/client.server.ts` maakt de server-only databaseclient op basis van `DATABASE_URL`.

De schema’s bevatten UUID primary keys, foreign keys, constraints, indexes en timestamps. De business profile is een singleton met een databaseconstraint op ID `1`. De timezone van dat profiel is database-side beperkt tot `Europe/Amsterdam`.

### 10.2 Tabellen en integriteit

De huidige schema’s bevatten:

- `users` en `sessions`;
- `customer_profiles` en `owner_profiles` (historische tablenaam `staff_profiles` is hernoemd in migration `0009_owner_profiles.sql`);
- `services`;
- `appointments`;
- `business_profile`, `opening_hours` en `break_periods`;
- `waiting_list_entries`;
- `audit_logs`;
- `rate_limits`;
- `owner_notification_events` en `owner_notifications` (interne eigenaar-notificaties, zie §37).

Belangrijke bestaande databasebescherming:

- unieke emailindex en unieke session token hash;
- foreign keys met passende cascade/set-null/restrict-acties;
- prijs niet-negatief;
- serviceduur positief;
- start voor eind;
- actieve/guest/customer identity checks voor appointments;
- service archive/inactive check;
- unieke weekday opening hours;
- geldige openingstijden en break ranges;
- queue identity- en ordering constraints en queue-status-enum, zonder actieve-customer-unique-index (verwijderd in migratie `0007_tense_spectrum.sql`);
- indexes voor sessies, afspraken, services, queues, audit en rate limits.

### 10.3 Migrations

**CURRENT**

`drizzle/0000_breezy_vanisher.sql` maakt de hoofdtabellen en constraints aan. `drizzle/0001_grey_brood.sql` voegt rate limits en bijbehorende indexes toe. `0002_oval_hitman.sql` voegt whole-day blocks toe, `0003_panoramic_liz_osborn.sql` booking settings en `0004_unique_wolf_cub.sql` de Phase 3 appointmentvelden. Overlap wordt transactioneel beschermd met PostgreSQL advisory locks in de appointment service.

**ARCHITECTURE RULE**

Applicatielogica en databaseconstraints vullen elkaar aan. Database access blijft server-only. Schemawijzigingen lopen via Drizzle schema en migrations; documentatie mag geen migration impliceren die niet bestaat.

---

## 11. Domain, service en repository layers

De repository bevat nu appointment- en queue repository-, authorization- en service/domainlagen, plus een notificatiemodule voor interne eigenaar-notificaties. Availability- en service CRUD-lagen bestaan nog niet.

**ARCHITECTURE RULE**

Nieuwe domeinfunctionaliteit gebruikt waar passend deze verdeling:

### Schema layer

Zod schemas valideren externe input. Drizzle schema’s definiëren persistence types, relaties en databaseconstraints.

### Server Function layer

Deze laag vormt de request boundary, valideert input, voert auth/authorization uit en roept domain/service logic aan.

### Service layer

Deze laag bevat business rules, domain workflows, status transitions, availability, transacties en orchestration. Business rules horen niet in React components.

### Repository/data layer

Deze laag bevat database queries, persistence en database-specifieke logica. De repository mag geen clientcode importeren.

---

## 12. Appointment architecture

### 12.1 Huidig schema

**CURRENT**

`appointments` ondersteunt customer of guest identity, een nullable barber foreign key voor historische compatibiliteit, service foreign key, service snapshots, buffer snapshot, occupied start/end, status, note, creator, lifecycle timestamps, no-show slot release en expliciete barber override metadata.

Foreign keys koppelen customer, barber en creator met `ON DELETE SET NULL` en de service met `ON DELETE RESTRICT`. Er zijn checks voor prijs, duur, buffer, tijdvolgorde, customer/guest identity en no-show slot release.

### 12.2 Snapshotregel

**ARCHITECTURE RULE**

Bij het aanmaken van een afspraak worden service name, price en duration opgeslagen als appointment snapshot. Historische afspraken lezen hun historische waarden uit de appointment en herberekenen die niet vanuit `services.price`, `services.duration` of de actuele servicenaam.

Nieuwe afspraken gebruiken de actuele actieve serviceconfiguratie. Wijzigingen aan een service mogen bestaande appointment snapshots niet muteren.

### 12.3 Appointment identity

De architectuur ondersteunt zowel authenticated customers als guests. Voor guests moet de toegang tot afspraakdata expliciet worden ontworpen en server-side worden gecontroleerd; een guest booking mag niet automatisch toegang geven tot alle afspraken met vergelijkbare contactgegevens.

---

## 13. Appointment lifecycle

De statuswaarden die in product- en datamodeldocumentatie voorkomen zijn:

```text
new
confirmed
in_progress
completed
cancelled
no_show
```

**ARCHITECTURE RULE**

Status transitions worden server-side gevalideerd. De domainmatrix staat `new → confirmed|cancelled|no_show`, `confirmed → in_progress|cancelled|no_show` en `in_progress → completed` toe. `completed`, `cancelled` en `no_show` zijn terminale statussen; administratieve correcties zijn een afzonderlijke functionaliteit.

De exacte transition matrix is niet als afzonderlijke definitieve matrix vastgelegd; nieuwe code mag daarom geen extra transitions verzinnen.

---

## 14. Availability architecture

Availability is een server-side domain calculation. De frontend toont uitsluitend serverresultaten en mag zelf geen definitieve beschikbaarheid berekenen.

De berekening moet rekening houden met:

- actieve service;
- actuele serviceduur;
- openingstijden en gesloten dagen;
- hele-dag blokkades;
- pauzes;
- bestaande niet-vrijgegeven afspraken;
- buffer;
- huidige datum en tijd;
- relevante configureerbare booking settings.

De volledige appointment range, niet alleen het starttijdstip, moet beschikbaar zijn. Een barber-created appointment buiten normale availability is een expliciete uitzondering en verandert de normale customer availability niet.

**ARCHITECTURE RULE**

Configureerbare waarden komen uit database/configuration. De availability engine mag geen permanente hardcoded business values bevatten voor buffer, openingstijden, serviceduur of andere configureerbare regels. Het bookinginterval is een vaste technische/businessregel van 15 minuten en geldt voor zowel customer als owner. Het interval wordt niet als configureerbare database-setting opgeslagen. Availability, booking validation en de UI moeten deze 15-minutenintervallen respecteren. Bestaande overlap-, buffer- en concurrencylogica blijft leidend.

---

## 15. Timezone

De business timezone is:

`Europe/Amsterdam`

**ARCHITECTURE RULE**

Appointments en availability gebruiken timezone-aware timestamps en interpreteren business dates in `Europe/Amsterdam`. Implementaties moeten expliciet rekening houden met zomer-/wintertijd, DST transitions en datumgrenzen. De server timezone mag nooit impliciet als business timezone worden gebruikt.

---

## 16. Appointment concurrency

**ARCHITECTURE RULE**

Appointment create en update moeten concurrency-safe zijn wanneer overlap niet is toegestaan. Alleen:

1. availability lezen;
2. geen conflict zien;
3. onafhankelijk inserten

is onvoldoende, omdat twee gelijktijdige requests hetzelfde interval kunnen claimen.

Appointment creation gebruikt PostgreSQL transaction-level advisory locking per server-resolved eigenaar (`resolveSingleBarber()` selecteert de actieve `owner`-gebruiker). De lock wordt vóór overlapquery en insert in dezelfde transaction verkregen. `SELECT FOR UPDATE` op uitsluitend bestaande conflicterende rows is daarom niet de gekozen strategie.

De concrete implementatie gebruikt `pg_advisory_xact_lock(hashtextextended(...))` en accepteert conflicten niet stilzwijgend.

---

## 17. Configureerbare business rules

De volgende waarden moeten uit database/configuration komen wanneer de barber ze kan beheren:

- buffer;
- cancellation deadline (24 uur);
- boeken buiten normale beschikbaarheid;
- overlap permission;
- handmatige appointment confirmation;
- availability override behavior;
- service price;
- service duration;
- opening hours.

De exacte waarden van cancellation deadline en queue rules zijn niet ingevuld. No-show-vrijgave is altijd automatisch en daarmee geen configuratiekeuze meer.

---

## 18. Barber override

De business rules staan toe dat de barber, afhankelijk van configuratie, handmatig buiten normale customer availability boekt. Dit kan openingstijden, pauzes of een geblokkeerde dag betreffen.

**ARCHITECTURE RULE**

- normale customer availability blijft strikt;
- owner actions zijn afzonderlijk geautoriseerd;
- een override vereist expliciete configuratie en/of bevestiging volgens de business rules;
- uitzonderlijke afspraken worden niet automatisch als customer slots aangeboden;
- dit is geen multi-staff scheduling model (single-owner model);

---

## 19. Guest customers

**CURRENT/REQUIREMENT**

`BUSINESS_RULES.md` staat booking zonder account toe. Het huidige booking-routepad valt nog onder `_customer`, maar `createAppointmentFn` ondersteunt guest creation via een expliciete server boundary. Guest retrieval, modification en cancellation bestaan niet in Phase 3.

**ARCHITECTURE RULE**

Guest booking krijgt een eigen expliciete server boundary. De server bewaart en verwerkt de noodzakelijke guest identity, maar laat een guest niet zonder aanvullende controle bestaande customer appointments lezen of wijzigen. Customer ownership en guest access worden afzonderlijk gecontroleerd.

---

## 20. Validation

Er zijn drie complementaire lagen:

### Client validation

Voor snelle UX-feedback en formuliergedrag. Niet betrouwbaar voor security of data-integriteit.

### Server validation

Voor correcte input, authorization, business rules, availability, ownership en status transitions.

### Database constraints

Voor persistente data-integriteit, relaties, ranges, uniciteit en concurrencybescherming waar passend.

Geen van deze lagen vervangt de andere twee.

---

## 21. Error handling

Server Functions maken onderscheid tussen:

- validation errors;
- authentication errors;
- authorization errors;
- business rule violations;
- availability conflicts;
- database errors;
- onverwachte server errors.

**ARCHITECTURE RULE**

Responses bevatten bruikbare maar veilige foutinformatie. SQL-details, stack traces, secrets en andere gevoelige serverinformatie worden niet ongecontroleerd naar de client gestuurd.

---

## 22. Audit logging

**CURRENT**

`src/auth/audit.server.ts` en `audit_logs` bestaan. Auth events en Phase 2/3 mutaties loggen onder andere action, actor, entity, JSON metadata, gehashte IP, user agent en timestamp.

**ARCHITECTURE RULE**

Audit logging gebeurt server-side voor auth events en gevoelige administratieve acties, waaronder belangrijke instellingen, appointment status changes en relevante owner-beheeracties. De bestaande auditinfrastructuur is de basis.

Appointment- en queuemutaties worden via de bestaande domain services server-side geaudit. Services CRUD- en profilemutaties hebben nog geen volledige Server Function-workflow.

---

## 23. Rate limiting

**CURRENT**

`src/auth/rate-limit.server.ts` implementeert database-backed fixed windows. De bestaande limieten zijn 3 registraties per IP per 15 minuten, en 5 loginpogingen per email plus 20 per IP per 15 minuten. Keys worden met SHA-256 gehasht.

Een cleanup helper bestaat maar heeft geen geplande caller. Counts blijven na het bereiken van de limiet oplopen, wat functioneel veilig is maar onnodige groei kan veroorzaken.

**ARCHITECTURE RULE**

Authentication en andere abuse-sensitive publieke flows worden rate limited. Iedere nieuwe publieke mutation wordt expliciet beoordeeld op rate-limitbehoefte.

---

## 24. CSRF

**CURRENT**

`src/start.ts` configureert CSRF-middleware voor POST Server Functions. De huidige voorwaarde is `handlerType === 'serverFn' && request.method === 'POST'`.

**ARCHITECTURE RULE**

Muterende Server Functions worden beschermd tegen cross-site verzoeken volgens deze server-side middleware. Mutations mogen niet uitsluitend vertrouwen op client-originatie of UI-flow.

---

## 25. Feature flags

Feature flags zijn een product/configuration-mechanisme voor zichtbaarheid en beschikbaarheid van optionele functionaliteit.

**ARCHITECTURE RULE**

Een feature flag is geen security boundary. Ook wanneer een feature in de UI is uitgeschakeld, blijven Server Functions en database-acties server-side geautoriseerd.

Er is momenteel geen afzonderlijk feature-flagmechanisme in de repository vastgesteld.

---

## 26. UI architecture

**CURRENT**

De UI is mobile-first en gebruikt een donkere stijl met gouden accentkleur, een maximale contentbreedte van 520px, een responsive desktop wrapper rond 700px en vaste customer/owner bottom navigation (`BottomNav` en `OwnerBottomNav`; de owner-klasnaam `.staff-nav` is legacy). `src/styles/theme.css` bevat de globale styling. Bestaande componenten omvatten onder andere `Button`, `Card`, `Field`, `ServiceCard`, `BookingCard`, navigatiecomponenten en route guards.

**ARCHITECTURE RULE**

De bestaande public UI en visuele identiteit zijn leidend. Nieuwe functionaliteit hergebruikt bestaande components, styles, assets en navigation patterns waar passend en introduceert geen onnodige redesigns. De UI is nooit de business authority.

---

## 27. State management

**CURRENT**

- Auth state wordt door `AuthContext` beheerd.
- `AppointmentContext` houdt mock appointments in lokale React state en ondersteunt lokale add/update-operaties.
- `WaitingListContext` houdt hardcoded waiting-list entries in lokale React state.
- `src/data/mockData.ts` bevat hardcoded salon-, service-, barber- en appointmentdata en is transitional.
- Pagina’s tonen grotendeels lokale of hardcoded state; server-derived domeinstate ontbreekt voor appointments, services, availability, settings en queue.

**ARCHITECTURE RULE**

Lokale state is geschikt voor tijdelijke UI-interactie. Persistente en gedeelde domeinstate wordt via Server Functions uit de database geladen en gewijzigd. Er wordt geen nieuwe state library geïntroduceerd zonder requirement.

---

## 28. Mock data en transitional code

**CURRENT**

- `src/data/mockData.ts` bevat hardcoded business data en vijf appointments.
- `src/auth/AppointmentContext.tsx` gebruikt mock appointments, `Date.now()` IDs en lokale updates zonder persistence, ownership, snapshots, transacties of overlapchecks.
- `src/auth/WaitingListContext.tsx` gebruikt hardcoded entries, synthetic customer ID `999` en lokale statusupdates.
- `src/pages/Queue.tsx` gebruikt `demoEntry`, gesimuleerde counts, estimates, posities en status transitions; het bevat zichtbare ontwikkelvoorbeeld-output.
- `src/App.tsx` en `src/main.tsx` zijn migration placeholders.
- `src/db/README.md` bevat verouderde tekst waarin auth nog als niet geïmplementeerd wordt beschreven.

**FUTURE/TRANSITION**

Mock data, lokale contexts en oude placeholders zijn geen productie-domeinarchitectuur. Zij moeten bij invoering van de server-side domeinlaag worden vervangen of verwijderd, zonder de bestaande UI onnodig te redesignen. De queue-demo mag geen nieuwe queue business rules introduceren zolang die regels open zijn.

---

## 29. Testing architecture

**CURRENT**

Vitest is aanwezig via `npm run test`. Appointment schema-, authorization-, domain-, overlap- en conditionele PostgreSQL concurrencytests bestaan; de echte database concurrencytest vereist een `DATABASE_URL`.

**FUTURE/ARCHITECTURE RULE**

Kritieke server-side regels moeten worden getest voor:

- authentication en sessions;
- authorization en ownership;
- Server Functions;
- appointment lifecycle en status transitions;
- availability en volledige serviceduur;
- overlap en concurrency;
- timezone, datumgrenzen en DST;
- service snapshots;
- guest/customer/owner permissions;
- configuratie en business rule violations.

Tests moeten de domain/service-laag en Server Functions kunnen isoleren en mogen niet uitsluitend de huidige mock UI testen.

---

## 30. Security checklist

Nieuwe functionaliteit moet minimaal voldoen aan:

- never trust client input;
- server-side authorization;
- server-side validation;
- database constraints;
- secure cookies;
- Argon2id password hashing;
- rate limiting;
- CSRF protection;
- ownership checks;
- geen gevoelige data leakage;
- server-only database access;
- concurrency protection;
- server-side audit logging voor relevante acties.

---

## 31. Development rules

1. Lees eerst `PRODUCT_REQUIREMENTS.md`, `BUSINESS_RULES.md` en deze `ARCHITECTURE.md`.
2. Product requirements komen uit `PRODUCT_REQUIREMENTS.md`.
3. Business behavior komt uit `BUSINESS_RULES.md`.
4. Dit document beschrijft de technische architectuur.
5. Hardcode geen business values die configureerbaar zijn.
6. Plaats authorization niet uitsluitend in de UI.
7. Gebruik geen database access vanuit client-code.
8. Plaats business logic die server-side moet worden afgedwongen niet in React components.
9. Wijzig geen historische appointment snapshots door actuele servicegegevens opnieuw te berekenen.
10. Schrijf geen concurrency-onveilige appointment writes.
11. Voeg geen multi-barber abstractions toe zonder expliciete requirement.
12. Verzin geen productfunctionaliteit om technische implementatie eenvoudiger te maken.
13. Behandel mock- en transitional code niet automatisch als productiearchitectuur.
14. Laat open productbeslissingen expliciet open en vul ze niet technisch in.

---

## 32. Open decisions

De volgende productbeslissingen zijn nog niet definitief vastgesteld:

1. notification events buiten Web Push v1 (§28) en Eigenaar-notificaties v1 (§29);
2. notification preferences buiten de vastgelegde opt-ins en instellingen;
3. failed delivery/retry behavior voor die toekomstige events.

De architectuur moet deze configuratie kunnen ondersteunen, maar mag de waarden of queue behavior niet zelfstandig invullen.

---

## 33. Inconsistenties en huidige grenzen

De volgende verschillen tussen requirements en de huidige implementatie zijn vastgesteld:

- Guest booking is productmatig toegestaan, maar de huidige customer booking routes zijn achter authenticatie geplaatst.
- Product- en businessregels vereisen server-side availability, mutations, ownership, statusvalidatie, snapshots en concurrencybescherming; deze domeinfuncties bestaan nog niet.
- Services, settings, opening hours, booking settings en queue zijn in het schema deels voorbereid, maar hebben geen volledige server API en beheer-UI.
- De database heeft momenteel geen overlap exclusion of gelijkwaardige concurrencyconstraint.
- De UI gebruikt hardcoded mock data voor businessinformatie, services, tijden, appointments en queuegedrag.
- Owner appointment UI valideert lokaal, controleert geen volledige duration overlap, laat terminale afspraken lokaal bewerken en exposeert niet alle vereiste lifecycle transitions.
- De owner UI toont een source selector, terwijl `BUSINESS_RULES.md` source selection niet als afzonderlijke productfunctionaliteit vereist.
- `authMiddleware` en session refresh bestaan, maar zijn niet volledig geïntegreerd in alle server flows.
- `src/db/README.md` loopt achter op de aanwezige authentication implementation.

Deze punten zijn implementatiegrenzen of migratiepunten, geen nieuwe business rules.

---

## 34. PWA Architecture

**FUTURE/ARCHITECTURE RULE**

Centro Kapper wordt als installable Progressive Web App ontworpen volgens dit conceptuele model:

```text
Web Application
      ↓
PWA Manifest
      ↓
Service Worker
      ↓
Installable Mobile Web App
      ↓
iOS / Android
```

De architectuur moet rekening houden met:

- web app manifest;
- service worker;
- HTTPS;
- installability;
- caching/offline strategy;
- update lifecycle;
- platformverschillen tussen iOS en Android.

De volledige applicatie hoeft niet offline te functioneren. Offline support is alleen verplicht wanneer dit later expliciet als productrequirement wordt vastgesteld.

PWA-functionaliteit blijft binnen de bestaande mobile-first UI en mag het bestaande ontwerp niet onnodig wijzigen.

## 35. Push Notification Architecture

**FUTURE/ARCHITECTURE RULE**

Push notification delivery is geen client-only feature. Het conceptuele model is:

```text
Application Event
      ↓
Notification Domain
      ↓
Notification Delivery
      ↓
Push Subscription(s)
      ↓
Service Worker
      ↓
iOS / Android Device
```

De architectuur moet minimaal rekening houden met:

- push subscriptions;
- persistence van devices en subscriptions;
- service worker handling;
- server-side notification dispatch;
- authenticatie en autorisatie;
- subscription lifecycle;
- cleanup van invalid of expired subscriptions;
- meerdere devices of subscriptions per user;
- privacy en security.

Retry- en failure handling moeten als architectuurvraag worden ontworpen zonder zelfstandig notification businessgedrag vast te leggen. Notification delivery state mag niet uitsluitend in de browser worden bijgehouden.

## 36. Platform Compatibility

**ARCHITECTURE RULE**

iOS en Android moeten beide voor de PWA worden ondersteund. PWA-capabilities kunnen per platform en browser verschillen. Implementatie en testing moeten daarom platform-specifiek worden gevalideerd. Platformbeperkingen mogen niet stilzwijgend worden genegeerd of als identiek gedrag worden voorgesteld.

---

## 37. Interne eigenaar-notificaties

**CURRENT**

Interne eigenaar-notificaties (`BUSINESS_RULES.md` §29) bestaan uit twee onderdelen:

```text
Businessactie (wachtrij of afspraak)
      ↓  dezelfde database-transactie
owner_notification_events  (duurzaam gebeurtenisregister, unieke dedup_key)
      ↓  savepoint binnen dezelfde transactie
owner_notifications        (bell-readmodel met leesstatus)
      ↓
SSE-stroom /api/owner-notifications/stream  (signaal: "er is iets nieuws")
      ↓
OwnerNotificationBell      (teller, lijst, markeren als gelezen)
```

### Vastleggen, materialiseren en herstellen

De registratie van de gebeurtenis en het aanmaken van de melding zijn **twee gescheiden stappen**:

1. **Vastleggen** — het gebeurtenisrecord wordt binnen dezelfde transactie als de hoofdactie opgeslagen, met `ON CONFLICT DO NOTHING` op de `dedup_key`. Daardoor kan een geslaagde hoofdactie nooit stilzwijgend een gebeurtenis verliezen: valt de registratie weg, dan komt de hoofdactie ook niet tot stand, en herhaalde verwerking levert geen tweede melding op.
2. **Materialiseren** — het aanmaken van de melding in de bell gebeurt binnen een **savepoint** van diezelfde transactie. Een fout in de meldingsopslag raakt daardoor alleen de savepoint: de kernactie blijft slagen. De driver (`neon-serverless`) implementeert een geneste transactie als `SAVEPOINT` met `ROLLBACK TO SAVEPOINT` bij een fout.

Een mislukte materialisatie levert dus geen mislukte kernactie op, maar wel een gebeurtenis zonder melding. Dat gebeurtenisrecord is duurzaam en blijft bestaan nadat de melding na 30 dagen is opgeruimd.

### Herstelpas

De herstelpas (`repairMissingOwnerNotifications()`) zoekt geregistreerde gebeurtenissen zonder melding, bepaalt de weergavetekst opnieuw uit de bijbehorende wachtrij-entry of afspraak en maakt de melding alsnog aan. De herstelactie is idempotent: een tweede run levert geen tweede melding op, omdat de melding per gebeurtenis uniek is (`event_id`).

De herstelpas loopt mee met het ophalen van de meldingenlijst, is best-effort en frequentiebegrensd. De teller en de lijst worden in de UI bijgewerkt via de SSE-stroom; als die stroom niet beschikbaar is, wordt teruggevallen op de gedeelde `PollScheduler` (`src/polling/poll-scheduler.ts`), die overlappende requests, back-off en pauze bij een verborgen tabblad afhandelt.

### Realtime-updates (SSE)

De bell ontvangt updates via een Server-Sent Events-stroom op
`/api/owner-notifications/stream`. De route is alleen toegankelijk voor de
ingelogde eigenaar: de identiteit wordt uitsluitend afgeleid uit het
sessiecookie, nooit uit een door de client opgegeven gebruikers-id.

**Architectuurkeuze: de stroom leest de toestand rechtstreeks uit de
database.** Er wordt bewust **geen in-memory eventbus** gebruikt. De applicatie
draait serverless op Vercel, waar een gebeurtenis op een andere instantie
wordt vastgelegd: bij een in-memory bus zou die melding verloren gaan. De
database blijft de enige bron van waarheid; de stroom is alleen een signaal
dat er iets nieuws is. De stroom bezorgt uitsluitend de identiteit van de
nieuwste melding; de meldingen zelf worden opgehaald via de bestaande
beveiligde Server Functions, zodat geen notificatiegegevens buiten de
autorisatielaag terechtkomen.

De stroom controleert met een interval van twee seconden of de nieuwste melding
of het aantal ongelezen meldingen is veranderd en stuurde dan een minimale
update (`event: notification`, `data: {"id":"…"}`). Verder stuurt de server
een `retry`-advies en een heartbeat; de client bewaakt daarom de verbinding en
verbreekt hem als er te lang geen signaal binnenkomt.

Omdat de stream een signaal is en geen bron van waarheid, haalt de client de
meldingen bij het openen van de verbinding en bij elke update opnieuw op via
`getOwnerNotificationsFn()`. Gemiste updates worden daardoor na een reconnect
alsnog teruggevonden, en dubbele signalen leveren geen dubbele items op: de
lijst wordt op id ontdubbeld.

Wanneer de stroom niet beschikbaar is, valt de bell terug op de bestaande
polling (`PollScheduler`). De polling draait alleen wanneer de verbinding
onderbroken is, zodat een gezonde verbinding geen dubbele belasting veroorzaakt.
Bij het verbreken van de verbinding worden de timers van de stroom opgeruimd,
zodat een verbroken verbinding geen resources vast blijft houden.

### Modules

- `src/db/schema/owner-notifications.ts` — schema, relaties en constraints;
- `src/notifications/owner-notification.events.ts` — pure gebeurtenisbeslissingen en stabiele idempotentiesleutels;
- `src/notifications/owner-notification.repository.server.ts` — queries, inclusief het vinden van gebeurtenissen zonder melding en de compacte watch-toestand voor de stroom;
- `src/notifications/owner-notification.service.server.ts` — businesslogica, de koppeling met de wachtrij- en afspraakdomeinen, de savepoint-isolatie en de herstelpas;
- `src/notifications/owner-notification.functions.ts` — Server Functions met `requireOwner()`;
- `src/notifications/owner-notification.stream.ts` — client-veilige constanten en hulpfuncties (terugvalvertraging, ontdubbelen, watchdog);
- `src/notifications/owner-notification.stream-connection.ts` — verbindingsbeheer van de client (openen, herverbinden, heartbeat-controle);
- `src/notifications/owner-notification.stream.server.ts` — de SSE-stroom zelf;
- `src/routes/api/owner-notifications.stream.ts` — de route;
- `src/components/OwnerNotificationBell.tsx` en `src/components/OwnerHeader.tsx` — de bel in de gedeelde owner-header.

### Retentie en verversing

Interne notificaties worden na 30 dagen verwijderd, ongeacht of ze gelezen zijn; de termijn is vast en niet instelbaar. De opruiming loopt mee met het ophalen van de lijst en is best-effort. Het gebeurtenisregister bevat geen weergavetekst en geen persoonsgegevens en wordt daarom niet op leeftijd verwijderd.

### Scheiding met klantenpush

Klantenpush (§28) en eigenaar-notificaties (§29) hebben gescheiden tabellen, services en records. De klantpush blijft queue-entry-gebonden; de interne notificaties hebben daarentegen een duurzaam gebeurtenisregister en een bell-readmodel.

---

## 38. Eigenaarpush

**CURRENT**

Eigenaarpush (`BUSINESS_RULES.md` §29 "Eigenaarpush") is de pushvariant van de
interne eigenaar-notificaties uit §37. Het kanaal is volledig gescheiden van de
klantenpush (§28): eigen abonnementen, eigen deliveries, eigen service, eigen
dispatch en eigen serverfuncties. Een klantabonnement ontvangt nooit een
eigenaarsmelding en een eigenaarabonnement nooit een klantmelding.

```text
Businessactie (wachtrij of afspraak)
      ↓  dezelfde database-transactie
owner_notification_events  (duurzaam gebeurtenisregister = pushintentie)
      ↓  post-commit hook
ensureOwnerPushDeliveries()  (event × actief apparaat, idempotent)
      ↓
owner_push_deliveries      (status, pogingen, claim-token, retry)
      ↓  web-push
owner_push_subscriptions   (per apparaat; endpoint is de apparaatidentiteit)
      ↓
Service Worker (kind-discriminator) → /owner
```

### Pushintentie en deduplicatie

De pushintentie is het bestaande, duurzame gebeurtenisregister uit §37. Er is
geen aparte intent-tabel nodig: de gebeurtenis *is* de intentie en de
`dedup_key` blijft bestaan nadat de bell-melding na 30 dagen is opgeruimd.
De ontdubbeling gebeurt op de unieke combinatie van gebeurtenis en abonnement
(`owner_push_deliveries.event_id` + `subscription_id`), waardoor herhaalde
verwerking, retries en een tweede dispatch nooit een tweede melding op het
zelfde apparaat opleveren.

De deliveries worden aangemaakt met `ON CONFLICT DO NOTHING`. De aanmaak is
daarmee idempotent en herstelbaar: een gebeurtenis dat door een storing geen
delivery opleverde, krijgt die bij een latere run alsnog.

### Post-commit hook

De businessactie legt de gebeurtenis binnen dezelfde transactie vast. Het
versturen kan pas na het committen, omdat een delivery in een nog openstaande
transactie niet zichtbaar is voor de dispatcher. Daarom roepen de wachtrij-
en afspraakservices na hun transactie `notifyOwnerPush()` aan
(`src/push/owner-push.dispatch.server.ts`).

De hook is bewust **additief** en **post-commit**:

- de bestaande transactie, de bestaande transactiebounds en de bestaande
  foutafhandeling van de wachtrij- en afspraakservices blijven ongewijzigd;
- de hook geeft nooit een fout door (`notifyOwnerPush()` vangt alle fouten
  af), zodat een pushprobleem nooit de kernactie laat mislukken
  (`BUSINESS_RULES.md` §29 "Foutafhandeling");
- de klantenpush (`dispatchPendingDeliveries`) wordt niet aangeraakt.

### Verzending, retry en herstel

De dispatcher spiegelt het beproefde patroon van de klantenpush, maar op de
eigen tabellen: claim met fencing (`claim_token` + `claimed_at`), begrensde
pogingen (maximaal drie, database-constraint), retry met `next_attempt_at` en
afsluitende statussen. Een providerfout met status 404 of 410 betekent een
dood endpoint: het abonnement wordt gedeactiveerd en de delivery afgesloten
als `invalid`. Een tijdelijke fout laat de delivery `pending` voor een
volgende poging.

De bestaande cronroute `/api/cron/push-dispatch` herstelt vastgelopen claims
en verwerkt achtergebleven deliveries. De klantensectie en de eigenaarsectie
draaien daar gescheiden; een fout in de eigenaarsectie raakt de klantensectie
niet.

### Privacy van de payload

De payload bevat uitsluitend een technische tag en het soort gebeurtenis
(`{ tag, kind }`). De tag is een eenmalige vingerafdruk (SHA-256) van de
gebeurtenissleutel: stabiel per gebeurtenis voor deduplicatie op het apparaat,
maar niet herleidbaar naar een klant, afspraak of wachtrij-entry. Titel, tekst
en bestemming staan vast in de service worker; de payload levert geen
persoonsgegevens.

De service worker krijgt een `kind`-discriminator. De klanttak is ongewijzigd:
een payload zonder herkenbare `kind` blijft een klantmelding met dezelfde
titel, tekst, tag-prefix en bestemming `/queue`. `SW_VERSION` is omhoog
gezet naar `centro-kapper-sw-v3`.

### Retentie

De technische pushgegevens volgen het gebruik, niet een vaste termijn
(`BUSINESS_RULES.md` §29 "Technische pushgegevens"): deliveries met een
eindstatus waarvan de gebeurtenis buiten het verzendvenster ligt, worden
opgeschoond; inactieve abonnementen worden opgeschoond zodra ze niet meer
nodig zijn voor verzending. Actieve, geldige abonnementen blijven bestaan
zolang ze nodig zijn.

### Modules

- `src/db/schema/owner-push-subscriptions.ts` — schema, relaties en constraints;
- `src/push/owner-push.schemas.ts` — eigen zod-validatie voor de apparaten;
- `src/push/owner-push.service.server.ts` — registreren, uitschakelen en tonen van apparaten, plus de deactivering bij een dood endpoint;
- `src/push/owner-push.dispatch.server.ts` — aanmaken van deliveries, claim, verzending, retry, stale recovery, opschoning en de post-commit hook;
- `src/push/owner-push.functions.ts` — Server Functions met `requireOwner()`;
- `src/components/OwnerPushOptIn.tsx` en `src/pages/settings/OwnerPushSettingsSection.tsx` — de opt-in per apparaat in `/owner/settings`.

---

## 39. Automatische data-updates

**CURRENT**

Pagina's halen hun gegevens op via de bestaande Server Functions en bewaren
die in lokale state. Zonder een verversmechanisme veroudert een openstaande
pagina zodra de gegevens door iemand anders veranderen (een klant meldt zich
aan, de kapper boekt een afspraak). Pushmeldingen komen wél aan, omdat push
een server→devicekanaal is dat onafhankelijk van een open pagina werkt.

De automatische verversing bouwt voort op de bestaande, geteste bouwstenen:

- `src/polling/poll-scheduler.ts` — de `PollScheduler` regelt de timing:
  één lopende load, exponentiële back-off bij fouten, pauze bij een verborgen
  tabblad en een directe verversing bij `visibilitychange`;
- `src/polling/page-refresh.ts` — de `PageRefresh`-controller koppelt de
  scheduler aan het laden en toepassen van gegevens;
- `src/polling/use-page-refresh.ts` — de React-koppeling (`usePageRefresh`);
- `src/queue/owner-queue.polling.ts` en `src/appointments/appointment.polling.ts` —
  de snapshot-fetcher per domein, die alleen de dynamische gegevens ophaalt.

### Regels

1. **Stil.** Een achtergrondverversing raakt de laad- en foutstatus van de
   pagina niet: bestaande inhoud blijft zichtbaar en er is geen laadflits.
2. **Alleen bij verandering.** De controller vergelijkt de geladen inhoud met
   de laatst toegepaste inhoud en past alleen state toe wanneer die werkelijk
   is veranderd. Dat voorkomt onnodige renders en flikkering.
3. **Monotone tokens.** Alleen de meest recente load mag state toepassen; een
   oudere reactie overschrijft nooit nieuwere state (`createRequestGuard`).
4. **Bestaande autorisatie.** De fetcher gebruikt uitsluitend de bestaande
   Server Functions; de server blijft de enige bron van waarheid en de
   bestaande foutafhandeling blijft intact.
5. **Geen nieuwe architectuur.** Er komt geen React Query, geen router-
   invalidatie, geen extra SSE-verbinding en geen wijziging aan pushpayloads
   of service-workerlogica.

### Gedrag per scherm

| Scherm | Interval | Ververst |
|---|---|---|
| Klantwachtrij `/queue` | 12 s | wachtrijvermeldingen, positie en wachttijd (bestaand gedrag) |
| Kapperswachtrij `/owner/queue` | 12 s | wachtrijvermeldingen van vandaag |
| Kappersafspraken `/owner/appointments` | 25 s | afspraken en annuleringsverzoeken |
| Klantafspraken `/bookings` | 25 s | afspraken en annuleringsverzoeken |
| Eigenaarbel (alle eigenaarpagina's) | SSE + terugvalpolling | meldingenlijst en ongelezenteller (bestaand gedrag) |
| Kappersdashboard `/owner` | — | geen automatische verversing (zie onder) |

De polling stopt wanneer de pagina wordt verlaten (unmount) en pauzeert in een
verborgen tabblad; bij terugkeer naar een zichtbaar tabblad wordt direct
opnieuw opgehaald.

### Bewuste keuzes

- De **dienstenlijst** wordt niet gepolld: het is een statische referentie die
  alleen via de instellingen verandert. De initiële lading en de lading na
  een eigen actie halen hem wel op.
- Het **kappersdashboard** ververst niet: de metrieken komen uit vijf
  aggregatiequeries, waarvan één zonder ondersteunende index op `completed_at`.
  Dat is zwaarder dan de lijstverversingen en de cijfers veranderen langzaam.
  Het dashboard is daarmee de enige pagina die handmatig vernieuwd moet
  worden; de wijzigingen die er relevant zijn (nieuwe boeking, openstaand
  annuleringsverzoek) komen via de notificatiebel en de pushmelding binnen.
