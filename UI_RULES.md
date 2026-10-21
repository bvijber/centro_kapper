# Centro Kapper — UI Rules

**Document:** UI Rules  
**Versie:** 1.0  
**Status:** Living Document / Source of Truth  
**Project:** Centro Kapper  
**Laatste update:** 2026-10-21

---

## 1. Design principle

De bestaande Centro Kapper UI is design-leading.

Nieuwe functionaliteit past zich aan de bestaande UI aan, niet andersom. Een nieuwe feature introduceert niet automatisch een redesign, nieuwe kleurenset, nieuwe typografie, component library, spacing-systeem, navigation of generieke dashboard-template.

Wanneer een bestaand component geschikt is, wordt dat component hergebruikt. Nieuwe patronen zijn alleen gerechtvaardigd wanneer de bestaande UI een expliciete requirement, accessibility-verbetering of technisch noodzakelijke interactie niet kan ondersteunen.

**ARCHITECTURE RULE**

Extend, don't redesign.

---

## 2. Brand identity

**CURRENT**

De enige lokale asset in `src/assets/` is:

- `logo_centro_kapper.jpeg`.

Het logo wordt gebruikt in customer header, home, login, owner dashboard, owner appointments, owner queue en owner navigation. Het wordt meestal met beschrijvende alt-tekst weergegeven.

De visuele identiteit bestaat uit:

- een donkere achtergrond;
- goud als Centro Kapper-accent;
- een ronde logo-presentatie in headers en hero’s;
- subtiele donkere gradients;
- dunne donkere borders;
- afgeronde cards en controls;
- een duidelijke typografische combinatie van rustige bodytekst en expressieve Space Grotesk-headings.

Er is daarnaast een CSS-gradient `business-mark` met de letters `CK` voor appointmentpresentatie. Dat is een bestaand UI-patroon, geen vervanging voor de echte logo-asset.

**UI RULE**

Nieuwe UI gebruikt de bestaande logo-asset, iconografie, kleuren, radii, borders, shadows en hiërarchie. Er worden geen nieuwe brand tokens toegevoegd zonder expliciete reden.

---

## 3. Theme system

**CURRENT**

`src/styles/theme.css` bevat de globale styling. De expliciet aanwezige root-variabelen zijn:

```css
--gold: #e6aa38;
--gold-light: #f2bd4c;
--muted: #96969a;
--line: #292929;
--card: #131313;
```

De globale basis gebruikt:

- root-font-family: `DM Sans`, sans-serif;
- root color: `#f7f6f2`;
- root/background: `#080808`;
- `font-synthesis: none`;
- `box-sizing: border-box` voor alle elementen;
- `button` en `input` met de inherente font;
- `button { cursor: pointer; }`.

Veel aanvullende stylingwaarden zijn rechtstreeks in CSS classes opgenomen in plaats van als variabelen. Die waarden worden als bestaand patroon behandeld en niet als nieuwe design tokens hernoemd.

Bestaande stylingcategorieën zijn onder andere:

- `.page`, `.shell` en `.topbar`;
- `.brand`, `.business-hero` en `.business-status`;
- `.card`, `.salon-card`, `.hours-card` en `.profile-card`;
- `.button`, `.secondary-action` en `.logout-button`;
- `.field`, `.search` en appointment form controls;
- `.service-card`, `.booking-card` en `.appointment-card`;
- `.bottom-nav` (customer) en `.staff-nav` (owner, legacy klassenaam);
- queue, modal, success, error en loading classes.

**UI RULE**

Gebruik bestaande CSS-variabelen en classes waar passend. Verzin geen nieuwe kleuren, tokens of utility convention als een bestaand patroon volstaat.

---

## 4. Typography

**CURRENT**

`theme.css` importeert vanuit Google Fonts:

- `DM Sans` in weights 400, 500, 600 en 700;
- `Space Grotesk` in weights 400, 500 en 600.

De typografische hiërarchie gebruikt:

- `DM Sans` voor bodytekst, labels, controls en navigatietekst;
- `Space Grotesk` voor grote headings en belangrijke titels;
- goud voor `.eyebrow`, geaccentueerde woorden in `em` en bepaalde metadata;
- muted grijs voor ondersteunende tekst en details;
- kleine uppercase eyebrows met letter spacing voor sectiecontext;
- goudkleurige prijs- en accentinformatie in servicepresentatie.

Voorbeelden van bestaande headingpatronen zijn grote hero headings op home, login en account creation, `h2`-sectietitels, owner headings en modal headings.

**UI RULE**

Nieuwe schermen gebruiken dezelfde DM Sans/Space Grotesk-verdeling en bestaande hiërarchie. Nieuwe font families, gewichten of typografische schaal worden niet zelfstandig geïntroduceerd.

---

## 5. Layout

**CURRENT**

De belangrijkste mobile layout is `.page`:

- `min-height: 100vh`;
- `max-width: 520px`;
- horizontaal gecentreerd;
- padding `28px 20px 110px`;
- donkere radial-gradient rechtsboven;
- extra onderruimte voor fixed bottom navigation.

`.shell` gebruikt `padding-top: 36px`. Headers gebruiken flex layouts met ruimte tussen logo/tekst en actie-iconen. Content is doorgaans een verticale flow met cards, sectie-headers en compacte gaps.

Bestaande layoutprincipes:

- duidelijke hero bovenaan een pagina;
- eyebrow vóór een belangrijk onderdeel;
- cards als hoofdcontainer voor informatie;
- grid voor home-actions, services, metrics en appointmentlijsten;
- horizontale strips voor dates;
- bottom navigation buiten de primaire content flow;
- forms als verticale stacks met een beperkte twee-koloms `.form-row` in het owner appointment-modal.

De owner dashboardpagina gebruikt een revenue-card, een driedelige metrics-grid en een owner-link card. De customer home gebruikt business hero, acties, services, openingstijden en contactacties.

**UI RULE**

Nieuwe content volgt de bestaande content hierarchy, page width, card spacing en navigatieruimte. Een nieuwe globale layout abstraction wordt niet toegevoegd als bestaande classes volstaan.

---

## 6. Responsive behavior

**CURRENT**

De app is mobile-first.

Bij `min-width: 700px`:

- wordt de body-achtergrond `#1d1d1d`;
- krijgt `.page` een zwarte shadow `0 0 50px #000`;
- krijgt `.auth` viewporthoogte;
- wordt `.bottom-nav` fixed.

Bij `max-width: 360px`:

- worden page paddings links en rechts `15px`;
- wordt bottom-nav tekst `9px`;
- worden brand en business hero verkleind;
- wordt booking metadata compacter.

De page content blijft op grotere schermen binnen de bestaande 520px wrapper. De owner- en customer navigation zijn bottom-navigation patronen; er is geen desktop sidebar in de huidige code.

Cards en forms blijven op small screens binnen de page width. Het owner appointment-modal gebruikt maximaal 520px breedte en scrollt verticaal binnen maximaal 92vh.

**UI RULE**

Desktop mag leesbaarheid en ruimte verbeteren, maar mobile-first gedrag, content width en bruikbaarheid op small screens mogen niet verslechteren. Nieuwe breakpoints worden alleen toegevoegd wanneer een concrete layoutbehoefte dat vereist.

---

## 7. Customer UI

### 7.1 Routes en navigation

**CURRENT**

Customer routes zijn `/home`, `/booking`, `/bookings`, `/queue` en `/profile`. `BottomNav` toont vijf items:

- Home met `House`;
- Boeken met `Scissors`;
- Wachtrij met `Clock3`;
- Afspraken met `CalendarDays`;
- Profiel met `CircleUserRound`.

De actieve route krijgt class `active` op basis van `useLocation().pathname`. `CustomerHeader` toont logo, merknaam, een goud/gemarkeerd `Kapper`-deel en een `Bell`-icoon.

Navigation is een UI-patroon en geen security boundary.

### 7.2 Home

`Home.tsx` toont:

- customer header;
- logo/business hero;
- welkomtekst met goud geaccentueerd deel;
- open/closed status;
- adres;
- primary CTA `Afspraak maken`;
- secondary CTA naar de wachtrij;
- services als featured cards;
- openingstijden-card;
- telefoon- en routeacties;
- customer bottom navigation.

De huidige waarden komen uit `src/data/mockData.ts`.

### 7.3 Booking

`Booking.tsx` gebruikt:

- back-link met `ArrowLeft`;
- subheader;
- vaste business card;
- barber profile card met initials, naam, rol en rating;
- `ServiceCard`-selectie;
- datumknoppen;
- tijdknoppen;
- primary bevestigingsbutton.

De huidige service-, datum- en tijdkeuzes zijn lokaal/mock. De UI toont dus het prototypepatroon, niet een werkelijke server booking-flow.

### 7.4 Appointments

`MyBookings.tsx` gebruikt customer header, hero copy, visuele tabs, één `BookingCard` en customer navigation. De tabs zijn momenteel alleen visueel; de card is hardcoded.

### 7.5 Queue

`Queue.tsx` gebruikt customer header, hero copy, cards, service-select, textarea, loading state, active queue state, completed state en leave-confirmation markup. Het scherm gebruikt `WaitingListContext` en mock/demo states.

### 7.6 Profile

`CustomerProfile.tsx` toont een profile card met gebruikersnaam, customer-context en een destructieve logout action. Profile editing bestaat nog niet.

---

## 8. Owner/barber UI

### 8.1 Routes en navigation

Owner routes zijn `/owner`, `/owner/appointments`, `/owner/queue`, `/owner/profile` en `/owner/settings`. `OwnerBottomNav` toont vier items:

- Dashboard met `LayoutDashboard`;
- Afspraken met `CalendarDays`;
- Wachtrij met `Clock3`;
- Profiel met `CircleUserRound` (label `Profiel`, doel `/owner/profile`; `/owner/settings` valt onder dezelfde actieve markering).

De actieve route krijgt class `active`. Owner pages gebruiken dezelfde merkstijl en page wrapper als customer pages, maar met owner heading, management-context en owner navigation (`OwnerBottomNav`; de CSS-klasnaam `.staff-nav` is legacy en blijft ongewijzigd).

### 8.2 Dashboard

`OwnerDashboard.tsx` bevat:

- merkheader met `EIGENAAR` label en notificatiebel (zie 8.3);
- beheer-eyebrow;
- owner greeting;
- revenue card;
- drie metrics cards (Vandaag, Voltooid, Verzoeken);
- link-card naar wachtrijbeheer;
- owner bottom navigation.

Omzet en metrics worden server-side afgeleid via `getOwnerDashboardFn()`; er is geen team-/staff-KPI omdat de owner-only beslissing geen tweede beheerder kent.

### 8.3 Notificatiebel

De eigenaar krijgt een **interne notificatiebel** in de owner-header. De bel maakt onderdeel uit van de gedeelde `OwnerHeader` en staat daarmee op alle eigenaarpagina's; het dashboard (`/owner`) is de primaire plek.

De businessregels staan in `BUSINESS_RULES.md` §29 (Eigenaar-notificaties v1).

De bel bevat:

- een `Bell`-icoon als icon-only button met een toegankelijk label;
- een teller met het aantal ongelezen notificaties;
- een panel met de meldingenlijst;
- een actie om alles als gelezen te markeren.

**CURRENT**

- `OwnerNotificationBell.tsx` implementeert de bel; de teller, de lijst en de leesstatus komen uit `getOwnerNotificationsFn()`, `markOwnerNotificationReadFn()` en `markAllOwnerNotificationsReadFn()`.
- De gedeelde `OwnerHeader` wordt gebruikt door dashboard, afspraken, wachtrij, profiel en instellingen.
- Het decoratieve `Bell`-icoon dat eerder in `OwnerAppointments.tsx` stond, is vervangen door de echte bel.
- De bel luistert naar een SSE-stroom (`/api/owner-notifications/stream`) en werkt terug op polling wanneer die stroom niet beschikbaar is.

**UI RULE**

- De teller en de meldingenlijst worden **automatisch ververst**; de gebruiker hoeft niet te verversen.
- Klikken op een melding markeert deze als gelezen en opent de relevante pagina (`/owner/queue` of `/owner/appointments`).
- De teller is een visuele indicator; de daadwerkelijke ongelezenstatus komt server-side en wordt niet client-side afgeleid.
- De bel gebruikt de bestaande topbar-, `Card`- en iconconventies; er komt geen nieuw visueel systeem.
- De bel toont alleen de meldingen van de eigenaar; de UI biedt geen enkele mogelijkheid om meldingen van anderen te openen.
- Notificaties en hun leesstatus zijn server state. De UI simuleert geen ongelezen teller en markeert niets lokaal als gelezen zonder serverbevestiging.
- De UI toont geen verbindingsstatus of andere techniek van de stroom; een niet-beschikbare stroom is een terugval op polling en blijft voor de gebruiker onzichtbaar.

### 8.4 Profiel als hubpagina

`OwnerProfile.tsx` is uitsluitend een compacte profielhub: eigenaaraccountkaart (`UserRound`), inline profielbewerking (naam, telefoon via `getMyOwnerProfileFn()` / `updateMyOwnerProfileFn()`), navigatie-cards onder `Beheer` naar `/owner`, `/owner/appointments`, `/owner/queue` en `/owner/settings`, plus logout. Saloninformatie, boekingsinstellingen, openingstijden, pauzes en blokkades, en diensten (`OwnerSettingsSections`) staan niet op de profielpagina maar uitsluitend op `/owner/settings`.

### 8.5 Appointments

`OwnerAppointments.tsx` bevat:

- owner header met logo en notificatiebel (zie 8.3);
- beheer-eyebrow;
- heading en calendar icon;
- primary `Nieuwe afspraak` action;
- success message;
- vandaag/morgen filterbuttons;
- horizontale date strip;
- appointment cards;
- create/edit bottom-sheet modal;
- owner bottom navigation.

Appointment cards tonen tijd, status, klantinitialen, klant, service, duur, telefoonnummer, optionele notitie en actions. De huidige actions zijn Details, Bewerk, Annuleer, Bevestig, Afgerond en No-show, afhankelijk van lokale status.

### 8.6 Queue

`OwnerQueue.tsx` bevat:

- owner header;
- management heading;
- success message;
- queue stats card;
- actief/afgerond-geweigerd tabs;
- queue rows met klant, service, telefoon, tijd en status;
- status actions;
- locatie-informatie;
- owner bottom navigation.

De waarden en transitions komen server-side uit `listOwnerQueueFn()` en de queue Server Functions; walk-ins worden via `joinQueueFn()` toegevoegd.

### 8.7 Profiel

`OwnerProfile.tsx` toont het eigenaarprofiel (naam, telefoon, e-mail), profile editing via `getMyOwnerProfileFn()` / `updateMyOwnerProfileFn()`, navigatie-cards naar de vier beheerpagina's en logout. De pagina rendert `OwnerSettingsSections` niet.

### 8.8 Instellingen

`OwnerSettings.tsx` toont de instellingenpagina: merkheader met `EIGENAAR`, eyebrow `Instellingen`, titel, lead, `OwnerSettingsSections`, logout en `OwnerBottomNav`.

`OwnerSettingsSections.tsx` is de orchestrator: één centrale `load()`, gedeelde save-state en per sectie feedback via het bestaande success/error pattern. De pagina werkt volgens overzicht → onderdeel → terug. Het overzicht toont cards voor `Saloninformatie`, `Boekingsinstellingen`, `Openingstijden`, `Pauzes en blokkades` en `Diensten`; een sectie opent met een `Terug`-knop (`ArrowLeft`) en rendert alleen die sectie. De sectiecomponenten staan in `src/pages/settings/`:

- `SalonInformationSection`: naam, adres en telefoon;
- `BookingSettingsSection`: buffer en annuleringstermijn in minuten, overlap en no-show vrijgave als radiokeuzes; er is geen control voor `confirmationBehavior`;
- `OpeningHoursSection`: één rij per dag met open-checkbox en openingstijd/sluitingstijd, met `htmlFor` en visueel verborgen labels voor de tijdvelden;
- `BreaksAndBlocksSection` met `BreakEditor` en `BlockEditor`: pauzes en volledige dagblokkades via modals, met uitsluitend velden die de bestaande schemas ondersteunen;
- `ServicesSection` met `ServiceListItem` en `ServiceEditor`: dienstenlijst met status, activeren/deactiveren en een modal voor create en bewerken. Gearchiveerde diensten worden niet getoond en archiveren heeft geen UI-actie.

**UI RULE**

Owner UI mag meer operationele acties tonen dan customer UI, maar gebruikt dezelfde kleuren, fonts, cardtaal, spacing en mobile-first structuur. Owner/customer-separatie in de UI vervangt geen server-side authorization.

---

## 9. Components

**CURRENT**

### `Card`

`Card` rendert een `<section className="card">` met optionele extra class. Gebruik dit bestaande card-frame voor inhoudelijke panels en cards.

### `Button`

`Button` rendert een native `<button className="button">` en geeft buttonprops door. Het is de bestaande herbruikbare primary button wrapper.

### `Field`

`Field` combineert een Lucide icon en native input in een `<label className="field">`. Het wordt gebruikt in auth forms. De huidige component maakt geen expliciete `id`/`htmlFor`-relatie.

### `ServiceCard`

`ServiceCard` combineert `Card`, `Scissors`, een custom radio-visual, servicecopy, prijs en duur. Het is selectable en krijgt `selected` door. Het huidige component gebruikt mock-shaped stringdata (`name`, `detail`, `price`, `duration`).

### `BookingCard`

`BookingCard` combineert statusbadge, business mark, locatie, datum en tijd. De huidige inhoud is hardcoded en is daarom nog geen generieke data-driven appointment component.

### Navigation

`BottomNav`, `OwnerBottomNav` en `CustomerHeader` zijn de bestaande navigation/header building blocks. Gebruik deze patronen waar dezelfde context van toepassing is.

### `OwnerHeader`

`OwnerHeader` rendert de gedeelde merkheader van de eigenaarpagina's: het merklogo als link naar `/owner`, het `EIGENAAR` label en de notificatiebel. Dashboard, afspraken, wachtrij, profiel en instellingen gebruiken deze component, zodat de bel op elke eigenaarpagina op dezelfde plek staat.

### Route guards

`RouteGuards.tsx` bevat `RequireAuth`, een client-side guard die op auth state en role redirect. Het is geen visual component om security op te baseren.

Er bestaat geen algemene component library, data-loading component, mutation component, modal component, alert component, empty-state component of server-state component.

**UI RULE**

Nieuwe componenten zijn gerechtvaardigd wanneer hergebruik niet passend is of een herhaald bestaand patroon daadwerkelijk abstraheert. Introduceer geen aparte component library zonder expliciete requirement.

---

## 10. Forms

**CURRENT**

Auth forms gebruiken `Field`, native form controls, `required`, autocomplete-attributen, een submit button en een error paragraph met `role="alert"`.

Het staff appointment form gebruikt native labels, inputs, select, textarea, een twee-koloms `.form-row`, `.form-error`, modal actions en een close button. Queue gebruikt een styled select en textarea in `.queue-field`.

Bestaande form styling:

- donkere inputachtergrond;
- dunne donkere border;
- afgeronde controls;
- goudkleurige focus border in bestaande classes;
- compacte labeltekst;
- duidelijke verticale gaps.

**UI RULE**

Nieuwe forms volgen bestaande labels, input styling, focus states, error states, helper text, required-indicatie, button styling en spacing. Client validation geeft UX-feedback; server validation blijft definitief volgens `ARCHITECTURE.md` en `DATABASE_RULES.md`.

Accessibility moet bij nieuwe forms verbeteren waar bestaande patterns tekortschieten: labels moeten expliciet aan inputs gekoppeld zijn en errors moeten aan relevante controls worden gerelateerd.

---

## 11. Buttons and actions

**CURRENT**

De bestaande button hierarchy bevat:

- `.button` als algemene filled/primary action;
- `.secondary-action` als outlined goudkleurige action-link;
- `.new-appointment` als goudkleurige staff create action;
- `.logout-button`, `.leave-queue` en `.cancel-modal` als destructive/secondary cancel patterns;
- `.appointment-actions button` voor compacte appointment actions;
- disabled submit buttons tijdens login/account submission.

Een aparte algemene loading-button component is niet aanwezig. De auth buttons tonen tekst `Bezig...`; de queue gebruikt een aparte spinner card.

**UI RULE**

Nieuwe acties volgen de bestaande hierarchy. Destructieve acties krijgen niet dezelfde visuele nadruk als de primaire flow. Icon-only actions krijgen een accessible label. Een disabled of verborgen button is geen authorization.

---

## 12. Cards

**CURRENT**

Het bestaande card-pattern gebruikt:

- achtergrondgradient van donkere grijstinten;
- border `#292929` of een bestaande variant;
- border-radius `17px` voor `.card`;
- overflow hidden;
- compacte interne padding per toepassing.

Cards worden gebruikt voor:

- business hero en saloninformatie;
- services;
- bookings;
- dashboard revenue en metrics;
- queue summary/active/completed states;
- profile sections;
- modal content.

**UI RULE**

Nieuwe cards sluiten aan op `.card` en bestaande varianten. Niet iedere feature krijgt een nieuw card-design. De cardvorm ondersteunt informatiehiërarchie en vervangt geen semantische structuur.

---

## 13. Appointment UI

**CURRENT**

De staff UI gebruikt status classes:

- `new` voor nieuw;
- `confirmed` voor bevestigd;
- `done` voor afgerond;
- `cancelled` voor geannuleerd;
- `noshow` voor no-show.

`In behandeling` deelt momenteel de class `new`. Customer booking cards tonen momenteel alleen `In afwachting`.

De bestaande appointment card toont tijd en status bovenaan, daarna klant, service, duur, telefoon en optionele notitie. De booking card toont salon, locatie, datum en tijd.

**UI RULE**

Appointment UI moet de productstatussen `new`, `confirmed`, `in_progress`, `completed`, `cancelled` en `no_show` duidelijk onderscheiden wanneer de serverdata beschikbaar is. Status mag niet uitsluitend door kleur worden gecommuniceerd; gebruik altijd labeltekst en context.

Relevante appointmentinformatie is datum, tijd, service, historische duur, historische prijs, klant/guest identity en status, voor zover die context op het betreffende scherm hoort. Historische prijs en duur komen uit de appointment snapshot, niet uit actuele service data.

De UI mag geen status transition claimen die de server niet heeft toegestaan.

---

## 14. Booking UX

De gewenste booking UX volgt de bestaande visuele sequence:

1. service kiezen;
2. datum kiezen;
3. beschikbare tijden zien;
4. tijd kiezen;
5. noodzakelijke gegevens invullen;
6. afspraak bevestigen;
7. resultaat of succes tonen.

De huidige `Booking.tsx` toont deze vorm met mock services, dates en times, maar maakt geen server appointment aan.

**UI RULE**

Beschikbaarheid komt uit Server Functions. De frontend bevat geen eigen availability-engine. Een unavailable slot mag visueel disabled zijn, maar de server valideert de booking opnieuw, inclusief de geconfigureerde buffer. Loading, error, empty en success states horen bij iedere server-driven stap.

---

## 15. Guest booking UI

`BUSINESS_RULES.md` staat booking zonder account toe. De huidige booking route vereist echter customer-authenticatie en de booking UI bevat geen guestgegevensformulier.

**UI RULE**

Guest booking mag geen verplicht accountproces krijgen. Als authentication optioneel is, maakt de UI dat expliciet en vraagt zij alleen de noodzakelijke guestgegevens. Guest booking geeft geen onduidelijke of automatische toegang tot bestaande appointments.

---

## 16. Barber configuration UI

De requirements voorzien UI voor services, prijs, serviceduur, opening hours, blocks, buffer, cancellation settings, salon information en appointment settings. Die UI bestaat op `/owner/settings` (zie §8.8).

**UI RULE**

Configuratievelden worden data-driven gemaakt en niet als permanente presentatieconstanten in components opgeslagen. Wanneer een business setting een `OPEN BESLISSING` is in `BUSINESS_RULES.md`, toont de UI geen definitieve waarde of verzonnen UX-regel.

De settings UI behoudt de bestaande staff page, heading, card, form en action patterns.

---

## 17. Loading states

**CURRENT**

De huidige code bevat:

- auth loading waarbij `RequireAuth` niets rendert tijdens laden;
- queue loading met `.queue-loading`, spinner, heading en toelichting;
- auth submittekst `Bezig...`.

Er is geen algemeen server-data loading component.

**UI RULE**

Nieuwe server-driven UI heeft een duidelijke loading state die layout jumps, blank screens en onduidelijke interactieve elementen voorkomt. Gebruik bestaande spinner/card/button patterns voordat een nieuw loading pattern wordt gemaakt.

---

## 18. Empty states

**CURRENT**

Er is geen dedicated empty-state component of consistent empty-state pattern vastgesteld. Lege appointment-, queue-, service- en slotlijsten hebben momenteel geen volledige empty UX.

**UI RULE/FUTURE**

Data-driven schermen tonen een duidelijke, rustige empty state wanneer geen appointments, services, queue entries, zoekresultaten of available slots bestaan. Een lege lijst is geen fout. De empty state sluit aan op de bestaande card, muted text en spacingtaal.

---

## 19. Error states

**CURRENT**

- Login en account creation tonen errors met `role="alert"`.
- Staff appointment errors gebruiken `.form-error`.
- Staff success/errors zijn visueel gestyled.
- Queue gebruikt eigen statepresentatie.
- De root error UI toont momenteel `error.message` rechtstreeks.

**UI RULE**

Maak onderscheid tussen validation error, server error, authorization error, unavailable action en network/loading problem. Toon geen technische database- of serverdetails. Root- en serverfouten worden veilig en begrijpelijk gepresenteerd.

---

## 20. Success feedback

**CURRENT**

De staff appointment- en queuepagina’s gebruiken `.success-message` voor lokale success feedback. Auth flows navigeren na succes. Er is geen gedeeld toast-systeem vastgesteld. De interne notificatiebel (zie 8.3 en 36.1) is een vastgelegde notificatiefunctie en geen success-feedbackpatroon; zij vervangt `.success-message` niet en wordt niet als zodanig gebruikt.

**UI RULE**

Succesvolle booking, appointment changes, cancellations, service changes en settings saves krijgen duidelijke feedback via het bestaande success pattern of een later expliciet gekozen gedeeld pattern. Introduceer niet meerdere concurrerende toast/notification-systemen.

---

## 21. Accessibility

### Bestaande positieve patronen

**CURRENT**

- root document heeft `lang="nl"`;
- afbeeldingen hebben doorgaans alt-tekst;
- telefoonactie in staff appointment card heeft een aria-label;
- auth errors gebruiken `role="alert"`;
- modal close button heeft een aria-label;
- native form controls en autocomplete-attributen worden gebruikt.

### Bekende verbeterpunten

De huidige UI heeft onder andere deze accessibility gaps:

- navigaties hebben geen expliciete `aria-label`;
- decoratieve Lucide icons zijn niet consequent `aria-hidden`;
- selectable service cards gebruiken custom radio visuals zonder radio semantics;
- date/time buttons hebben geen selected-state semantics;
- tabs hebben geen tablist/tab/`aria-selected` semantics;
- appointment modal heeft geen volledige dialog semantics, focus management, escape handling of focus trap;
- `Field` koppelt label en input niet expliciet via id/`htmlFor`;
- staff form errors zijn niet aan velden gekoppeld;
- spinner en success message zijn niet als live region ingericht.

**UI RULE**

Nieuwe UI gebruikt semantische HTML, labels, keyboard interaction, zichtbare focus states, native buttons/links, voldoende contrast en statuslabels die niet alleen van kleur afhangen. Bestaande gaps worden niet verhuld en mogen bij featurewerk gericht worden verbeterd zonder onnodig redesign.

---

## 22. Icons

**CURRENT**

De code gebruikt `lucide-react` als icon library. Voorbeelden zijn `House`, `Scissors`, `Clock3`, `CalendarDays`, `CircleUserRound`, `MapPin`, `Phone`, `Navigation`, `Bell`, `Check`, `X`, `Eye`, `Edit3`, `Plus`, `UsersRound`, `UserRound`, `Euro`, `LayoutDashboard`, `ChevronRight`, `Settings`, `Store`, `CalendarClock`, `Coffee` en `ArrowLeft`.

Iconen staan meestal naast tekst of in een vaste card/headerpositie. Bestaande expliciete sizes variëren per context, bijvoorbeeld 15, 17, 18, 19, 20, 21, 22, 24, 27 en 30 pixels.

**UI RULE**

Gebruik `lucide-react` voor nieuwe iconen. Gebruik icon + text voor betekenisvolle acties; icon-only buttons krijgen een toegankelijk label. Decoratieve iconen worden niet als extra tekstuele status gebruikt.

---

## 23. Navigation

Customer- en staff-navigation zijn afzonderlijke bestaande componenten met dezelfde visuele basis.

**CURRENT**

- customer gebruikt vijf vaste bottom-nav items;
- staff gebruikt vier vaste bottom-nav items;
- actieve routes krijgen `active` en goudaccent;
- navigation gebruikt Lucide iconen en tekstlabels;
- navigation is fixed en houdt rekening met safe-area inset in staff navigation;
- op small screens wordt navtekst verkleind;
- er is geen sidebar-navigation.

**UI RULE**

Navigation blijft functioneel gescheiden tussen customer en owner. Een route die niet zichtbaar is in navigation blijft server-side beschermd wanneer dat nodig is. Navigation is nooit authorization.

---

## 24. Auth UI

**CURRENT**

### Login

`Login.tsx` gebruikt een auth page, back-link, logo, eyebrow, grote heading, lead, email- en passwordvelden, primary submit button, inline alert en link naar account creation. Native `required`, autocomplete en disabled submit tijdens submission zijn aanwezig.

### Create account

`CreateAccount.tsx` gebruikt dezelfde auth visual language met naam, email, telefoon, password, submit button, error alert en login-link. Het passwordveld toont een hint met de minimale lengte van 8 tekens en validatiefouten worden als Nederlandse melding getoond, niet als ruwe Zod-fouten.

### Logout

Customer- en staff-profielpagina’s tonen een bestaande logout action met icon en navigeren na logout naar `/login`.

### Auth state

De UI gebruikt echte auth state uit `AuthContext` voor de ingelogde gebruiker en route redirects. `RequireAuth` is een aanvullende client guard; de server loader en Server Functions blijven bepalend.

**UI RULE**

Mock login gedrag wordt niet opnieuw geïntroduceerd. Auth UI representeert echte authentication state en toont geen gevoelige technische foutdetails.

---

## 25. Server state versus UI state

### Server state

De volgende data is domein/server state en hoort uiteindelijk uit Server Functions/backend te komen:

- appointments;
- services;
- availability;
- customer- en staffprofiledata;
- business settings;
- queue;
- notificaties;
- authentication state.

### UI state

De huidige UI gebruikt lokale state voor onder andere:

- geselecteerde service;
- geselecteerde datum;
- geselecteerde tijd;
- formulierinput;
- open/closed modal;
- submission/loading state;
- lokale success/error state;
- demo queue preview state.

`AppointmentContext` en `WaitingListContext` bevatten momenteel lokale mock domeinstate en moeten niet als definitieve server state worden behandeld.

**UI RULE**

UI state mag server state ondersteunen, maar niet simuleren als definitieve bron van waarheid. Persistente data komt uit de server en wordt server-side gevalideerd.

---

## 26. Mock data

`src/data/mockData.ts` bevat hardcoded:

- businessnaam, adres, telefoon, status en opening hours;
- barber identity, rating en image URL;
- drie services met prijzen en duur;
- vijf appointments.

Deze data wordt niet langer geïmporteerd door actuele pagina's; Home, Booking, Queue en de owner-pagina's zijn server-driven. `src/data/mockData.ts` blijft alleen als transitional/legacy bestand staan.

**TRANSITIONAL/LEGACY**

Mock data is prototype-/transition data. Nieuwe productiefunctionaliteit bouwt niet verder op mock data wanneer backend persistence vereist is. Prijzen, duur, openingstijden, saloninformatie, barberinformatie, appointments en queuewaarden worden uiteindelijk server-derived.

---

## 27. Transitional UI

**CURRENT**

- `src/App.tsx` en `src/main.tsx` zijn retained migration placeholders;
- `src/routeTree.gen.ts` is gegenereerde TanStack route output;
- `AppointmentContext` is lokale appointment transition code;
- `WaitingListContext` is lokale queue transition code;
- `Queue.tsx` bevat expliciete `Ontwikkelvoorbeeld` preview states;
- `BookingCard` en dashboard metrics zijn hardcoded demo-presentatie;
- customer bookings hebben geen server retrieval;
- staff appointment actions zijn lokale contextupdates.

**UI RULE/FUTURE**

Generated code wordt niet handmatig als product-UI aangepast. Transitional UI wordt bij backend implementatie vervangen of aangesloten zonder bestaande visual language onnodig te wijzigen. Tijdens deze overgang wordt niets impliciet als productiefunctionaliteit beschouwd.

---

## 28. Data formatting

**CURRENT**

- bedragen worden in de UI als eurotekst getoond, bijvoorbeeld `€ 4.280` en serviceprijzen uit mock data;
- appointment dates gebruiken Nederlandse labels en voorbeelden zoals `14 juni 2026`;
- staff date strip gebruikt Nederlandse weekday/month formatting;
- tijden worden als `HH:mm`-achtige strings getoond;
- duration wordt als tekst naast service weergegeven;
- telefoonnummers worden als tekst en soms als `tel:` link getoond;
- statuslabels zijn Nederlandstalig in de huidige staff UI.

**UI RULE**

Formatteer valuta buiten de database, met integer-cents als bron. Appointment dates en tijden gebruiken business timezone `Europe/Amsterdam`. Historische appointment price/duration komen uit snapshots. Formatting verandert de domeinwaarde niet.

---

## 29. UI versus business rules

De UI mag:

- business rules tonen;
- gebruikers door een flow begeleiden;
- lokale invoer valideren;
- unavailable, loading, empty en error states tonen.

De UI mag niet de definitieve business authority zijn.

Voorbeelden:

- een verborgen of disabled tijdslot betekent niet dat de server een booking accepteert;
- een verborgen button betekent niet dat authorization niet nodig is;
- een weergegeven serviceprijs is niet automatisch de historische appointmentprijs;
- een statusbutton mag geen ongeldige server transition afdwingen;
- lokale overlapcontrole mag geen concurrencybescherming vervangen.

---

## 30. Design consistency rules

Nieuwe UI moet:

1. bestaande components hergebruiken wanneer mogelijk;
2. bestaande CSS tokens en classes gebruiken;
3. bestaande spacing volgen;
4. bestaande typography volgen;
5. bestaande interaction patterns volgen;
6. bestaande customer/owner navigation volgen;
7. bestaande visual hierarchy respecteren;
8. mobile-first blijven;
9. dezelfde status-, error-, loading- en success-taal gebruiken;
10. geen productregel in presentatiecode hardcoderen.

Een developer of AI-agent introduceert niet zelfstandig een nieuw design system.

---

## 31. Wanneer redesign toegestaan is

Een redesign is alleen toegestaan wanneer:

- een expliciete productbeslissing dit vereist;
- bestaande UI een nieuwe requirement aantoonbaar niet kan ondersteunen;
- accessibility een wijziging vereist;
- een bestaand UI-pattern technisch of functioneel ondeugdelijk is.

In alle andere gevallen geldt:

**extend, don't redesign.**

---

## 32. Future UI work

De volgende UI-capaciteiten volgen uit requirements maar bestaan momenteel nog niet volledig:

- server-backed appointment booking en booking confirmation;
- guest booking zonder verplicht account;
- customer appointment retrieval, wijziging en annulering/annuleringsverzoek;
- barber service management;
- opening-hours management;
- break en whole-day block management;
- booking settings;
- cancellation settings;
- salon information management;
- appointment confirmation, overlap en no-show configuration;
- volledige availability UI;
- database-backed queue management;
- customer- en staffprofile editing;
- consistente empty states;
- volledige server-driven loading/error/success patterns;
- accessibilityverbeteringen voor tabs, custom selection, dialogs, labels en live regions.

Deze lijst beschrijft future/transition work, geen aanwezige functionaliteit en geen nieuwe productregels.

---

## 33. Open decisions

Voor notificaties zijn de events, de voorkeuren en de foutafhandeling vastgelegd voor klantenpush (`BUSINESS_RULES.md` §28) en voor eigenaar-notificaties (`BUSINESS_RULES.md` §29). Openstaand blijven:

1. notification events buiten die twee bereiken;
2. user notification preferences buiten de vastgelegde opt-ins en instellingen;
3. failed delivery/retry behavior voor die toekomstige events.

De UI mag voor deze punten geen definitieve waarden, opties, statusflows of queue UX-regels verzinnen. De UI moet toekomstige configuratie kunnen tonen zodra de productbeslissingen zijn vastgelegd.

---

## 34. UI development rules

1. Lees `PRODUCT_REQUIREMENTS.md`.
2. Lees `BUSINESS_RULES.md`.
3. Lees `ARCHITECTURE.md`.
4. Lees `DATABASE_RULES.md`.
5. Inspecteer bestaande UI voordat nieuwe UI wordt gemaakt.
6. Hergebruik bestaande components.
7. Gebruik bestaande design tokens en classes.
8. Geen redesign zonder expliciete reden.
9. Geen business rules uitsluitend in de frontend.
10. Geen mock data introduceren voor productiefunctionaliteit.
11. Houd server state en UI state gescheiden.
12. Behoud en verbeter accessibility.
13. Behoud mobile-first.
14. Houd customer- en barber UI functioneel gescheiden.
15. Introduceer geen multi-barber UI.
16. Introduceer geen nieuwe UI-library zonder expliciete beslissing.
17. Behandel hidden/disabled UI nooit als security boundary.
18. Gebruik de business timezone `Europe/Amsterdam` voor appointmentweergave.

---

## 35. PWA UX

**UI RULE**

- Mobile-first blijft leidend.
- Installatie past natuurlijk binnen de bestaande UI.
- Agressieve install prompts worden niet gebruikt.
- De gebruiker moet kunnen begrijpen waarom installatie wordt aangeboden.
- iOS- en Android-installatie kunnen verschillende UX-instructies vereisen.
- Bestaande branding en design tokens blijven leidend.

Er worden geen concrete installatieschermen of flows verondersteld wanneer deze nog niet bestaan. PWA UX mag de bestaande visuele identiteit niet onnodig wijzigen.

## 36. Notification UX

**UI RULE**

- Notification permission wordt niet zonder context gevraagd.
- Permission wordt op een logisch moment gevraagd.
- De UI houdt rekening met geweigerde permissions.
- Notification settings kunnen later worden toegevoegd wanneer de business rules dit vereisen.
- Notifications sluiten aan op de bestaande visuele identiteit.

De algemene regels hierboven definiëren geen concrete notification-events. De concrete events en flows staan in `BUSINESS_RULES.md` §28 (klantenpush) en §29 (eigenaar-notificaties) en, voor de eigenaar, in 8.3.

### 36.1 Eigenaar-notificatiebel

**UI RULE/FUTURE**

- De interne notificatiebel staat in de owner-header en is onderdeel van de owner-shell; het dashboard is de primaire plek.
- De bel is een icon-only button met een toegankelijk label en een zichtbare teller voor het aantal ongelezen notificaties.
- De meldingenlijst toont de meldingen van de eigenaar; klikken markeert een melding als gelezen en opent de relevante pagina.
- "Alles als gelezen markeren" is beschikbaar zolang er ongelezen meldingen zijn.
- De bel en de teller worden automatisch ververst; een handmatige verversactie is niet vereist.
- Leesstatus en teller komen uit de server; de UI leidt de ongelezenstatus niet client-side af en markeert niets lokaal als gelezen.
- De bewaartermijn van de interne meldingen is vast (30 dagen): meldingen ouder dan 30 dagen zijn niet meer zichtbaar. De UI biedt daarvoor geen instelling en geen optie voor onbeperkte bewaring, en de bewaartermijn hoort niet bij de pushapparaten.
- De bel gebruikt de bestaande topbar-, `Card`- en iconconventies; er komt geen nieuw visueel systeem.
- Notificaties van de eigenaar zijn uitsluitend voor de eigenaar zichtbaar; de UI biedt geen enkele mogelijkheid om andermans meldingen te openen.

### 36.2 Eigenaarpush

**UI RULE/FUTURE**

- Push voor de eigenaar is optioneel en wordt uitsluitend ingeschakeld vanuit een expliciete gebruikersactie; de UI vraagt nooit automatisch toestemming bij het openen, bezoeken of herladen van een pagina.
- De UI toont per apparaat of push aanstaat en biedt de mogelijkheid om push op dat apparaat uit te schakelen.
- De UI maakt expliciet dat push per apparaat geldt en dat meerdere apparaten tegelijk actief kunnen zijn.
- De UI toont geen retentie-instelling voor pushapparaten; technische pushgegevens worden uitsluitend bewaard zolang ze nodig zijn voor verzending (`BUSINESS_RULES.md` §29) en de UI regelt dat niet.
- Er is geen stilteperiode-instelling in v1 en de UI biedt die dus niet aan.
- Wanneer push niet wordt ondersteund of niet is toegestaan, blijft de interne notificatiebel beschikbaar en wordt dat in de UI duidelijk gemaakt.
