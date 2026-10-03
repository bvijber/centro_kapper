# Centro Kapper — Development Workflow

**Document:** Development Workflow  
**Versie:** 1.0  
**Status:** Living Document / Engineering Governance  
**Project:** Centro Kapper  
**Laatste update:** 2026-09-03

---

## 1. Purpose

Deze workflow definieert hoe Centro Kapper gecontroleerd wordt ontwikkeld, in het bijzonder wanneer OpenCode of een andere AI-assistent aan de repository werkt.

Ontwikkeling is incrementeel en scope-gebonden. Correctness, security, business rules, data-integriteit en maintainability zijn belangrijker dan snelheid.

Een AI-assistent mag de repository niet zelfstandig herstructureren, bestaande lokale wijzigingen niet overschrijven en geen productbeslissingen verzinnen. Een werkende UI is niet voldoende wanneer server-side validatie, authorization, persistence, concurrency of documentatie ontbreekt.

Deze workflow is zelf een operationeel protocol. Zij beschrijft niet dat functionaliteit al bestaat; de daadwerkelijke huidige staat staat in de repository en de overige source-of-truth-documenten.

---

## 2. Source of Truth Hierarchy

Bij ieder conflict geldt deze prioriteitsvolgorde:

1. actuele expliciete gebruikersbeslissingen;
2. `PRODUCT_REQUIREMENTS.md`;
3. `BUSINESS_RULES.md`;
4. `ARCHITECTURE.md`;
5. `DATABASE_RULES.md`;
6. `UI_RULES.md`;
7. `DEVELOPMENT_WORKFLOW.md`;
8. `AGENTS.md`, wanneer aanwezig;
9. bestaande repository-implementatie;
10. aannames.

Bestaande code is niet automatisch waarheid wanneer die afwijkt van requirements of business rules. Een afwijking wordt expliciet gerapporteerd en niet stilzwijgend als nieuwe regel behandeld.

Wanneer requirements en code conflicteren:

1. identificeer het conflict;
2. bepaal welke bron volgens deze volgorde leidend is;
3. wijzig alleen wat binnen de task valt;
4. rapporteer de afwijking en resterende impact.

Wanneer een noodzakelijke businessregel ontbreekt, stopt OpenCode en stelt het een gerichte vraag. Een `OPEN BESLISSING` wordt niet ingevuld met een technische aanname.

In de huidige repository is geen `AGENTS.md` aangetroffen. Als dit bestand later wordt toegevoegd, blijft het onder de expliciete projectdocumenten in deze hiërarchie staan.

---

## 3. Pre-Work Inspection

Voor iedere development task voert OpenCode eerst deze inspectie uit:

1. controleer de actuele `git status --short`;
2. lees de relevante projectdocumentatie;
3. inspecteer de relevante bestaande code;
4. identificeer bestaande architectuur- en UI-patronen;
5. bepaal welke bestanden daadwerkelijk geraakt moeten worden;
6. herken bestaande, onafgemaakte en niet-gerelateerde worktree-wijzigingen;
7. controleer of de gewenste functionaliteit al gedeeltelijk bestaat;
8. controleer relevante schema’s, migrations, auth en Server Functions;
9. bepaal welke validatie passend is.

Voor deze repository betekent dit minimaal rekening houden met de bestaande `src/routes/`, `src/pages/`, `src/components/`, `src/auth/`, `src/db/`, `src/styles/`, `drizzle/` en `scripts/`.

OpenCode mag bestaande lokale wijzigingen niet zonder expliciete instructie overschrijven, verwijderen, resetten of terugdraaien. Gebruik nooit `git reset --hard`, destructieve cleanup of een equivalent daarvan om de workspace op te schonen.

---

## 4. Scope Lock

Voor iedere task wordt expliciet vastgesteld:

- wat de task wel omvat;
- wat de task niet omvat;
- welke bestanden/modules waarschijnlijk worden geraakt;
- welke afhankelijkheden bestaan;
- welke open beslissingen relevant zijn;
- welke validatie noodzakelijk is.

Een taskbeschrijving is geen toestemming om aangrenzende features mee te nemen. OpenCode voegt geen features toe omdat die logisch, handig of technisch eenvoudiger lijken.

Niet automatisch toegestane scope creep omvat:

- extra refactors;
- nieuwe abstractions zonder noodzaak;
- redesign van bestaande UI;
- API-contractwijzigingen buiten de task;
- wijzigen van unrelated database tables;
- verbeteren van oude, niet-relevante code;
- toevoegen van nieuwe features;
- vervangen van libraries;
- herstructureren van directories zonder noodzaak.

Wanneer een noodzakelijke wijziging buiten scope valt, wordt eerst gemeld welk bestand of welke beslissing nodig is en waarom. Er wordt niet stilzwijgend uitgebreid.

---

## 5. Plan Before Implementation

Voor iedere niet-triviale task stelt OpenCode eerst een compact implementatieplan op. Dit plan bevat:

- probleem;
- doel;
- bestaande relevante architectuur;
- voorgestelde oplossing;
- bestanden die worden gewijzigd;
- database-impact;
- security-impact;
- business-rule-impact;
- test- en validatiestrategie;
- mogelijke risico’s en stopcondities.

Bij een kleine lokale wijziging mag het plan kort zijn, maar de scope en validatie blijven expliciet. Implementatie start pas nadat het plan logisch is en niet strijdig is met de source-of-truth-documenten.

---

## 6. One Domain / Feature at a Time

Werk per feature of domain als één logisch geheel, maar implementeer alleen de onderdelen die in de afgesproken phase vallen.

Een appointment-domain kan bijvoorbeeld schema, repository, service, Server Functions, authorization, availability, UI en tests omvatten. Dat betekent niet dat al deze onderdelen in iedere task tegelijk moeten worden gebouwd.

Maak niet gelijktijdig andere domains af. Houd wijzigingen klein, reviewbaar en omkeerbaar zonder bestaande functionaliteit onnodig te herschrijven.

---

## 7. Business Rules

`BUSINESS_RULES.md` is de primaire bron voor domeingedrag. Business rules worden niet afgeleid uit wat technisch eenvoudig is of uit bestaand mockgedrag.

Wanneer implementatie een niet-gedefinieerde beslissing vereist:

1. stop de betreffende implementatie;
2. identificeer de ontbrekende beslissing;
3. leg uit waarom die technisch nodig is;
4. vraag om een expliciete productbeslissing;
5. werk de relevante documentatie bij na besluitvorming;
6. implementeer pas daarna.

Dit geldt onder andere voor:

- queuegedrag;
- no-show release behavior;
- status-transition details die niet zijn vastgelegd.

Nooit zelf een waarde kiezen en die als businessregel introduceren.

---

## 8. Architecture Rules

Nieuwe code sluit aan op:

- TanStack Start;
- TanStack Router;
- React;
- TypeScript strict;
- Drizzle ORM;
- Neon PostgreSQL;
- server-only code separation;
- de bestaande auth/session architecture;
- bestaande route-, component- en Server Function-patronen.

Server-side business logic hoort niet in client components. Client-side validatie ondersteunt UX maar is nooit de enige security- of businessregelhandhaving.

Voor het huidige single-barber model worden geen multi-barber abstractions, assignments of per-medewerker availability toegevoegd zonder expliciete requirement.

---

## 9. Security Rules

Iedere server mutation wordt beoordeeld op en waar relevant beschermd met:

- authenticatie;
- autorisatie;
- ownership;
- inputvalidatie;
- business-rule validation;
- status-transition validation;
- databaseconstraints;
- transacties;
- concurrencybescherming;
- audit logging;
- rate limiting;
- CSRF-bescherming.

OpenCode vertrouwt nooit op:

- verborgen UI-elementen;
- disabled buttons;
- client-side route guards;
- client-side ownership checks;
- client-side availability;
- client-side status validation.

De bestaande helpers `requireAuthenticatedUser()`, `requireCustomer()`, `requireOwner()` en `requireOwnership()` worden hergebruikt wanneer passend. Nieuwe security-critical patterns worden niet ad hoc naast deze basis geïntroduceerd.

---

## 10. Database Change Discipline

Databasewijzigingen verlopen gecontroleerd via Drizzle:

- wijzig het schema in `src/db/schema/`;
- genereer een nieuwe migration met Drizzle Kit;
- inspecteer de gegenereerde SQL;
- controleer migration/schema-consistentie;
- pas de migration toe via het afgesproken deploymentproces.

Regels:

- schemawijzigingen lopen via Drizzle;
- migrations zijn onderdeel van de wijziging;
- oude migrations worden niet herschreven;
- handmatige production-schemawijzigingen vervangen geen migrations;
- foreign keys, `NOT NULL`, `CHECK`, `UNIQUE` en indexes worden bewust gekozen;
- historische data en appointment snapshots blijven beschermd;
- geldbedragen gebruiken integer cents;
- appointment timestamps zijn timezone-aware;
- transacties worden gebruikt waar atomiciteit vereist is;
- concurrency wordt daadwerkelijk opgelost en niet alleen gedocumenteerd.

Een `SELECT FOR UPDATE` op alleen bestaande rijen is onvoldoende wanneer het conflict ontstaat doordat twee transacties dezelfde nog-niet-bestaande situatie kunnen zien. Booking/appointment concurrency vereist uiteindelijk een echte database-/transactionele strategie.

De huidige beschikbare commando’s zijn:

```bash
npm run db:check
npm run db:generate
```

Er is momenteel geen migration-applyscript in `package.json`; volg daarom voor toepassen het afgesproken deploymentproces en verzin geen lokaal alternatief als productworkflow.

---

## 11. Server / Client Boundary

Server-only code mag niet naar client bundles lekken. Dit omvat:

- database access;
- `DATABASE_URL` en andere credentials;
- secrets;
- password hashing;
- session internals;
- server-only authorization;
- gevoelige businesslogica;
- interne databasefouten.

Gebruik bestaande `.server.ts`-patronen, waaronder de databaseclient, sessie-, password-, audit- en rate-limitmodules. Een route guard of client context maakt servercode niet veilig voor browserimport.

---

## 12. UI Rules

`UI_RULES.md` en de bestaande UI zijn leidend voor visuele en interactionele wijzigingen.

Respecteer:

- mobile-first karakter;
- bestaande CSS-variabelen en classes;
- bestaande spacing;
- DM Sans/Space Grotesk-hiërarchie;
- bestaande components;
- bestaande customer/owner navigation;
- bestaande logo en assets;
- bestaande visual hierarchy;
- `extend, don't redesign`.

Functionele wijzigingen mogen UI aanpassen wanneer dat binnen scope nodig is, maar niet automatisch een redesign, nieuwe component library, nieuwe kleurset of generieke dashboard-template introduceren.

---

## 13. Validation

Na implementatie voert OpenCode relevante validatie uit. Gebruik waar beschikbaar minimaal:

- TypeScript typecheck;
- lint;
- build;
- database/schema validation;
- migrationsvalidatie;
- relevante tests.

Backend- en businesslogica krijgen tests wanneer de functionaliteit daarvoor geschikt is. Kritieke regels worden niet uitsluitend met handmatige UI-verificatie gevalideerd.

Voor appointment- en availabilitylogica wordt minimaal aandacht besteed aan:

- volledige serviceduur;
- opening hours;
- breaks;
- whole-day blocks;
- bestaande appointments;
- overlap;
- timezone en DST;
- cancellation;
- status transitions;
- ownership;
- concurrency.

Wanneer tooling of tests niet bestaat, rapporteert OpenCode dat als `NOT RUN` of ontbrekend in plaats van de afwezigheid als geslaagd te presenteren.

---

## 14. Validation Matrix

### Documentation-only change

Voor requirements, architecture, workflow en rules:

- inhoud controleren;
- consistentie met bestaande documenten controleren;
- volledige git diff controleren;
- geen functionele build/test-run vereist, tenzij expliciet gevraagd.

### Backend change

Voer minimaal de relevante typecheck, lint, build, database validation en tests uit.

### Frontend change

Voer minimaal de relevante typecheck, lint, build en tests uit.

### Database change

Voer minimaal schema validation, migration validation, typecheck en relevante tests uit; voer ook build uit wanneer application code geraakt wordt.

### Security/auth change

Controleer aanvullend authorization, ownership, session behavior, input validation, CSRF, rate limiting en audit logging waar relevant.

---

## 15. Diff Review

Na implementatie wordt de volledige git diff bekeken. Controleer:

- alleen bedoelde bestanden zijn gewijzigd;
- geen accidental refactors zijn toegevoegd;
- geen debugcode of secrets aanwezig zijn;
- geen ongewenste testdata aanwezig is;
- geen ongewenste generated files zijn gewijzigd;
- unrelated worktree changes onaangeraakt zijn;
- migrations correct zijn;
- imports correct zijn;
- security boundaries intact zijn.

Generated files wijzigen alleen wanneer tooling ze daadwerkelijk opnieuw genereert en de wijziging noodzakelijk is. `node_modules` en cachebestanden zijn geen functionele projectwijzigingen en mogen niet bewust worden aangepast.

---

## 16. Security Review

Voor iedere feature met gebruikersdata, authenticatie, autorisatie, booking of database mutations wordt een korte security review uitgevoerd:

- kan een unauthenticated user het endpoint aanroepen?
- kan een customer data van een andere customer lezen?
- kan een customer een andere appointment wijzigen?
- kan een customer owner-only acties uitvoeren?
- worden status transitions server-side gecontroleerd?
- kan input business rules omzeilen?
- is concurrency veilig?
- blijven secrets server-only?
- worden gevoelige gegevens niet onnodig gelogd?

---

## 17. Documentation Synchronization

Wanneer implementatie structureel verandert, worden de relevante documenten synchroon bijgewerkt:

- product requirements;
- business rules;
- architecture;
- database rules;
- UI rules;
- deze workflow wanneer de werkwijze zelf verandert.

Documentatie mag niet achterlopen op de werkelijke architectuur. Documentatie wordt niet alleen gewijzigd omdat het misschien handig lijkt; er moet een echte structurele wijziging of expliciete beslissing zijn.

---

## 18. Existing Worktree Changes

OpenCode inspecteert voor iedere task de status en bepaalt welke wijzigingen al bestonden. Unrelated changes blijven onaangeraakt.

Verboden zonder expliciete opdracht:

- `git reset --hard`;
- destructive cleanup;
- revert van bestaande wijzigingen;
- overschrijven van lokaal gewijzigde bestanden;
- verwijderen van generated/cachebestanden die niet door de task zijn geraakt.

Wanneer een bestaand gewijzigd bestand ook voor de task nodig is, meldt OpenCode dat bestand vóór wijziging en werkt het alleen gericht, met behoud van de bestaande wijziging.

---

## 19. Git / Commit Discipline

OpenCode commit niet automatisch. Een commit gebeurt alleen na expliciete opdracht.

Wanneer een commit wordt gevraagd:

- controleer eerst `git status`, `git diff` en relevante recente geschiedenis;
- stage alleen de bedoelde wijzigingen;
- commit geen unrelated changes;
- gebruik één coherente commit per afgeronde feature/phase wanneer dat de afgesproken workflow is;
- gebruik een duidelijke conventional commit message;
- controleer daarna status en commit.

Push naar remote gebeurt alleen wanneer expliciet gevraagd of wanneer een phase workflow dat uitdrukkelijk voorschrijft.

---

## 20. Deployment Verification

Deploymentcontrole is een aparte stap en wordt alleen uitgevoerd wanneer expliciet gevraagd:

1. commit controleren;
2. push controleren;
3. deployment starten of volgen;
4. productieomgeving controleren;
5. relevante routes en functionaliteit controleren;
6. fouten rapporteren.

Een succesvolle lokale build bewijst niet dat deployment correct werkt.

---

## 21. Stop Conditions

OpenCode stopt en rapporteert wanneer:

- een noodzakelijke businessregel ontbreekt;
- requirements elkaar tegenspreken;
- security-impact onduidelijk is;
- database-integriteit niet veilig kan worden gegarandeerd;
- concurrency niet correct kan worden opgelost;
- bestaande wijzigingen met de task conflicteren;
- de scope moet worden uitgebreid;
- een migration destructief kan zijn;
- een vereiste dependency ontbreekt;
- een technische keuze grote architectuurimpact heeft.

Bij een stopconditie wordt niet gegokt, teruggedraaid of stilzwijgend een alternatief als definitieve productregel ingevoerd.

---

## 22. Phase Completion

Een phase is pas compleet wanneer:

- alle afgesproken onderdelen zijn geïmplementeerd;
- requirements en business rules zijn gevolgd;
- relevante tests/validatie groen zijn;
- typecheck groen is;
- lint groen is, behalve expliciet gedocumenteerde pre-existing issues;
- build groen is;
- database/migrations correct zijn;
- security review is uitgevoerd;
- de volledige git diff is gecontroleerd;
- documentatie synchroon is;
- geen scope creep aanwezig is;
- resterende beperkingen expliciet zijn gerapporteerd.

Een feature is niet done alleen omdat de UI zichtbaar werkt.

---

## 23. Required OpenCode Report Format

Na iedere development task rapporteert OpenCode minimaal:

### Status

`Complete`, `Partial` of `Blocked`.

### Implemented

Concrete wijzigingen.

### Files Changed

Lijst van gewijzigde bestanden.

### Database

Migrations/schemawijzigingen, of expliciet: geen databasewijzigingen.

### Security

Authorization, ownership, validation en concurrency wanneer relevant.

### Tests & Validation

Rapporteer typecheck, lint, build, tests en database validation met `PASS`, `FAIL` of `NOT RUN`. Geef bij failures de concrete reden.

### Documentation

Welke documenten zijn bijgewerkt.

### Git

Huidige status en commitinformatie. Vermeld dat niet is gecommit wanneer geen commit is gevraagd.

### Remaining Issues

Open punten, bekende beperkingen en blockers.

### Scope Check

Geef expliciet aan:

`No unrelated changes introduced`

of beschrijf welke afwijking bewust is gemaakt en waarom.

---

## 24. AI Development Principles

1. Inspect before changing.
2. Read the rules before coding.
3. Never invent business rules.
4. Lock the scope.
5. Prefer small, reversible changes.
6. Preserve existing behavior unless the task changes it.
7. Keep security server-side.
8. Treat database integrity as a hard requirement.
9. Test business-critical logic.
10. Review the complete diff.
11. Never overwrite unrelated worktree changes.
12. Do not commit without explicit instruction.
13. Report uncertainty instead of guessing.
14. Do not declare a phase complete without validation.

---

## 25. PWA Validation

Bij PWA-gerelateerde wijzigingen controleert OpenCode minimaal:

- manifest;
- service worker;
- installability;
- HTTPS assumptions;
- cache- en updategedrag;
- routing;
- production build;
- iOS;
- Android.

Een succesvolle lokale development build is onvoldoende om PWA- of push-functionaliteit als volledig gevalideerd te beschouwen.

Platform testing wordt waar relevant op echte iOS- en Android-devices uitgevoerd.

## 26. Push Notification Validation

Bij push-notification changes controleert OpenCode minimaal:

- permission flow;
- subscription creation;
- subscription persistence;
- authenticatie en autorisatie;
- server-side dispatch;
- service worker handling;
- invalid subscriptions;
- meerdere devices;
- failure handling;
- privacy en security.

Wanneer notification events, triggers, timing of preferences ontbreken in `BUSINESS_RULES.md`, wordt de implementatie gestopt en wordt om de ontbrekende businessbeslissing gevraagd.
