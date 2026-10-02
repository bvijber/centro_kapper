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

De technische rolbenamingen `customer` en `staff` blijven bestaan waar de code die gebruikt. Er wordt geen multi-barber scheduling-, assignment- of staff-availabilitymodel toegevoegd zonder expliciete requirement.

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

Scripts in `package.json` zijn `dev`, `build`, `typecheck`, `preview`, `db:check`, `db:generate` en `auth:create-staff`. Er is geen testscript, migratie-toepasscript, seedscript of production-startscript in `package.json`.

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
- `scripts/`: operationele scripts, momenteel `create-staff.ts`.

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
- staff: `/staff`, `/staff/appointments`, `/staff/queue`, `/staff/profile`.

`src/routes/_customer.tsx` en `src/routes/_staff.tsx` zijn pathless layouts. Zij roepen in een server loader `getCurrentUserFn()` aan, redirecten op basis van de rol en renderen daarnaast een client-side `RequireAuth` guard.

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

Server Functions voor appointment creation, retrieval, listing en lifecycle, staff settings en de queue-boundary bestaan. Services CRUD en availability Server Functions bestaan nog niet.

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
- Sessies zijn database-backed.
- Een random token van 32 bytes wordt base64url-gecodeerd.
- Alleen de SHA-256 hash van het sessietoken wordt opgeslagen.
- De cookie heet `ck_session`.
- De cookie is `HttpOnly`, `SameSite=Lax`, heeft path `/` en is `Secure` in production.
- Customer sessions hebben een lifetime van 30 dagen.
- Staff sessions hebben een lifetime van 7 dagen.
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
- `requireStaff()`;
- `requireOwnership()`.

Deze helpers zijn de basis voor toekomstige domeinmutaties. De bestaande `authMiddleware` in `src/auth/middleware.ts` is momenteel niet aan Server Functions gekoppeld.

---

## 9. Authorization

**ARCHITECTURE RULE**

- Een customer mag alleen eigen customer-data beheren.
- Een customer mag alleen eigen afspraken lezen, wijzigen of annuleren volgens `BUSINESS_RULES.md`.
- Een guest krijgt geen ongecontroleerde toegang tot bestaande customer appointments.
- Staff/barber mag relevante salon- en afspraakdata beheren volgens de business rules.
- Staff-only mutations vereisen server-side `requireStaff()`.
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
- `customer_profiles` en `staff_profiles`;
- `services`;
- `appointments`;
- `business_profile`, `opening_hours` en `break_periods`;
- `waiting_list_entries`;
- `audit_logs`;
- `rate_limits`.

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
- queue identity, actieve-entry en ordering constraints;
- indexes voor sessies, afspraken, services, queues, audit en rate limits.

### 10.3 Migrations

**CURRENT**

`drizzle/0000_breezy_vanisher.sql` maakt de hoofdtabellen en constraints aan. `drizzle/0001_grey_brood.sql` voegt rate limits en bijbehorende indexes toe. `0002_oval_hitman.sql` voegt whole-day blocks toe, `0003_panoramic_liz_osborn.sql` booking settings en `0004_unique_wolf_cub.sql` de Phase 3 appointmentvelden. Overlap wordt transactioneel beschermd met PostgreSQL advisory locks in de appointment service.

**ARCHITECTURE RULE**

Applicatielogica en databaseconstraints vullen elkaar aan. Database access blijft server-only. Schemawijzigingen lopen via Drizzle schema en migrations; documentatie mag geen migration impliceren die niet bestaat.

---

## 11. Domain, service en repository layers

De repository bevat nu appointment- en queue repository-, authorization- en service/domainlagen. Availability- en service CRUD-lagen bestaan nog niet.

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

Configureerbare waarden komen uit database/configuration. De availability engine mag geen permanente hardcoded business values bevatten voor buffer, openingstijden, serviceduur of andere configureerbare regels. Het bookinginterval is een vaste technische/businessregel van 15 minuten en geldt voor zowel customer als staff. Het interval wordt niet als configureerbare database-setting opgeslagen. Availability, booking validation en de UI moeten deze 15-minutenintervallen respecteren. Bestaande overlap-, buffer- en concurrencylogica blijft leidend.

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

Appointment creation gebruikt PostgreSQL transaction-level advisory locking per server-resolved barber. De lock wordt vóór overlapquery en insert in dezelfde transaction verkregen. `SELECT FOR UPDATE` op uitsluitend bestaande conflicterende rows is daarom niet de gekozen strategie.

De concrete implementatie gebruikt `pg_advisory_xact_lock(hashtextextended(...))` en accepteert conflicten niet stilzwijgend.

---

## 17. Configureerbare business rules

De volgende waarden moeten uit database/configuration komen wanneer de barber ze kan beheren:

- buffer;
- cancellation deadline (24 uur);
- boeken buiten normale beschikbaarheid;
- overlap permission;
- handmatige appointment confirmation;
- no-show behavior;
- availability override behavior;
- service price;
- service duration;
- opening hours.

De exacte waarden van cancellation deadline, no-show configuration en queue rules zijn niet ingevuld. De architectuur ondersteunt deze configuratie zonder alvast waarden te verzinnen.

---

## 18. Barber override

De business rules staan toe dat de barber, afhankelijk van configuratie, handmatig buiten normale customer availability boekt. Dit kan openingstijden, pauzes of een geblokkeerde dag betreffen.

**ARCHITECTURE RULE**

- normale customer availability blijft strikt;
- barber actions zijn afzonderlijk geautoriseerd;
- een override vereist expliciete configuratie en/of bevestiging volgens de business rules;
- uitzonderlijke afspraken worden niet automatisch als customer slots aangeboden;
- dit is geen multi-staff scheduling model.

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

Audit logging gebeurt server-side voor auth events en gevoelige administratieve acties, waaronder belangrijke instellingen, appointment status changes en relevante staff-beheeracties. De bestaande auditinfrastructuur is de basis.

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

De UI is mobile-first en gebruikt een donkere stijl met gouden accentkleur, een maximale contentbreedte van 520px, een responsive desktop wrapper rond 700px en vaste customer/staff bottom navigation. `src/styles/theme.css` bevat de globale styling. Bestaande componenten omvatten onder andere `Button`, `Card`, `Field`, `ServiceCard`, `BookingCard`, navigatiecomponenten en route guards.

**ARCHITECTURE RULE**

De bestaande public UI en visuele identiteit zijn leidend. Nieuwe functionaliteit hergebruikt bestaande components, styles, assets en navigation patterns waar passend en introduceert geen onnodige redesigns. De UI is nooit de business authority.

---

## 27. State management

**CURRENT**

- Auth state wordt door `AuthContext` beheerd.
- `AppointmentContext` houdt mock appointments in lokale React state en ondersteunt lokale add/update-operaties.
- `WaitingListContext` houdt hardcoded waiting-list entries in lokale React state.
- `mockData.ts` bevat hardcoded salon-, service-, barber- en appointmentdata.
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
- guest/customer/barber permissions;
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

1. notification events;
2. notification preferences;
3. failed delivery/retry behavior.

De architectuur moet deze configuratie kunnen ondersteunen, maar mag de waarden of queue behavior niet zelfstandig invullen.

---

## 33. Inconsistenties en huidige grenzen

De volgende verschillen tussen requirements en de huidige implementatie zijn vastgesteld:

- Guest booking is productmatig toegestaan, maar de huidige customer booking routes zijn achter authenticatie geplaatst.
- Product- en businessregels vereisen server-side availability, mutations, ownership, statusvalidatie, snapshots en concurrencybescherming; deze domeinfuncties bestaan nog niet.
- Services, settings, opening hours, booking settings en queue zijn in het schema deels voorbereid, maar hebben geen volledige server API en beheer-UI.
- De database heeft momenteel geen overlap exclusion of gelijkwaardige concurrencyconstraint.
- De UI gebruikt hardcoded mock data voor businessinformatie, services, tijden, appointments en queuegedrag.
- Staff appointment UI valideert lokaal, controleert geen volledige duration overlap, laat terminale afspraken lokaal bewerken en exposeert niet alle vereiste lifecycle transitions.
- De staff UI toont een source selector, terwijl `BUSINESS_RULES.md` source selection niet als afzonderlijke productfunctionaliteit vereist.
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
