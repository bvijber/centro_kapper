# Centro Kapper — Agent Instructions

Dit document is het operationele protocol voor AI-agents die aan Centro Kapper werken. Het vervangt geen product-, business-, architectuur-, database-, UI- of workflowdocument.

---

## 1. Project Context

Centro Kapper is een mobile-first webapp voor een single-barber salon met een customer en één barber/beheerder. De app gebruikt TanStack Start/Router, React, TypeScript, Drizzle ORM en Neon PostgreSQL.

De actuele productbeslissing is owner-only: er is geen staff-/medewerkerconcept en geen multi-barbermodel. Historische staff-code mag alleen als migratielegacy bestaan en mag geen runtime-authorisatie bieden.

Houd client- en servercode gescheiden. De repository bevat een bestaande TanStack Start-routebasis, auth/sessionfundament, Drizzle-schema’s en een grotendeels mock/transitional domein-UI.

---

## 2. Mandatory Documentation

Lees vóór functionele development de volledige relevante regels in deze volgorde:

1. `PRODUCT_REQUIREMENTS.md`;
2. `BUSINESS_RULES.md`;
3. `ARCHITECTURE.md`;
4. `DATABASE_RULES.md`;
5. `UI_RULES.md`;
6. `DEVELOPMENT_WORKFLOW.md`;
7. `AGENTS.md`.

Bij een documentatietask mogen alleen relevante documenten worden gelezen. Bij functionele development moeten de volledige relevante requirements, business rules, architectuur-, database- en UI-regels worden gecontroleerd.

---

## 3. Source of Truth

Volg de prioriteitsvolgorde uit `DEVELOPMENT_WORKFLOW.md`:

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

Code is niet automatisch de waarheid. Bestaande code kan transitional, incompleet of mock zijn. Leid business rules nooit af uit mockcode.

Wanneer code en requirements conflicteren, meld het conflict expliciet en behandel de leidende bron volgens bovenstaande volgorde. Wanneer een noodzakelijke beslissing ontbreekt, stel een vraag. Vul een `OPEN BESLISSING` nooit zelf in.

---

## 4. Before Coding

Voer vóór iedere functionele wijziging uit:

1. `git status --short` controleren;
2. relevante documentatie lezen;
3. bestaande implementatie inspecteren;
4. bestaande patterns en vergelijkbare flows zoeken;
5. taskscope vastleggen;
6. bestaande lokale wijzigingen herkennen;
7. controleren of de gewenste functionaliteit al gedeeltelijk bestaat;
8. bepalen welke bestanden werkelijk nodig zijn;
9. relevante validatie en risico’s bepalen.

Inspecteer in deze repository waar relevant `src/routes/`, `src/auth/`, `src/db/`, `src/components/`, `src/pages/`, `src/styles/`, `drizzle/` en `scripts/`. Begin nooit met code op basis van alleen één gebruikerszin.

---

## 5. Scope Control

Wijzig alleen wat voor de task noodzakelijk is.

Niet automatisch toegestaan:

- opportunistische refactors;
- redesign;
- library replacement;
- directory restructuring zonder expliciete reden;
- nieuwe features;
- wijzigingen aan unrelated domains;
- cleanup van oude code buiten de task;
- API-contractwijzigingen buiten scope;
- wijzigingen aan unrelated database tables.

Wanneer scope moet worden uitgebreid, rapporteer eerst de reden, bestanden en impact. Wacht op bevestiging wanneer de uitbreiding substantieel is.

---

## 6. Existing Worktree Protection

Bescherm alle lokale wijzigingen die al bestonden.

Verboden zonder expliciete opdracht:

- `git reset --hard`;
- `git checkout -- <file>` om werk te verwijderen;
- destructive cleanup;
- bestaande wijzigingen overschrijven;
- unrelated changes committen.

Wanneer een relevant bestand al gewijzigd is:

1. inspecteer de bestaande diff;
2. onderscheid bestaande en nieuwe wijzigingen;
3. wijzig alleen het noodzakelijke gedeelte;
4. behoud de bestaande wijziging.

`node_modules`, cachebestanden en build-artifacts zijn geen bewust projectwerk. Pas ze niet handmatig aan en behandel hun bestaande status niet als reden om andere wijzigingen terug te draaien.

---

## 7. Architecture Rules

Volg `ARCHITECTURE.md`. Gebruik:

- TanStack Start als framework;
- TanStack Router voor routing;
- Server Functions voor server-side operations;
- server-only modules voor database, auth en secrets;
- de bestaande auth/session architecture;
- bestaande route-, component- en server-function patterns;
- domain/service/repository separation zodra een domeinlaag wordt gebouwd.

Introduceer geen Next.js-conventies, nieuwe libraries, generieke architectuurpatronen of multi-barberconcepten zonder concrete requirement. Nieuwe abstractions hebben een concrete technische reden en blijven zo klein mogelijk.

---

## 8. Server-Side Security

Behandel alle client input als onbetrouwbaar. Iedere server mutation controleert zelfstandig, waar relevant:

- authentication;
- authorization;
- ownership;
- input validation;
- business rules;
- status transitions;
- database integrity;
- concurrency.

Vertrouw nooit op hidden UI, disabled buttons, client-side route guards, client-side ownership, client-side availability of client-side status validation.

Gebruik bestaande helpers wanneer passend:

- `requireAuthenticatedUser()`;
- `requireCustomer()`;
- `requireOwner()`;
- `requireOwnership()`.

Een nieuwe Server Function moet zowel functioneel als veilig zijn. Security checks horen niet alleen in de route of component die de functie aanroept.

---

## 9. Database Rules

Volg `DATABASE_RULES.md`.

- Database access is server-only.
- Schemawijzigingen lopen via Drizzle.
- Nieuwe schemawijzigingen krijgen nieuwe migrations.
- Oude migrations worden niet herschreven.
- Foreign keys en constraints beschermen integriteit.
- Indexes hebben een aantoonbare queryreden.
- Historische appointment snapshots blijven behouden.
- Geld gebruikt integer cents, geen floating point.
- Appointment timestamps zijn timezone-aware en gebruiken business timezone `Europe/Amsterdam`.
- Transactions worden gebruikt waar atomiciteit vereist is.
- Appointment concurrency wordt echt database-/transactioneel veilig opgelost.

Een oplossing die alleen onder normale omstandigheden werkt en faalt bij gelijktijdige requests is niet acceptabel. `SELECT FOR UPDATE` op alleen bestaande rijen is geen volledige oplossing voor een conflict dat ontstaat doordat beide transacties dezelfde nog-niet-bestaande situatie zien.

---

## 10. Appointment-Specific Rules

Gebruik `BUSINESS_RULES.md` als enige bron voor appointmentgedrag en voeg deze instructies niet zelfstandig uit.

De relevante onderwerpen zijn:

- availability;
- opening hours;
- breaks;
- whole-day blocks;
- service duration;
- buffer;
- service snapshots;
- cancellation en cancellation requests;
- modification;
- confirmation;
- no-show;
- overlap;
- queue;
- barber overrides.

Belangrijke bestaande uitgangspunten zijn:

- customer booking moet guest booking ondersteunen;
- nieuwe online customer appointments starten als `new`;
- de barber bevestigt online afspraken volgens de ingestelde confirmation behavior;
- customers wijzigen alleen eigen afspraken volgens de business rules;
- de barber mag afspraken operationeel beheren volgens de business rules;
- server-side availability is leidend;
- cancelled appointments tellen niet langer als bezette capaciteit;
- historische appointment snapshots worden niet vervangen door actuele servicegegevens;
- overlap en concurrency moeten daadwerkelijk veilig worden afgedwongen.

Verwijs bij twijfel naar `BUSINESS_RULES.md` in plaats van deze lijst uit te breiden.

---

## 11. UI Rules

Volg `UI_RULES.md`. De bestaande UI is design-leading.

Niet automatisch:

- redesignen;
- kleuren of fonts veranderen;
- een component library introduceren;
- bestaande navigatie vervangen;
- desktop-first maken;
- bestaande spacing, typography of visual hierarchy vervangen.

Herken en hergebruik bestaande components, CSS-variabelen, logo/assets, customer/owner navigation en mobile-first patronen. Functionele UI-aanpassingen blijven binnen scope en mogen geen business authority worden.

---

## 12. Validation

Voer na functionele wijzigingen relevante controles uit:

- typecheck;
- lint;
- build;
- database/schema validation;
- migration validation;
- tests.

Bij security- of business-critical wijzigingen valideer je expliciet de relevante edge cases. Als tests voor belangrijke domeinlogica ontbreken, rapporteer dat als technische gap.

Voor appointments en availability controleer je waar relevant duration fit, opening hours, breaks, whole-day blocks, bestaande appointments, overlap, timezone/DST, cancellation, status transitions, ownership en concurrency.

---

## 13. Generated Files

Maak onderscheid tussen source en generated artifacts.

Voorbeelden:

- `src/routeTree.gen.ts`;
- Vite-generated data;
- TypeScript build info;
- `node_modules`.

Generated files mogen alleen wijzigen wanneer tooling dit noodzakelijk maakt. `node_modules` mag nooit handmatig worden aangepast. Controleer na tooling altijd of generated wijzigingen binnen de task vallen.

---

## 14. Documentation Synchronization

Werk relevante documentatie bij wanneer een structurele wijziging gevolgen heeft voor requirements, business rules, architecture, database rules of UI rules. Houd regels op één duidelijke bron en verwijs vanuit andere documenten waar mogelijk.

Wijzig documentatie niet alleen omdat dit handig lijkt. Verander geen productregel in een technisch document en dupliceer regels niet onnodig.

---

## 15. Testing Philosophy

Tests beschermen businessgedrag, niet alleen coverage. Prioriteit:

1. security boundaries;
2. business rules;
3. database integrity;
4. concurrency;
5. critical user flows;
6. UI behavior.

Voor appointment-functionaliteit hebben availability, duration fit, breaks, opening hours, whole-day blocks, overlapping appointments, cancellation, status transitions, ownership en timezone/DST bijzondere aandacht.

---

## 16. No Guessing Policy

Gok niet wanneer informatie ontbreekt. Classificeer het probleem als:

- known requirement;
- technical implementation detail;
- missing business decision;
- architecture decision;
- blocker.

Los technische details zelf op binnen bestaande architectuur wanneer dat geen grote impact heeft. Leg businessbeslissingen en architectuurkeuzes met grote impact expliciet voor.

---

## 17. Stop Conditions

Stop en rapporteer concreet wanneer:

- requirements conflicteren;
- een businessregel ontbreekt;
- security niet correct kan worden gegarandeerd;
- database-integriteit onzeker is;
- concurrency niet veilig kan worden opgelost;
- scope substantieel moet worden uitgebreid;
- bestaande lokale wijzigingen conflicteren;
- een destructieve migration nodig lijkt;
- een noodzakelijke dependency ontbreekt;
- de architectuur fundamenteel moet veranderen.

Voer bij een stopconditie geen stille workaround, gok of productbeslissing uit.

---

## 18. Reporting

Rapporteer na iedere task minimaal:

### Status

`Complete / Partial / Blocked`

### Summary

Wat is uitgevoerd.

### Files

Welke bestanden zijn gewijzigd.

### Database

Schema/migrations, of `None`.

### Security

Authentication, authorization, ownership, validation en concurrency wanneer relevant.

### Validation

Gebruik `PASS`, `FAIL` of `NOT RUN` voor typecheck, lint, build, tests en database validation. Geef bij failures de concrete reden.

### Documentation

Welke documentatie is bijgewerkt.

### Git

Huidige status en eventuele commit. Vermeld expliciet wanneer niet is gecommit.

### Remaining Issues

Open punten, beperkingen en blockers.

### Scope

Bevestig:

`No unrelated changes introduced`

of beschrijf bewust gemaakte afwijkingen.

---

## 19. Git Rules

Commit niet automatisch. Een commit mag uitsluitend na expliciete gebruikersopdracht.

Voor een commit:

1. volledige diff controleren;
2. scope controleren;
3. tests en validation uitvoeren;
4. security review uitvoeren indien relevant;
5. alleen bedoelde wijzigingen committen.

Push alleen wanneer expliciet gevraagd. Gebruik geen force-push of amend zonder expliciete opdracht.

---

## 20. Priority Order

Wanneer snelheid, eenvoud en correctness botsen, geldt:

1. security;
2. data integrity;
3. business correctness;
4. architectural correctness;
5. maintainability;
6. testability;
7. performance;
8. development speed.

---

## 21. Agent Behavior

- Inspect before editing.
- Read before coding.
- Plan before implementing.
- Follow documented rules.
- Never invent business rules.
- Never overwrite unrelated work.
- Keep server-side security server-side.
- Preserve existing UI.
- Prefer existing patterns.
- Make the smallest correct change.
- Validate before declaring completion.
- Report uncertainty.
- Do not commit without instruction.

---

## 22. PWA en mobile installation

AI-agents moeten de PWA requirements respecteren. Service worker-wijzigingen worden als architectuurgevoelig behandeld. Agents verzinnen geen caching- of offlinegedrag en introduceren geen native iOS- of Android-architectuur zonder expliciete requirement.

Platformverschillen tussen iOS en Android mogen niet worden genegeerd. PWA-wijzigingen moeten expliciet worden gevalideerd volgens `DEVELOPMENT_WORKFLOW.md`.

## 23. Push notifications

AI-agents:

- verzinnen geen notification events;
- definiëren geen permission flow zelfstandig als businessregel;
- behandelen push subscriptions server-side veilig;
- brengen geen secrets of push credentials naar client code;
- negeren geen platformbeperkingen;
- valideren push-functionaliteit expliciet.

Wanneer een task notificationgedrag vereist dat niet in `BUSINESS_RULES.md` staat, stopt de agent en vraagt om de ontbrekende businessbeslissing.

## 24. PWA- en notification scope

Een PWA- of notification-task autoriseert niet automatisch een native app, nieuwe dependency, schemawijziging, migration, service worker-implementatie, manifest-implementatie of notification UI. Wijzig alleen wat expliciet binnen de taskscope valt.
