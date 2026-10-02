# Centro Kapper — Implementation Roadmap

**Document:** Implementation Roadmap  
**Versie:** 1.0  
**Status:** Living Document / Current Repository Status  
**Project:** Centro Kapper  
**Laatste update:** 2026-09-08

**Fasestatus:** Phase 1 t/m Phase 6 zijn geïmplementeerd. Phase 7A — Queue Domain Foundation en Phase 7B — Queue Server Functions Boundary zijn geïmplementeerd; de queue UI-integratie resteert. De huidige branch is `master`; er is geen Git-remote geconfigureerd.

---

## 1. Doel en uitgangspunten

Deze roadmap bepaalt de architectonische volgorde waarin de resterende Centro Kapper-functionaliteit kan worden gebouwd. De roadmap is geen implementatie en wijzigt geen product- of businessbeslissingen.

De bestaande documenten blijven leidend:

1. actuele expliciete gebruikersbeslissingen;
2. `PRODUCT_REQUIREMENTS.md`;
3. `BUSINESS_RULES.md`;
4. `ARCHITECTURE.md`;
5. `DATABASE_RULES.md`;
6. `UI_RULES.md`;
7. `DEVELOPMENT_WORKFLOW.md`;
8. `AGENTS.md`;
9. bestaande repository-implementatie;
10. aannames.

Centro Kapper blijft een single-barber applicatie op TanStack Start/Router, React, TypeScript, Drizzle ORM en Neon PostgreSQL. De bestaande mobile-first UI is design-leading. Guest booking is onderdeel van de booking-flow, niet een later reparatiepunt. PWA is een installeerbare Progressive Web App, geen native iOS- of Android-app.

Open businessbeslissingen worden niet ingevuld. Een fase mag gedrag pas implementeren nadat de daarvoor noodzakelijke beslissing expliciet is vastgelegd in de relevante source-of-truth-documenten.

---

## 2. Huidige uitgangssituatie

De repository bevat momenteel:

- geïmplementeerde auth-basis met Argon2id, database-backed sessions, CSRF, rate limiting, audit logging en authorization helpers;
- Drizzle-schema’s en vier bestaande migrations;
- schema-basis voor users, sessions, services, appointments, business profile, opening hours, breaks, queue, audit logs en rate limits;
- bestaande TanStack routes, customer/staff layouts en mock/transitional UI;
- lokale `AppointmentContext`, `WaitingListContext` en `src/data/mockData.ts`;
- server-side appointment create/read/list persistence, settings-domainfuncties en Phase 4 availability/booking;
- PostgreSQL advisory-locking en transactionele overlap-/concurrencybescherming voor appointment-creatie;
- Vitest-testinfrastructuur met unit-, domain-, authorization-, availability- en conditionele database-integratietests;
- geen PWA manifest, service worker, PWA-installability of push notification code;
- geen push subscription/device-registration persistence;
- geen definitieve notification events of notification preferences.

De roadmap bouwt voort op deze toestand en behandelt mockcode niet als productiearchitectuur.

---

## 3. Waarom deze volgorde

De volgorde voorkomt dat domeinlogica zonder testbaarheid, configuratie of data-integriteit wordt gebouwd:

- testbaarheid en engineering boundaries komen vroeg;
- configureerbare businesswaarden worden persistent voordat services ze interpreteren;
- concurrency wordt ontworpen vóór definitieve appointment persistence;
- availability en booking blijven één server-authoritative domein, met guest booking inbegrepen;
- lifecycle en UI-integratie volgen pas nadat serverdata en security boundaries bestaan;
- queue krijgt eerst businessregels voordat de bestaande demo wordt vervangen;
- PWA vormt de technische basis voor push;
- push delivery wordt gebouwd vóór concrete notification events;
- productievalidatie gebeurt pas nadat de volledige keten bestaat.

---

## 4. Dependency graph

### 4.1 Aanbevolen afhankelijkheidsvolgorde

```text
Foundation & Test Infrastructure
        ↓
Configuration & Settings
        ↓
Appointment Domain + Concurrency Design
        ↓
Availability
        ↓
Concurrency-safe Booking
        ↓
Appointment Lifecycle & Management
        ↓
Server-driven UI Integration
        ↓
Queue Domain
        ↓
PWA Foundation
        ↓
Push Delivery Infrastructure
        ↓
Notification Business Behavior
        ↓
Production Verification
```

### 4.2 Dependencytypen

- **Technical dependency:** server functions, repository/data access en databaseconstraints moeten bestaan voordat betrouwbare UI-integratie kan plaatsvinden.
- **Business-rule dependency:** queue wacht op queue-mechanica; notification behavior wacht op notification events en preferences.
- **Security dependency:** iedere mutation krijgt zelfstandig authentication, authorization, ownership, validation en relevante rate limiting voordat deze publiek of staff-facing wordt gebruikt.
- **Data-integrity dependency:** appointment snapshots en concurrencybescherming moeten onderdeel zijn van één consistente persistence-strategie.
- **Platform dependency:** push delivery bouwt voort op PWA/service-worker-capability; productie-installatie en push moeten op iOS en Android worden gevalideerd.

### 4.3 Parallel voorbereiden

De volgende werkzaamheden kunnen parallel worden voorbereid zonder businessgedrag te verzinnen:

- testharnas en testconventies naast architectuurontwerp;
- repository/service-boundary ontwerp naast settingsanalyse;
- PWA asset- en manifestvoorbereiding naast appointment/lifecyclewerk, maar PWA-validatie blijft een eigen fase;
- notification persistence- en securityontwerp nadat PWA-boundaries bekend zijn, maar vóór concrete notification events.

---

## 5. Fase 1 — Foundation en testinfrastructuur

### Doel

Een gecontroleerde basis leggen waarin server/domain/databasewerk geïsoleerd en herhaalbaar getest kan worden.

**Status: IMPLEMENTED** — afgerond in commit `8ecf2e6` (`test: establish phase 1 test infrastructure`).

### Scope

- testframework en testconventies selecteren en projectmatig invoeren;
- basis voor unit-, integration- en databasegerichte tests voorbereiden;
- bestaande server-only, domain/service/repository en validation boundaries vastleggen;
- relevante testdata- en environment-isolatie definiëren;
- bestaande auth- en databasechecks als eerste testtargets inventariseren.

### Buiten scope

- nieuwe appointment- of notificationfunctionaliteit;
- PWA manifest of service worker implementeren;
- open businessbeslissingen invullen;
- redesign of vervanging van de bestaande UI;
- multi-barber functionaliteit.

### Prerequisites

Geen businessbeslissingen vereist. De zeven projectdocumenten en de huidige auth/databasebasis zijn uitgangspunt.

### Open decisions

Geen blocker voor deze fase. Technische testkeuzes mogen geen productregel introduceren. Alle noodzakelijke booking-configuratiebeslissingen zijn vastgelegd.

### Repository impact

Phase 1 heeft `vitest`, `npm test` en `npm run test:watch` toegevoegd, inclusief `vitest.config.ts`, testconfiguratie en foundation tests voor auth, password, sessions, authorization en auth errors.

### Database impact

Geen productieel schema vereist. Testdatabase-, fixture- of seedstrategie mag alleen worden toegevoegd wanneer die de bestaande data-integriteit beschermt. Geen production migration als onderdeel van deze fase tenzij een afzonderlijk goedgekeurde technische noodzaak ontstaat.

### Security

Tests moeten server-only boundaries, password handling, sessions, CSRF, rate limiting, authorization en ownership kunnen isoleren. Secrets blijven buiten clientbundles en testfixtures.

### Tests

De Phase 1-tests bestaan in de repository en worden uitgevoerd via `npm test`. Phase 1 bevat onder andere auth schema-, error-, password-, session- en authorizationtests.

### Validation

- typecheck: PASS vereist;
- lint: PASS indien tooling aanwezig, anders expliciet `NOT RUN`;
- build: PASS vereist;
- database check: PASS indien databaseconfiguratie beschikbaar is;
- test suite: PASS voor ingevoerde foundation tests;
- volledige diff- en scopecontrole.

### Exit criteria

De Phase 1-exitcriteria zijn behaald: testcommando’s zijn reproduceerbaar, auth/session/authorizationgedrag kan automatisch worden getest, testdata gebruikt geen production secrets en typecheck/build zijn gevalideerd.

### Commit strategy

Eén coherent commit per afgeronde fase, uitsluitend na expliciete opdracht van de gebruiker. Geen commit op een onafgemaakte fase.

---

## 6. Fase 2 — Configuration en settings persistence

### Doel

Barber-configureerbare bedrijfsinstellingen persistent, valideerbaar en server-side beschikbaar maken.

**Status: IMPLEMENTED** — afgerond in commits `15aa87d` (`feat: complete phase 2a configuration foundation`) en `981876f` (`feat: complete phase 2b booking configuration`).

### Scope

- salon information;
- opening hours;
- breaks;
- whole-day blocks;
- buffer;
- cancellation deadline (24 uur);
- barber availability override;
- overlap behavior;
- confirmation behavior (handmatig);
- no-show behavior;
- staff-authorized settings reads/writes;
- audit logging van relevante settingsmutaties.

### Buiten scope

- appointment booking zelf;
- queue-mechanica;
- notification preferences;
- PWA- en pushimplementatie;
- definitieve availabilityberekening;
- services CRUD;
- volledige settings UI tenzij de bestaande roadmap expliciet anders bepaalt.

### Prerequisites

Fase 1.

### Open decisions

Geen blockers voor deze fase. Alle noodzakelijke booking-configuratiebeslissingen zijn vastgelegd:

- buffer: configureerbaar, tussen afspraken;
- cancellation deadline: 24 uur;
- overlap behavior: default blokkeren, configureerbaar;
- confirmation behavior: handmatig;
- no-show behavior: configureerbaar (automatisch of handmatig vrijgeven);
- availability override: configureerbaar voor handmatig door de barber gemaakte/aangepaste afspraken;
- booking horizon: onbeperkt;
- slot interval: geen, dynamische starttijden.

### Repository impact

De repository bevat settings schemas, authorization, service- en Server Function-lagen in `src/settings/`, audit logging en migrations `0002_oval_hitman.sql` en `0003_panoramic_liz_osborn.sql`. De settings persistence is aanwezig; een volledige settings UI en services CRUD vallen buiten deze fase.

### Database impact

- Drizzle-schema uitbreiden waar bestaande tabellen onvoldoende zijn;
- voor iedere schemawijziging een nieuwe migration;
- constraints voor geldige waarden en ranges;
- indexes alleen voor concrete settings/availability queries;
- transactionele writes wanneer één settingsbewerking meerdere records raakt;
- audit logging van gevoelige staff settings;
- geen `slot_interval`-kolom;
- geen `booking_horizon_days`-kolom;
- buffer persistence;
- cancellation deadline persistence;
- overlap behavior persistence;
- confirmation behavior persistence;
- no-show behavior persistence;
- availability override behavior persistence.

Exacte kolommen en tabelnamen zijn implementatiedetails en worden pas gekozen tegen de requirements.

### Security

Settings mutations vereisen `requireStaff()` en server-side inputvalidatie. Client visibility is geen authorization. Gevoelige settings blijven server-side; staff ownership en auditcontext worden server-side bepaald.

### Tests

- settings schema- en rangevalidatie;
- staff/customer authorization;
- settings persistence en transactionele updates;
- whole-day block date behavior;
- timezone-aware settings waar relevant;
- buffer configuration;
- cancellation deadline (24 uur);
- overlap behavior;
- confirmation behavior;
- no-show behavior;
- availability override behavior.

### Validation

Typecheck, build, lint indien beschikbaar, `npm run db:check`, migration inspection, relevante integration tests, authorization tests en staff UI smoke tests.

### Exit criteria

De Phase 2-exitcriteria zijn behaald: de geïmplementeerde settings zijn persistent en server-side gevalideerd, staff-only writes zijn beveiligd en geaudit waar vereist, migrations zijn aanwezig en Phase 2B is uitgevoerd als onderdeel van deze fase.

### Phase 2B — Booking settings persistence

Phase 2B is onderdeel van Phase 2 — Configuration and Settings Persistence, niet als aparte fase.

Phase 2B betreft uitsluitend het persistent maken van de definitief bepaalde booking-configuratie:

- booking settings persistence;
- buffer;
- cancellation deadline (24 uur);
- overlap behavior;
- confirmation behavior;
- no-show release behavior;
- availability override behavior;
- server-side validation;
- staff authorization;
- audit logging.

Phase 2B implementeert **NIET**:

- appointment creation;
- appointment availability engine;
- appointment lifecycle;
- concurrency-safe booking;
- Queue Domain;
- PWA;
- push delivery;
- notification dispatch;
- services CRUD;
- volledige settings UI tenzij de bestaande roadmap expliciet anders bepaalt.

Deze onderdelen blijven in hun bestaande roadmapfasen.

---

## 7. Fase 3 — Appointment domain, persistence en concurrency design

### Doel

Een server-side appointmentdomein implementeren met definitieve persistence en transactionele concurrencybescherming.

**Status: IMPLEMENTED** — afgerond in commit `2d41870` (`feat: complete phase 3 appointment foundation`). Phase 3 bevat appointment create/read/list, transactionele create, PostgreSQL advisory locking, concurrency protection, overlapcontrole, appointment persistence, service snapshots, buffer snapshot, occupied time, lifecycle/domain invariants, authorization, audit logging, migration `0004_unique_wolf_cub.sql` en relevante tests. Availability, booking UI en verdere lifecyclemutaties zijn in Phase 4 of Phase 5 uitgewerkt volgens de roadmap.

### Scope

- appointment create/read/list/update/cancel boundaries ontwerpen;
- customer-, guest- en barber identity modelleren;
- service name, price en duration snapshots vastleggen;
- lifecycle/status transition boundary ontwerpen volgens `BUSINESS_RULES.md`;
- customer ownership en guest access expliciet scheiden;
- concurrency protection ontwerpen en een PostgreSQL/Drizzle-geschikte oplossing selecteren;
- transactionele booking/update-workflow ontwerpen;
- overlap behavior koppelen aan configureerbare businessregel.

### Buiten scope

- concrete implementatie van availability slots;
- queuegedrag;
- notification events;
- PWA/service worker;
- nieuwe appointment-statussen.

### Prerequisites

Fase 1. Fase 2 voor settings die de appointmentworkflow nodig heeft. Concurrency design moet vóór definitieve booking persistence gereed zijn.

### Open decisions

- overlap behavior moet vaststaan vóór de uiteindelijke conflictworkflow;
- cancellation deadline is 24 uur;
- no-show behavior is configureerbaar (automatisch of handmatig vrijgeven);
- booking horizon is onbeperkt;
- slot interval is dynamisch (geen vast interval).

### Repository impact

Waarschijnlijk relevant: `src/db/schema/appointments.ts`, `src/db/schema/services.ts`, `src/db/schema/users.ts`, `src/auth/authorization.ts`, `src/auth/auth.functions.ts`, `src/routes/_customer/`, `src/routes/_staff/`, `src/pages/Booking.tsx`, `src/pages/MyBookings.tsx`, `src/pages/StaffAppointments.tsx` en transitional `src/auth/AppointmentContext.tsx`.

### Database impact

- appointment persistence-workflows in server/domain code;
- migration `0004_unique_wolf_cub.sql` met Phase 3 appointmentvelden en constraints;
- immutable service snapshots, buffer snapshot en occupied time;
- transactionele create-flow met PostgreSQL `pg_advisory_xact_lock(hashtextextended(...))` vóór overlapquery en insert;
- `SELECT FOR UPDATE` op alleen bestaande conflictrijen is niet de gekozen strategie;
- relevante appointmentmutaties worden server-side geaudit.

### Security

Elke Server Function valideert input, authenticatie, authorization, ownership, status transition en relevante business rules zelfstandig. Guest booking krijgt een expliciete boundary; guestgegevens geven geen algemene toegang tot appointments. CSRF, rate limiting en gevoelige responses worden beoordeeld.

### Tests

- snapshot immutability;
- customer ownership en guest isolation;
- barber authorization;
- appointment create/read/update/cancel boundaries;
- status transition matrix uit de business rules;
- transaction rollback;
- concurrerende create/update requests met conflict en zonder bestaand conflictrij;
- historische appointmentdata.

### Validation

Typecheck, build, lint indien beschikbaar, database/migration checks, integration tests, authorization/security review en expliciete concurrency tests tegen een echte PostgreSQL-compatibele omgeving.

### Exit criteria

De Phase 3-exitcriteria zijn behaald: de concurrencystrategie is gekozen en getest, appointment persistence is transactioneel, snapshots worden consistent opgeslagen, guest/customer/barber boundaries zijn server-side getest, lifecycle-invarianten zijn afgedwongen en persistence is niet afhankelijk van `AppointmentContext` als bron van waarheid.

### Commit strategy

Eén coherent commit per afgeronde fase. Geen commit voordat concurrency design, persistence en tests samen afgerond zijn.

---

## 8. Fase 4 — Availability en concurrency-safe booking

### Doel

Een server-authoritative availability-engine en transactionele booking-flow bouwen die alleen volledig passende, geldige appointment ranges accepteert.

**Status: IMPLEMENTED** — afgerond in commit `f12245f` (`feat: complete phase 4 availability and booking`).

### Scope

- service duration;
- opening hours en gesloten dagen;
- breaks;
- whole-day blocks;
- buffer;
- minimum lead time: geen minimum, zolang het moment beschikbaar is;
- bestaande appointments en relevante statussen;
- cancelled appointments niet als bezette capaciteit behandelen;
- full duration fit;
- `Europe/Amsterdam`, datumgrenzen en DST;
- barber overrides;
- configureerbaar overlapgedrag;
- customer booking inclusief guest booking;
- server-side revalidatie bij create/update;
- timezone utilities voor `Europe/Amsterdam`;
- minute-precision technische candidate generation; dit is geen vaste business slot interval;
- publieke `/booking` route en server-driven booking UI;
- concurrency-safe booking via de Phase 3 transactionele advisory-lockstrategie;
- DST spring-forward/fall-back, datumgrenzen en relevante availability/concurrencytests.

### Buiten scope

- notification events;
- queue business behavior;
- PWA offline functionaliteit;
- redesign van de booking UI.

### Prerequisites

Fase 2 voor settings, fase 3 voor appointment persistence en concurrencystrategie. Cancellation deadline en overlapgedrag moeten zijn besloten voordat het betreffende gedrag als definitief wordt geïmplementeerd.

### Open decisions

Geen blockers voor deze fase. De vastgelegde beslissingen zijn geïmplementeerd:

- cancellation deadline: 24 uur;
- no-show behavior: configureerbaar (automatisch of handmatig vrijgeven);
- overlap behavior: default blokkeren, configureerbaar;
- booking horizon: onbeperkt;
- slot interval: dynamisch, geen vast interval;
- minimum lead time: geen minimum;
- ambiguous local time tijdens de `Europe/Amsterdam` fall-back gebruikt de vroegste geldige absolute instantie;
- dezelfde lokale kloktijd wordt slechts één keer als booking slot aangeboden.

De geen-minimum-lead-time-regel is reeds besloten en mag niet worden vervangen door een technische default.

### Repository impact

Phase 4 gebruikt `src/timezone.ts`, `src/availability/`, de appointment service/functions/schemas, `src/pages/Booking.tsx`, `src/routes/booking.tsx`, de route-tree en relevante timezone, availability en concurrencytests. De oude customer booking route is verwijderd. De bestaande mobile-first UI is server-driven aangesloten zonder redesign.

### Database impact

- transactionele availability-revalidatie plus appointment-write;
- database-/transactionele concurrencybescherming uit Phase 3;
- geen nieuwe migration in Phase 4;
- geen nieuwe hardcoded availabilitywaarden;
- bestaande schema’s, settings en indexes worden gebruikt.

### Security

Customer en guest input wordt volledig server-side gevalideerd. Guest booking mag geen bestaande afspraken ontsluiten. Customers mogen geen barber override uitvoeren. Publieke booking mutations krijgen passende rate limiting en CSRF-bescherming waar van toepassing.

### Tests

- duration fit aan sluitingstijd en break boundaries;
- opening hours, gesloten dagen en whole-day blocks;
- buffer between appointments;
- same-day booking zonder minimum lead time;
- cancelled appointments;
- `Europe/Amsterdam`, DST en lokale datumgrenzen;
- customer versus guest versus barber permissions;
- overlap en gelijktijdige requests;
- barber override buiten normale availability.

### Validation

Unit/domain tests, integration tests met database, concurrency tests, typecheck, build, lint indien beschikbaar, migration checks en browser tests voor server-derived availability. Een eerder getoond slot is nooit voldoende bewijs zonder serverrevalidatie.

### Exit criteria

De Phase 4-exitcriteria zijn behaald: availability is server-authoritative, volledige serviceduur plus buffer wordt gecontroleerd, booking wordt transactioneel gerevalideerd, race conditions zijn getest, `/booking` is publiek geregistreerd met een expliciete server boundary en timezone/DST plus cancelled capacity zijn getest.

### Commit strategy

Eén coherent commit per afgeronde fase, alleen na expliciete opdracht.

---

## 9. Fase 5 — Appointment lifecycle en management

### Doel

De volledige server-side appointment lifecycle en operationele barber/customer-acties aansluiten op de afgesproken business rules.

**Status: IMPLEMENTED** — Phase 5 bevat server-side lifecyclemutaties (status update, modification, cancellation, cancellation requests), transactionele concurrency via de bestaande advisory-lockstrategie, een `cancellation_requests`-tabel met migration `0005_cold_cardiac.sql`, audit events voor lifecycleacties, server functions, en de customer/staff UI aangesloten op serverdata. `AppointmentContext` en appointment mock data zijn verwijderd.

### Scope

- create, read/list en detail;
- customer appointment retrieval en ownership;
- guest bookingresultaat en veilige toegang tot de eigen bookingcontext;
- barber-created appointments;
- customer modification;
- barber modification;
- cancellation;
- cancellation request na de deadline;
- online confirmation behavior (`new` en bevestiging volgens configuratie);
- `in_progress`;
- completion;
- no-show en geconfigureerd slot-releasegedrag;
- terminal states;
- historische immutability en snapshots;
- operationele audit logging.

### Buiten scope

- queue-mechanica;
- concrete notification events en push delivery;
- PWA-installatie;
- nieuwe statussen of niet-besloten transitions.

### Prerequisites

Fase 3 en 4. Cancellation deadline, no-show behavior, confirmation behavior en overlap behavior moeten vóór het betreffende gedrag zijn besloten.

### Open decisions

- cancellation deadline: 24 uur;
- no-show behavior: configureerbaar (automatisch of handmatig vrijgeven);
- confirmation behavior: handmatig;
- status-transitiondetails die niet in de business rules staan blijven open.

### Repository impact

Waarschijnlijk relevant: `src/routes/_customer/`, `src/routes/_staff/`, `src/pages/MyBookings.tsx`, `src/pages/StaffAppointments.tsx`, `src/components/BookingCard.tsx`, `src/auth/AppointmentContext.tsx`, auth helpers, appointment schema en auditcode.

### Database impact

Transactionele status- en wijzigingsworkflows, snapshotbehoud, lifecycle timestamps, relevante indexes en audit records. Geen destructieve wijziging van historische appointments. Nieuwe schemawijzigingen krijgen nieuwe migrations.

### Security

Customers wijzigen of annuleren alleen eigen afspraken volgens de business rules. Staff-acties vereisen `requireStaff()`. Guest access is beperkt tot de betreffende bookingcontext. Iedere mutation controleert opnieuw status, ownership, availability en business rules.

### Tests

- volledige lifecycle en terminal states;
- customer/barber ownership en permissions;
- customer modification naar datum, tijd en service;
- cancellation deadline en cancellation request;
- confirmation behavior;
- no-show configuration;
- snapshot- en historische immutability;
- audit logging en veilige foutresponses.

### Validation

Typecheck, build, lint indien beschikbaar, database checks, integration/server-function tests, security review en browser smoke tests voor customer/staff flows.

### Exit criteria

- alle besloten lifecycle-acties zijn server-side beschikbaar;
- terminale appointments zijn niet via de normale flow wijzigbaar;
- snapshots veranderen niet door actuele servicewijzigingen;
- customer-, guest- en staffrechten zijn getest;
- cancellation, confirmation en no-show volgen uitsluitend vastgelegde business rules.

### Commit strategy

Eén coherent commit per afgeronde fase; geen partial lifecycle-commit als de afgesproken security- en testscope ontbreekt.

---

## 10. Fase 6 — Server-driven UI integration

### Doel

De bestaande design-leading UI geleidelijk aansluiten op echte serverdata zonder redesign.

**Status: IMPLEMENTED** — afgerond in commit `5a13653` (`feat: complete phase 6 server-driven UI integration`).

### Scope

- `Booking` op server-derived services, availability en guest/customer flow aansluiten;
- `MyBookings` op echte appointments, wijzigen, annuleren en requests aansluiten;
- `StaffAppointments` op server lifecycle en settings aansluiten;
- `Queue` voorbereiden op de latere server queue-boundary;
- `CustomerProfile` en `StaffProfile` op echte profile/settingsdata aansluiten waar relevant;
- staff dashboard op server-derived metrics aansluiten waar de benodigde domeindata bestaat;
- mock/transitional state per aangesloten domein verwijderen of vervangen;
- loading, error, empty en success states behouden en verbeteren binnen bestaande stijl.

### Buiten scope

- generieke component library;
- nieuw design system;
- onnodig redesign;
- PWA install UX als afzonderlijke feature;
- notification settings zolang business rules open zijn.

### Prerequisites

Fase 4 voor booking/availability en fase 5 voor lifecycle. Queue-UI blijft beperkt zolang queue business rules niet zijn besloten.

### Open decisions

Geen nieuwe productbeslissingen. Open queue- en notificationbeslissingen mogen niet als UI-default worden ingevuld.

### Repository impact

Waarschijnlijk relevant: `src/pages/Booking.tsx`, `src/pages/MyBookings.tsx`, `src/pages/StaffAppointments.tsx`, `src/pages/Queue.tsx`, `src/pages/StaffQueue.tsx`, `src/pages/CustomerProfile.tsx`, `src/pages/StaffProfile.tsx`, `src/pages/StaffDashboard.tsx`, `src/components/`, `src/auth/AppointmentContext.tsx`, `src/auth/WaitingListContext.tsx` en `src/data/mockData.ts`.

### Database impact

Geen nieuwe databasewijziging uitsluitend voor presentatie. UI gebruikt bestaande server functions en persistence. Eventuele ontbrekende schemawijziging hoort bij het betreffende domein en niet als UI-workaround te worden toegevoegd.

### Security

UI guards en disabled buttons zijn geen security boundary. Server responses worden veilig weergegeven; technische databasefouten, secrets en gevoelige data worden niet gelekt.

### Tests

- server-driven booking/customer/staff flows;
- loading/error/empty/success states;
- ownership en unauthorized UI actions;
- guest booking UX zonder verplicht account;
- responsive mobile-first behavior;
- accessibility van forms, dialogs, statuslabels en navigation.

### Validation

Typecheck, build, lint indien beschikbaar, relevante integration tests, browser tests op mobile viewport en desktop wrapper, plus visuele regressiecontrole tegen bestaande UI.

### Exit criteria

- de genoemde schermen gebruiken geen mockdata als productbron voor aangesloten domeinen;
- bestaande visual language, navigation en mobile-first layout zijn behouden;
- serverfouten en security boundaries zijn correct verwerkt;
- guest booking en appointment ownership zijn niet door UI alleen geregeld;
- accessibility- en responsive checks zijn uitgevoerd.

### Commit strategy

Eén coherent commit per afgeronde UI-integratiefase of aantoonbaar zelfstandig domein, uitsluitend na expliciete opdracht.

---

## 11. Fase 7 — Queue domain

### Doel

De queue van prototypegedrag naar een server-side domein brengen, maar pas nadat de operationele queue-mechanica expliciet is besloten.

**Status:** Phase 7A — Queue Domain Foundation en Phase 7B — Queue Server Functions Boundary zijn geïmplementeerd. Queue UI-integratie resteert.

### Scope

- queue domain model;
- persistence en lifecycle;
- customer join/leave/read;
- barber beheer en statusacties;
- relatie tussen queue en appointments;
- server functions;
- authorization, ownership en guest/customer identity;
- UI integration van customer- en staffqueue;
- audit logging waar operationeel relevant.

### Buiten scope

- queue behavior op basis van aannames;
- automatische promotie of oproeptijden zonder besluit;
- appointment notifications zonder notification decision;
- multi-barber queuecapaciteit.

### Prerequisites

Fase 1 voor tests en fase 6 voor gedeelde UI-boundaries. Queue business rules moeten eerst expliciet worden besloten.

### Open decisions

De volgende beslissingen zijn harde blockers voor het betreffende gedrag:

- wanneer iemand in de queue komt;
- relatie tussen queue en appointments;
- wanneer iemand wordt opgeroepen;
- wanneer iemand vervalt;
- definitief statusmodel;
- eventuele automatische promotie.

Tot die tijd kunnen alleen persistence- en securityontwerp op capabilityniveau worden voorbereid.

### Repository impact

Waarschijnlijk relevant: `src/db/schema/waiting-list.ts`, `src/auth/WaitingListContext.tsx`, `src/pages/Queue.tsx`, `src/pages/StaffQueue.tsx`, queue routes, `src/db/schema/services.ts`, authorization en auditcode.

### Database impact

De bestaande `waiting_list_entries`-basis kan worden uitgebreid of aangesloten. Nieuwe schemawijzigingen lopen via Drizzle/migrations. Constraints en indexes moeten de besloten status- en orderingregels ondersteunen. Retention en lifecycle worden niet zelf verzonnen.

### Security

Customer/guest ownership, staff authorization, inputvalidatie, privacy van queuegegevens, rate limiting van publieke join-acties en audit logging worden server-side afgedwongen.

### Tests

- besloten queue state machine;
- customer/guest/barber permissions;
- duplicate active entry rules;
- queue/appointment relationship;
- expiry, call, cancellation en promotion zodra besloten;
- persistence en concurrente join/update-acties.

### Validation

Typecheck, build, lint indien beschikbaar, database/migration checks, integration tests, concurrency tests voor queue writes, security review en browser tests.

### Exit criteria

- alle queue-mechanica zijn vooraf vastgelegd;
- mock queue is vervangen door server-authoritative data;
- persistence, authorization en lifecycle zijn getest;
- relatie met appointments is expliciet en getest;
- geen queuegedrag komt uitsluitend uit bestaande demo-code.

### Commit strategy

Eén coherent commit voor de afgeronde queuefase, uitsluitend na expliciete opdracht.

---

## 12. Fase 8 — PWA foundation

### Doel

Centro Kapper technisch installable maken als Progressive Web App op ondersteunde iOS- en Android-platformen.

### Scope

- web app manifest;
- app icons en bestaande branding;
- veilige HTTPS-deploymentaannames;
- service worker;
- installability;
- routing behavior;
- caching strategy;
- update lifecycle;
- iOS-installatiegedrag;
- Android-installatiegedrag;
- mobile-first install UX binnen bestaande UI.

Offline functionaliteit wordt niet automatisch uitgebreid tot de hele applicatie.

### Buiten scope

- native iOS- of Android-apps;
- volledige offline werking;
- offline data sync;
- background synchronization;
- push notification events of deliverydomain.

### Prerequisites

De bestaande webapp en productiebuild moeten stabiel genoeg zijn om als PWA te verpakken. Offline scope en background sync zijn niet nodig voor installability, maar blijven open voor elk gedrag dat daarvan afhankelijk is.

### Open decisions

- offline functionality;
- welke gegevens offline mogen zijn;
- background synchronization;
- nog niet besloten cache- en update lifecycle details.

Deze beslissingen blokkeren niet noodzakelijk een minimale installable PWA, maar blokkeren ieder offline- of background-syncgedrag.

### Repository impact

Waarschijnlijk relevant: `index.html`, `src/routes/__root.tsx`, `vite.config.ts`, `package.json`, `src/assets/`, bestaande routing en `src/styles/theme.css`. Er bestaan momenteel geen manifest-, public- of service-workerbestanden; toekomstige bestandsnamen worden pas bij implementatie bepaald.

### Database impact

Geen verplichte databasewijziging voor installability. Offline persistence of background sync mag pas worden ontworpen nadat de businessbeslissingen daarover zijn vastgelegd; eventuele datawijzigingen volgen dan afzonderlijk via Drizzle.

### Security

HTTPS is vereist voor installatie en runtimeaannames. Service-worker scope, cache-inhoud en updategedrag mogen geen private customer/staffdata of secrets onveilig cachen. Authenticated data blijft server-authoritative.

### Tests

- manifest validity en installability;
- service-worker registration, scope en update lifecycle;
- routing na installatie en refresh;
- cachegedrag en veilige invalidatie;
- mobile-first install UX;
- iOS en Android op echte devices;
- HTTPS production-like deployment.

### Validation

Typecheck, build, lint indien beschikbaar, manifest/service-worker inspection, production build, installability checks, routing smoke tests, HTTPS validation en device tests op iOS en Android. Een lokale development build alleen is onvoldoende.

### Exit criteria

- manifest en service worker zijn aanwezig en correct gekoppeld;
- de app is installable via HTTPS op de ondersteunde testplatformen;
- routing en update lifecycle zijn gecontroleerd;
- cachestrategie lekt geen gevoelige data;
- iOS- en Android-beperkingen zijn expliciet getest en gedocumenteerd;
- offline functionaliteit is niet stilzwijgend als requirement toegevoegd.

### Commit strategy

Eén coherent PWA-commit na volledige installability- en devicevalidatie, uitsluitend na expliciete gebruikersopdracht.

---

## 13. Fase 9 — Push delivery infrastructure

### Doel

De server-side infrastructuur bouwen waarmee meerdere push subscriptions per user veilig kunnen worden beheerd en bereikt.

### Scope

- push subscription creation en revocation;
- user association en subscription/device identification;
- persistent subscription data;
- platforminformatie wanneer technisch nodig;
- active/inactive state;
- invalid/expired subscription cleanup;
- multiple devices/subscriptions per user;
- server-side dispatch boundary;
- service-worker push handling;
- secure push credentials server-side;
- delivery failure/retry mechanism als technische capability, zonder business-eventkeuze.

### Buiten scope

- concrete notification events;
- notification timing, mandatory/optional classification;
- notification preferences;
- notification content policy buiten privacy/security;
- native apps;
- client-only delivery.

### Prerequisites

Fase 8 PWA foundation. Fase 1 testinfrastructuur. Notification business decisions zijn niet nodig voor subscription lifecycle en delivery-boundary, maar wel voor eventgedrag.

### Open decisions

- failure/retry behavior is een blocker voor definitieve retrysemantiek;
- retention/logging is een blocker voor definitieve delivery history;
- notification events en preferences blokkeren deze infrastructuur niet, maar blokkeren concrete event dispatch.

### Repository impact

Waarschijnlijk relevant: service-workerlaag uit fase 8, auth/session helpers, server-only modules, `src/db/schema/`, `src/db/client.server.ts`, auditcode en toekomstige notification/domain boundaries. Er bestaat momenteel geen pushcode of subscriptiontabel.

### Database impact

- nieuwe persistence-capability voor user association, endpoint/subscriptiondata, device/platforminformatie en lifecycle timestamps;
- active/inactive en invalid/expired state;
- meerdere subscriptions per user;
- passende unique/indexstrategie tegen echte lookup- en cleanupqueries;
- gevoelige subscriptiongegevens passend beschermen;
- eventuele notification delivery records blijven optioneel totdat retention/logging is besloten;
- schemawijzigingen uitsluitend via nieuwe Drizzle migrations.

### Security

Subscription mutations vereisen server-side authentication en ownership. Push credentials blijven server-only. Dispatch controleert user authorization, subscription ownership en privacy. Endpoints en payloads worden niet onnodig naar andere users gelekt. Rate limiting en audit logging worden voor subscriptionmutaties beoordeeld.

### Tests

- subscription create/update/revoke;
- multiple devices per user;
- ownership en unauthorized subscription access;
- invalid/expired cleanup;
- server-side dispatch zonder actieve browserpagina;
- service-worker ontvangst;
- credentials niet in clientbundles;
- failure/retry behavior zodra gekozen.

### Validation

Typecheck, build, lint indien beschikbaar, migration/schema checks, integration tests, security review, service-worker tests, production-like HTTPS push tests op iOS en Android waar ondersteund.

### Exit criteria

- subscriptions zijn persistent en user-bound;
- meerdere devices werken zonder overschrijven van elkaar;
- invalid/expired subscriptions worden beheersbaar opgeschoond;
- dispatch is server-side en credentials zijn niet client-side;
- service worker kan delivery ontvangen;
- failure/retry- en retentionkeuzes zijn expliciet vastgelegd voordat definitieve semantiek wordt geclaimd.

### Commit strategy

Eén coherent commit voor de delivery-infrastructuur, alleen na expliciete opdracht.

---

## 14. Fase 10 — Notification business behavior

### Doel

Besloten notification business rules vertalen naar gecontroleerde events, preferences en deliverygedrag.

### Scope

- expliciet besloten notification events;
- event triggers en timing;
- verplicht versus optioneel;
- configureerbare user notification preferences;
- notification payload/privacyregels;
- koppeling van application event naar notification domain en delivery;
- logging/audit/retention volgens expliciete beslissing;
- failure/retry volgens expliciet gekozen beleid.

### Buiten scope

- events die nog niet zijn besloten;
- automatische appointment reminders, confirmations of cancellations als die niet expliciet zijn vastgesteld;
- offline functionaliteit;
- wijzigingen aan bestaande UI buiten noodzakelijke notification UX.

### Prerequisites

Fase 8 en 9. De notification business rules moeten vóór eventimplementatie zijn vastgelegd in `BUSINESS_RULES.md`.

### Open decisions

Alle notification open decisions zijn blockers voor het betreffende gedrag:

- notification events;
- verplichte versus optionele notifications;
- user notification preferences;
- failure/retry behavior;
- notification retention en delivery logging.

Tot besluitvorming kunnen alleen event-onafhankelijke delivery- en securityboundaries worden gebouwd.

### Repository impact

Waarschijnlijk relevant: appointment lifecycle/server functions, queue/server functions zodra aanwezig, PWA service worker, notification delivery infrastructure, auth/authorization, audit logging en UI notification settings wanneer later vereist. Concrete toekomstige bestandsnamen worden niet vooraf als bestaande structuur beschouwd.

### Database impact

Gebruik de subscription persistence uit fase 9. Notification records/delivery logging worden alleen als schema en migration toegevoegd wanneer de businessbeslissing dit vereist. Retention, indexes en cleanup worden daarop afgestemd.

### Security

Iedere notification wordt server-side geautoriseerd tegen de bedoelde user en context. Payloads bevatten niet meer privacygevoelige informatie dan nodig. Secrets blijven server-only. De client mag geen event, recipient of deliverystatus manipuleren.

### Tests

- event trigger- en timingregels;
- mandatory/optional behavior;
- notification preferences;
- unauthorized delivery prevention;
- privacy van payloads;
- multiple subscriptions;
- invalid cleanup;
- retry/failure;
- audit/logging en retention.

### Validation

Typecheck, build, lint indien beschikbaar, integration tests met database, server-function/security tests, service-worker tests, delivery tests en platformtests op ondersteunde iOS/Android devices.

### Exit criteria

- alleen expliciet besloten events worden geproduceerd;
- recipient, payload, preferences en timing zijn server-side correct;
- unauthorized of privacygevoelige delivery is uitgesloten;
- retry, cleanup en retention volgen vastgelegde keuzes;
- notification behavior werkt met meerdere subscriptions;
- concrete eventgedrag is niet gebaseerd op roadmap-aannames.

### Commit strategy

Eén coherent commit per afgeronde notification business scope, uitsluitend na expliciete opdracht.

---

## 15. Fase 11 — Deployment en production verification

### Doel

De volledige applicatie, PWA en pushketen in een production-like omgeving verifiëren.

### Scope

- production environment;
- environment variables en secret management;
- database migrations;
- HTTPS;
- production build;
- routing;
- authentication en authorization smoke tests;
- customer en guest booking;
- appointment lifecycle;
- queue waar geïmplementeerd;
- PWA installability en service worker;
- iOS en Android;
- push credentials/configuration;
- subscription lifecycle en delivery;
- logging, audit en failure monitoring;
- security smoke tests.

### Buiten scope

- nieuwe businessbeslissingen tijdens deployment;
- native app packaging;
- offline/background sync als deze niet besloten en geïmplementeerd zijn;
- functionaliteit die niet in eerdere fases is afgerond.

### Prerequisites

Alle relevante eerdere fases en open decisions voor de gedeployde scope zijn afgerond. De deploymentomgeving moet HTTPS en veilige server-side secrets ondersteunen.

### Open decisions

Geen nieuwe beslissingen mogen tijdens deployment worden ingevuld. Niet-besloten gedrag blijft disabled of buiten de gedeployde scope.

### Repository impact

Deploymentconfiguratie, environment/documentation en bestaande scripts kunnen relevant zijn. `package.json`, routes, migrations en code worden in deze planningsfase niet gewijzigd; implementatie gebeurt pas in afzonderlijke goedgekeurde tasks.

### Database impact

Alle goedgekeurde migrations worden gecontroleerd, toegepast via het afgesproken deploymentproces en daarna gevalideerd. Productiedata, snapshots, subscription lifecycle en audit logs worden niet destructief gemigreerd.

### Security

Controleer HTTPS, secrets, cookies, CSRF, rate limiting, authorization, guest isolation, appointment ownership, push credentials, payload privacy, logging en server/client boundaries.

### Tests

- end-to-end critical flows;
- production database migration checks;
- concurrency smoke/regression tests waar uitvoerbaar;
- PWA install/update tests;
- iOS/Android device tests;
- push delivery, cleanup en failure tests;
- security smoke tests.

### Validation

Een lokale `build` alleen is onvoldoende. Vereist zijn production build, deployment smoke tests, HTTPS-installability, service-worker/update checks, echte iOS- en Android-device tests, push tests en gecontroleerde databasevalidatie.

### Exit criteria

- alle gedeployde requirements zijn aantoonbaar bereikbaar;
- database migrations en environment secrets zijn correct;
- PWA installability en routing werken op de ondersteunde platformen;
- push delivery, subscription lifecycle en privacy zijn gevalideerd;
- kritieke booking-, lifecycle-, security- en concurrencytests zijn geslaagd;
- bekende beperkingen en niet-geïmplementeerde open decisions zijn expliciet gerapporteerd.

### Commit strategy

Deployment verification is geen automatische commit- of pushactie. Een releasecommit gebeurt alleen na expliciete gebruikersopdracht en na volledige diff-, security- en validatiecontrole.

---

## 16. Geconsolideerde open decisions matrix

| Decision | Needed before | Blocking? | Current status | Owner/action |
|---|---|---:|---|---|
| Cancellation deadline (24 uur) | Customer cancellation en requests | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` bijgewerkt |
| No-show release behavior | No-show lifecycle en availability | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` bijgewerkt |
| Overlap behavior (default blokkeren) | Appointment conflict handling | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` bijgewerkt |
| Confirmation behavior (handmatig) | Online booking confirmation | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` bijgewerkt |
| Buffer | Availability berekening | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` bijgewerkt |
| Queue entry-mechanica | Queue domain | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` sectie 20 bijgewerkt |
| Queue-relatie met appointments | Queue domain | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` sectie 20 bijgewerkt |
| Queue oproepen/vervallen/statusmodel/promotie | Queue lifecycle | Nee — vastgelegd | BESLOTEN | `BUSINESS_RULES.md` sectie 20 bijgewerkt |
| Notification events | Notification business behavior | Ja voor events | OPEN | Product owner beslist en werkt business rules bij |
| Verplicht versus optioneel notifications | Notification business behavior | Ja voor delivery policy | OPEN | Product owner beslist |
| Notification preferences | Preference UX en dispatch | Ja voor preferencegedrag | OPEN | Product owner beslist |
| Failed delivery/retry behavior | Definitieve delivery semantics | Ja voor retryclaims | OPEN | Architectuur/productbeslissing vastleggen |
| Notification retention/delivery logging | Delivery history en schema | Ja voor logging/retention | OPEN | Product- en architectuurbeslissing vastleggen |
| Offline functionality | Offline behavior | Alleen voor offline | OPEN | Expliciet productbesluit; blokkeert installability niet |
| Welke data offline beschikbaar mag zijn | Offline cache/data | Ja voor offline data | OPEN | Product- en privacybeslissing |
| Background synchronization | Background sync | Alleen voor background sync | OPEN | Expliciet productbesluit |
| PWA cache/update lifecycle details | Definitieve cache/update behavior | Alleen voor die details | OPEN | Architectuur- en productbeslissing vóór implementatie van dat gedrag |

### Wat kan zonder deze beslissingen?

- Fase 1 kan volledig worden uitgevoerd.
- Fase 2 (Configuration en settings persistence) kan volledig worden uitgevoerd;
- alle noodzakelijke booking-configuratiebeslissingen zijn vastgelegd.
- Test- en securityboundaries kunnen worden voorbereid.
- Settings- en persistence-ontwerp kan worden voorbereid.
- Appointment concurrency design kan worden uitgewerkt.
- PWA installability kan technisch worden voorbereid zonder volledige offline support.
- Push subscription lifecycle kan worden ontworpen zonder concrete notification events.

### Eerstvolgende implementatiefase

Phase 7A — Queue Domain Foundation en Phase 7B — Queue Server Functions Boundary zijn afgerond. Queue UI-integratie resteert als volgende queue-werkstroom. Phase 1 t/m Phase 6 zijn afgerond (laatste commit vóór Phase 7: `5a13653`). Queue businessregels zijn definitief besloten in `BUSINESS_RULES.md`. Notification events en offline behavior blijven door hun respectieve open beslissingen begrensd.

---

## 17. Global completion criteria

### Technisch compleet

Het traject is technisch compleet wanneer:

- authentication, sessions, CSRF, rate limiting en audit logging operationeel zijn;
- server-side authorization, ownership en client/server boundaries zijn afgedwongen;
- services, settings, appointments, availability en queue persistent via serverfuncties werken;
- appointment writes concurrency-safe zijn;
- PWA manifest, service worker, HTTPS-installability en update lifecycle zijn gevalideerd;
- push subscriptions, multiple devices, dispatch, cleanup en credentials veilig werken;
- automated unit-, integration-, concurrency-, PWA- en push-tests bestaan.

### Functioneel compleet

Het traject is functioneel compleet wanneer de besloten requirements werken voor:

- customer en guest booking;
- barber-created en barber-managed appointments;
- availability met duration, opening hours, breaks, whole-day blocks, buffer, timezone/DST, cancelled capacity en overrides;
- appointment lifecycle, modification, cancellation, cancellation requests, confirmation, completion en no-show;
- service snapshots en historische immutability;
- queue volgens expliciet besloten businessregels;
- salon- en barber-configureerbare settings;
- PWA-installatie op ondersteunde iOS- en Android-devices;
- web push notifications volgens expliciet besloten events, preferences en deliveryregels;
- responsive mobile-first UI zonder onnodig redesign.

### Production-ready

De applicatie is production-ready wanneer technisch en functioneel complete scope daarnaast:

- via HTTPS is gedeployed;
- migrations en secrets gecontroleerd zijn toegepast;
- production build en routing werken;
- echte iOS- en Android-devicevalidatie is uitgevoerd;
- PWA installability, service worker updates en push delivery zijn gevalideerd;
- security, privacy, logging, failure handling en concurrency zijn gereviewd;
- open beslissingen geen gedeployde functionaliteit onduidelijk maken;
- bekende beperkingen expliciet zijn gerapporteerd.

---

## 18. Roadmapregels

- Eén coherent commit per afgeronde fase; nooit halverwege een onafgemaakte fase.
- De implementerende agent commit alleen na expliciete gebruikersopdracht.
- Geen open businessbeslissing wordt als default, enumwaarde, timing, UX-flow of retrybeleid geïmplementeerd.
- Concurrency design en validatie gaan vóór definitieve appointment booking persistence.
- Guest booking blijft onderdeel van de booking-domain.
- PWA-foundation gaat vóór push delivery infrastructure.
- Push delivery infrastructure gaat vóór notification business behavior.
- De bestaande UI wordt aangesloten, niet automatisch vervangen of redesigned.
- Geen native iOS/Android-app en geen multi-barbermodel zonder expliciete requirement.
- Offline functionality wordt niet als verplicht behandeld zolang die beslissing openstaat.
- Iedere fase rapporteert scope, database-impact, security, tests, validation, exit criteria en resterende risico’s.
