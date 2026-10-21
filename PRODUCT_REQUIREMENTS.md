Dan zou ik dit als **document 1 / officiële product-source-of-truth** vastleggen. Ik neem alleen zaken mee die we daadwerkelijk hebben vastgesteld; waar de requirements nog niet definitief zijn, markeer ik dat expliciet.

Je kunt dit vervolgens via OpenCode als `PRODUCT_REQUIREMENTS.md` in de projectroot laten plaatsen.

# Centro Kapper — Product Requirements

**Document:** Product Requirements  
**Versie:** 1.0  
**Status:** Living Document / Source of Truth  
**Project:** Centro Kapper  
**Laatste update:** 2026-10-21

## Current Product Decision

De actuele productbeslissing is leidend boven oudere terminologie in dit document:

- Centro Kapper heeft één eigenaar/beheerder;
- customers en guests gebruiken de publieke functionaliteit;
- er bestaat geen staff-, medewerker- of multi-barberconcept;
- legacy staff-code wordt niet als productfunctionaliteit beschouwd.

---

## 1. Doel van dit document

Dit document beschrijft wat de Centro Kapper-app functioneel moet bieden.

Dit document is de **primaire productmatige source of truth** voor de ontwikkeling van de applicatie.

Technische implementatiekeuzes mogen niet zelfstandig nieuwe productregels introduceren.

Wanneer requirements, bestaande code, mock-data of technische aannames elkaar tegenspreken, moeten de productrequirements leidend zijn.

Onbesliste onderwerpen worden expliciet gemarke als **OPEN BESLISSING** en mogen niet door een developer of AI-agent zelfstandig worden ingevuld.

---

# 2. Productoverzicht

Centro Kapper is een mobiele webapplicatie voor een zelfstandige barber/kapsalon.

De applicatie ondersteunt twee hoofdgroepen gebruikers:

1. **Customer**
2. **Staff / Barber**

De applicatie ondersteunt onder andere:

- informatie over de salon;
- beschikbare diensten;
- online afspraken;
- overzicht van afspraken;
- wachtrij;
- klantprofiel;
- beheer van afspraken door de barber;
- beheer van diensten;
- beheer van prijzen;
- beheer van planning en beschikbaarheid;
- beheer van bedrijfsinstellingen;
- interne meldingen voor de eigenaar via een notificatiebel, met optionele pushmeldingen op eigen apparaten.

De barber moet zoveel mogelijk operationele instellingen zelfstandig vanuit de applicatie kunnen aanpassen, zonder dat hiervoor een codewijziging nodig is.

---

# 3. Gebruikersrollen

## 3.1 Customer

Een customer kan:

- een account aanmaken;
- inloggen;
- uitloggen;
- zijn/haar eigen profiel bekijken;
- beschikbare diensten bekijken;
- beschikbare afspraakmomenten bekijken;
- een afspraak maken;
- eigen afspraken bekijken;
- een eigen afspraak annuleren wanneer dit volgens de geldende regels is toegestaan;
- de wachtrij bekijken wanneer deze functionaliteit beschikbaar is.

Een customer mag nooit gegevens van andere customers kunnen bekijken of wijzigen.

---

## 3.2 Staff / Barber

De barber heeft toegang tot het staff-gedeelte van de applicatie.

De barber kan:

- afspraken bekijken;
- afspraken beheren;
- afspraken aanmaken;
- afspraken wijzigen;
- afspraken annuleren;
- afspraakstatussen beheren;
- klanten beheren voor zover nodig voor de bedrijfsvoering;
- diensten beheren;
- prijzen beheren;
- serviceduur beheren;
- openingstijden beheren;
- pauzes en blokkades beheren;
- boekingsinstellingen beheren;
- bedrijfsinformatie beheren;
- interne meldingen ontvangen en beheren via een notificatiebel;
- pushmeldingen voor eigen apparaten in- en uitschakelen;
- eigen staff-profiel beheren voor zover ondersteund.

Alle staff-functionaliteit moet server-side geautoriseerd worden.

---

# 4. Authenticatie

De applicatie beschikt over veilige authenticatie.

De authenticatie gebruikt:

- Argon2id voor wachtwoordhashing;
- een minimale wachtwoordlengte van 8 tekens bij registratie;
- Nederlandse validatiemeldingen bij registratie in plaats van ruwe Zod-fouten;
- database-backed sessions;
- HTTP-only session cookies;
- session expiry;
- login;
- logout;
- session refresh;
- staff-rollen;
- route guards;
- rate limiting;
- CSRF-bescherming;
- audit logging.

Customers en staff hebben verschillende autorisaties.

Authenticatie en autorisatie mogen nooit uitsluitend door de frontend worden afgedwongen.

---

# 5. Diensten

Centro Kapper werkt met diensten die de barber kan beheren.

Een dienst heeft minimaal:

- naam;
- beschrijving;
- prijs;
- duur;
- actieve/inactieve status.

De barber moet een dienst kunnen:

- aanmaken;
- bekijken;
- wijzigen;
- activeren;
- deactiveren;
- archiveren wanneer de architectuur dit ondersteunt.

## 5.1 Prijzen

Prijzen zijn configureerbaar door de barber.

Een prijs mag niet hardcoded in de frontend worden opgenomen als bedrijfsregel.

Een prijswijziging geldt voor nieuwe afspraken.

Bestaande afspraken mogen door een latere prijswijziging niet automatisch veranderen.

Een afspraak bewaart daarom de prijs die op het moment van boeken voor die afspraak gold.

---

# 6. Serviceduur

De duur van een dienst is configureerbaar door de barber.

Voorbeelden van mogelijke waarden zijn:

- 20 minuten;
- 30 minuten;
- 45 minuten;
- 60 minuten.

Dit zijn voorbeelden en geen vaste productregels.

De daadwerkelijke duur komt uit de actieve dienstconfiguratie.

Wanneer de duur van een dienst later wordt gewijzigd, moeten bestaande afspraken hun oorspronkelijke duur behouden.

Een afspraak bewaart daarom de duur die op het moment van boeken gold.

---

# 7. Planning en openingstijden

De barber moet de bedrijfsplanning vanuit de applicatie kunnen beheren.

Minimaal moet rekening worden gehouden met:

- openingstijd per dag;
- sluitingstijd per dag;
- gesloten dagen;
- pauzes;
- tijdelijke blokkades;
- bestaande afspraken.

Openingstijden mogen niet hardcoded zijn in de booking-engine.

De bestaande database bevat hiervoor:

- `opening_hours`;
- `break_periods`.

Deze configuratie moet leidend zijn voor het berekenen van beschikbaarheid.

---

# 8. Starttijden

Er is een **vast bookinginterval van 15 minuten**. Dit interval geldt voor zowel customers als staff.

Beschikbare starttijden zijn gebonden aan 15-minutenintervallen, bijvoorbeeld 09:00, 09:15, 09:30 en 09:45. Een beschikbare starttijd wordt bepaald op basis van:

- openingstijden;
- breaks;
- whole-day blocks;
- bestaande bezette afspraken;
- service duration;
- algemene buffer;
- het vaste bookinginterval van 15 minuten.

Een afspraak moet volledig binnen de beschikbare periode passen. Service durations blijven dynamisch. De buffer blijft gelden. Wanneer een afspraak inclusief buffer eindigt op een niet-geïntervalleerd tijdstip, is het volgende beschikbare slot het eerstvolgende 15-minuteninterval. Een afspraak die inclusief buffer om 11:40 eindigt, maakt dus 11:45 beschikbaar als volgend slot.

Er wordt geen configureerbare `slot_interval`-setting geïmplementeerd; het interval staat vast op 15 minuten.

**Status: BESLOTEN**

---

# 9. Beschikbaarheid

Beschikbaarheid wordt server-side berekend.

Bij het bepalen van beschikbare tijden moet minimaal rekening worden gehouden met:

- openingstijden;
- gesloten dagen;
- pauzes;
- tijdelijke blokkades;
- bestaande afspraken;
- duur van de geselecteerde dienst;
- buffer;
- huidige datum/tijd;
- geldende boekingsregels.

De frontend mag beschikbare slots tonen, maar de server moet bij het daadwerkelijk maken van een afspraak opnieuw controleren of het gekozen tijdstip nog beschikbaar is, inclusief de geconfigureerde buffer.

Een eerder getoond slot is dus nooit automatisch gegarandeerd beschikbaar.

---

# 10. Afspraken

Een afspraak bevat minimaal informatie over:

- customer;
- dienst;
- dienstnaam op het moment van boeken;
- prijs op het moment van boeken;
- duur op het moment van boeken;
- starttijd;
- eindtijd;
- status;
- bron;
- eventuele notitie;
- timestamps.

## 10.1 Historische snapshots

De volgende gegevens van een afspraak moeten historisch stabiel blijven:

- dienstnaam;
- prijs;
- duur.

Wanneer de barber later een dienst wijzigt, mogen bestaande afspraken hierdoor niet historisch veranderen.

---

# 11. Afspraakstatussen

De applicatie ondersteunt momenteel de volgende afspraakstatussen:

- `new`
- `confirmed`
- `in_progress`
- `completed`
- `cancelled`
- `no_show`

Statusovergangen moeten server-side worden gevalideerd.

Een gebruiker mag niet willekeurig een afspraakstatus naar iedere gewenste waarde veranderen.

De exacte status-transition matrix wordt vastgelegd in `BUSINESS_RULES.md`.

---

# 12. Afspraakbeheer door de barber

De barber moet afspraken kunnen beheren.

Dit omvat minimaal:

- afspraken bekijken;
- afspraakdetails bekijken;
- afspraak aanmaken;
- afspraak wijzigen;
- afspraak annuleren;
- afspraak bevestigen;
- afspraak starten;
- afspraak afronden;
- afspraak als no-show markeren.

De server bepaalt of een bepaalde wijziging is toegestaan.

---

# 13. Customer-afspraken

Een customer mag uitsluitend zijn/haar eigen afspraken beheren.

Een customer mag:

- eigen afspraken bekijken;
- een afspraak maken;
- een eigen afspraak annuleren wanneer toegestaan.

Een customer mag:

- geen afspraken van andere customers bekijken;
- geen afspraken van andere customers wijzigen;
- geen staff-functionaliteit uitvoeren;
- geen afspraakstatussen buiten de toegestane customer-acties wijzigen.

---

# 14. Afspraakconflicten

Twee afspraken mogen niet overlappen wanneer ze dezelfde barbercapaciteit gebruiken.

Omdat Centro Kapper momenteel als single-barber applicatie wordt ontwikkeld, is er één beschikbare barbercapaciteit.

De controle op overlap moet server-side en database-veilig worden uitgevoerd.

Client-side controles zijn uitsluitend aanvullende UX-validatie en mogen niet als beveiligings- of integriteitsmechanisme worden beschouwd.

Bij gelijktijdige boekingspogingen moet de database/domainlaag voorkomen dat twee conflicterende afspraken worden aangemaakt.

---

# 15. Boekingsflow

De customer booking flow bestaat conceptueel uit:

1. beschikbare diensten ophalen;
2. dienst selecteren;
3. datum selecteren;
4. beschikbare tijden ophalen;
5. tijd selecteren;
6. afspraakgegevens bevestigen;
7. server-side beschikbaarheid opnieuw controleren;
8. afspraak transactioneel aanmaken;
9. succesvolle boeking tonen.

De frontend mag geen beschikbaarheid als definitief beschouwen zonder server-side validatie bij het aanmaken.

---

# 16. Saloninstellingen

De barber moet relevante bedrijfsinformatie vanuit de applicatie kunnen beheren.

Dit kan onder andere oatten:

- salonnaam;
- barbernaam;
- adres;
- telefoonnummer;
- overige openbare bedrijfsinformatie.

De exacte lijst wordt verder vastgesteld in de settings-specificatie.

Informatie die door de barber beheerd moet kunnen worden, mag niet als permanente hardcoded business data in componenten worden opgeslagen.

---

# 17. Wachtrij

De applicatie bevat een wachtrijfunctionaliteit.

De wachtrij ondersteunt beide situaties:

- walk-ins;
- klanten die geen passende online beschikbaarheid kunnen vinden.

## Aanmelden

- Een klant kan zichzelf via de app aanmelden.
- De barber kan een walk-in handmatig toevoegen.
- Beide komen in dezelfde wachtrij terecht.
- Bij iedere wachtrij-aanmelding is een **servicekeuze verplicht**.

## Volgorde

De wachtrij werkt volgens **FIFO — First In, First Out**.

## Wachtrijstatussen

Gebruik conceptueel minimaal: `waiting`, `called`, `in_service`, `completed`, `cancelled`, `skipped`.

## Called

Wanneer de barber een klant oproept, ontvangt de klant een pushnotificatie en ziet hij/zij in de app dat hij/zij aan de beurt is.

## Start behandeling

`called` wordt niet automatisch `in_service`. De barber moet expliciet de behandeling starten.

## Niet reageren

Als een klant niet reageert op een `called`-status, kan de barber de klant overslaan en bepalen of de klant definitief wordt verwijderd of opnieuw achteraan wordt geplaatst.

## Zelf verlaten

Een klant kan zichzelf altijd uit de actieve wachtrij verwijderen.

## Afhandeling

Bij afhandeling wordt de actieve entry beëindigd en als historie geregistreerd. Er wordt niet automatisch een afspraak aangemaakt.

## Geschatte wachttijd

De klant ziet huidige positie, aantal wachtenden en geschatte wachttijd. De schatting is `sum(service duration + configured buffer)` per actieve wachtrij-entry vóór de klant.

De geschatte wachttijd is een indicatie en geen garantie.

**Status: BESLOTEN — queue businessregels zijn definitief; implementatie vindt plaats in de Queue Domain-fase**

---

# 18. Featuregedrag

Functionaliteit die bedrijfsmatig optioneel is, moet waar relevant via configuratie/feature flags kunnen worden in- of uitgeschakeld.

De frontend moet rekening houden met de actieve featureconfiguratie.

Feature flags zijn echter geen vervanging voor autorisatie.

Een uitgeschakelde feature moet niet alleen uit de UI verdwijnen; relevante serverfunctionaliteit moet eveneens correct worden beschermd.

---

# 19. Publieke versus beveiligde functionaliteit

Publieke functionaliteit kan zonder authenticatie beschikbaar zijn wanneer dit productmatig gewenst is.

Voorbeelden kunnen zijn:

- saloninformatie;
- diensten;
- openingstijden;
- beschikbare boekingsmomenten;
- account aanmaken;
- login.

Persoonlijke klantgegevens en klantafspraken zijn beveiligd.

Staff-functionaliteit is uitsluitend beschikbaar voor geautoriseerde staff-gebruikers.

---

# 20. Mobiele gebruikerservaring

De applicatie is primair ontworpen als mobiele webapplicatie.

De bestaande UI/UX en visuele identiteit zijn leidend.

Nieuwe functionaliteit moet:

- aansluiten op de bestaande visuele stijl;
- bestaande componenten hergebruiken waar passend;
- geen onnodige redesigns introduceren;
- mobiel goed bruikbaar zijn;
- duidelijke feedback geven bij acties;
- loading-, error- en empty states correct ondersteunen.

Functionele uitbreiding mag de bestaande productidentiteit niet zonder reden veranderen.

---

# 21. Data-integriteit

Bedrijfsregels die de integriteit van gegevens bepalen moeten server-side worden afgedwongen.

Voorbeelden:

- afspraakconflicten;
- customer ownership;
- staff authorization;
- toegestane statusovergangen;
- actieve diensten;
- historische afspraakgegevens;
- geldige openingstijden;
- geldige pauzes;
- geldige tijdstippen.

Frontend-validatie is aanvullende UX-validatie en nooit de enige beveiligingslaag.

---

# 22. Configuratie versus hardcoded waarden

De volgende categorieën mogen niet zonder expliciete productreden hardcoded worden:

- dienstprijzen;
- serviceduur;
- openingstijden;
- pauzes;
- buffer;
- saloninformatie;
- barberinformatie;
- andere bedrijfsinstelingen die de barber vanuit de applicatie moet kunnen wijzigen.

Technische constanten mogen uiteraard wel bestaan wanneer ze geen bedrijfsmatige configuratie vertegenwoordigen.

---

# 23. Single-barber uitgangspunt

De huidige applicatie is ontworpen voor één barber.

Daarom hoeft de huidige architectuur niet onnodig complex te worden gemaakt voor multi-barber support.

Een toekomstige uitbreiding naar meerdere barbers kan later worden ontworpen wanneer daar een concrete productbehoefte voor bestaat.

Tot die tijd moet de implementatie de huidige single-barber bedrijfsvoering correct ondersteunen.

---

# 24. Beheerbaarheid als productprincipe

Een belangrijk productprincipe van Centro Kapper is:

> De barber moet de dagelijkse bedrijfsvoering kunnen aanpassen zonder afhankelijk te zijn van een developer.

Daarom moeten operationele instellingen waar mogelijk via het staff-gedeelte van de applicatie beheerd kunnen worden.

Een developer hoeft bijvoorbeeld niet de code aan te passen wanneer de barber:

-  prijs van een dienst verandert;
- een dienst tijdelijk uitschakelt;
- de duur van een dienst verandert;
- openingstijden verandert;
- een pauze toevoegt;
- een tijdelijke blokkade instelt;
- de buffer aanpast;
- bedrijfsinformatie wijzigt.

---

# 25. Nog vast te leggen productbeslissingen

Onderstaande onderwerpen zijn nog niet definitief vastgesteld.

Ze moeten expliciet worden besloten voordat de betreffende functionaliteit als definitief wordt geïmplementeerd.

### Notifications

De events, de verplichtheid versus optionaliteit, de voorkeuren en de foutafhandeling zijn vastgelegd voor klantenpush v1 (`BUSINESS_RULES.md` §28) en voor eigenaar-notificaties v1 (`BUSINESS_RULES.md` §29). Openstaand blijft:

- Welke notification events buiten die twee bereiken moeten worden ondersteund, bijvoorbeeld appointment confirmation, reminders of terugkerende meldingen?
- Welke user notification preferences komen daarvoor beschikbaar, naast de expliciete opt-in per wachtrijvermelding (§28) en de expliciete pushopt-in per apparaat (§29)?
- Hoe moeten failed deliveries en retries worden behandeld voor die toekomstige events?

### PWA

- Is offline functionality gewenst?
- Welke gegevens mogen offline beschikbaar zijn?
- Is background synchronization vereist?

---

# 26. Besluitvormingsregel

Wanneer tijdens ontwikkeling een requirement ontbreekt, mag de developer of AI-agent niet zelfstandig een nieuwe bedrijfsregel introduceren.

De correcte procedure is:

1. ontbrekende beslissing identificeren;
2. deze als open beslissing rapporteren;
3. productbeslissing vastleggen;
4. `PRODUCT_REQUIREMENTS.md` en/of `BUSINESS_RULES.md` bijwerken;
5. daarna pas implementeren.

---

# 27. Status van dit document

Dit document vormt de eerste versie van de productmatige source of truth.

Nieuwe requirements moeten gecontroleerd aan dit document worden toegevoegd.

Technische documenten mogen de productrequirements niet tegenspreken.

Bij conflicten geldt:

**Product requirement → business rule → architectuur → implementatie.**

---

## 28. PWA & Mobile Installation

Centro Kapper moet een **Progressive Web App (PWA)** zijn.

De applicatie moet installeerbaar zijn op ondersteunde mobiele devices en zowel iOS als Android ondersteunen. De geïnstalleerde webapp moet een app-achtige mobiele ervaring bieden, zonder dat daarmee wordt gesuggereerd dat de PWA technisch identiek is aan een native iOS- of Android-app.

De bestaande mobile-first UI blijft leidend. PWA-functionaliteit mag het bestaande visuele ontwerp niet onnodig veranderen en moet aansluiten op de bestaande branding, componenten en interaction patterns.

Installatie moet mogelijk zijn via een veilige HTTPS-deployment. PWA-installatie en runtime moeten rekening houden met platformverschillen tussen iOS en Android.

## 29. Push Notifications

Centro Kapper moet web push notifications ondersteunen op ondersteunde mobiele platformen. Push notifications zijn bedoeld voor relevante communicatie met customers en barber/staff.

De notification-capability moet aan de volgende productvereisten voldoen:

- notifications worden server-side aangestuurd;
- push subscriptions of device registrations kunnen persistent worden opgeslagen;
- de architectuur ondersteunt meerdere devices of subscriptions per gebruiker;
- notification delivery is niet uitsluitend afhankelijk van een actieve browserpagina;
- delivery gaat veilig om met authenticatie, autorisatie en privacy.

De notification-events zijn deels vastgelegd: klantenpush v1 in `BUSINESS_RULES.md` §28 en eigenaar-notificaties v1 in §30 van dit document. Events buiten die twee vastgelegde bereiken — bijvoorbeeld appointment confirmation, reminders of terugkerende meldingen — zijn nog geen vastgelegd gedrag en blijven open.

## 30. Eigenaar-notificaties

De eigenaar krijgt een **interne notificatiebel** in het eigenaarsgedeelte van de applicatie, met een ongelezen teller en een meldingenlijst. Daarnaast kan de eigenaar **optionele pushmeldingen** voor zijn eigen apparaten inschakelen.

De productregels staan in `BUSINESS_RULES.md` §29 (Eigenaar-notificaties v1). Dat document is leidend; dit document legt de productvereisten vast.

De applicatie ondersteunt de volgende gebeurtenissen voor de eigenaar:

- nieuwe wachtrij-inschrijving;
- nieuwe afspraak;
- annulering (iedere daadwerkelijke afspraakstatusovergang naar `cancelled`);
- klant verlaat de wachtrij.

Productvereisten:

- een door de eigenaar zelf aangemaakte walk-in levert geen melding op;
- de interne bel is toegeschermd en alleen voor de eigenaar zichtbaar;
- de interne bel mag de klantnaam tonen; pushmeldingen bevatten geen klantnaam en geen andere persoonsgegevens;
- klikken op een melding markeert deze als gelezen en opent de relevante pagina; "alles als gelezen markeren" is beschikbaar;
- de bewaartermijn van de interne meldingen is vast 30 dagen; meldingen worden na 30 dagen automatisch verwijderd, ongeacht of ze gelezen of ongelezen zijn, en er is geen instelling voor onbeperkte bewaring;
- push is optioneel, vereist expliciete toestemming, ondersteunt meerdere apparaten en is per apparaat uit te schakelen;
- er is geen stilteperiode in v1;
- annuleringen verschijnen in de interne bel en worden via push gemeld wanneer push is ingeschakeld;
- een notificatie- of pushfout laat de kernactie niet mislukken;
- het aanmaken van een melding is idempotent; één afspraakstatusovergang naar `cancelled` levert precies één melding op;
- technische pushgegevens van de eigenaar worden uitsluitend bewaard zolang ze nodig zijn voor verzending, retries, herstel en deduplicatie en worden daarna veilig opgeschoord, zonder vaste bewaartermijn;
- actieve, geldige pushabonnementen van de eigenaar worden bewaard zolang ze nodig zijn voor verzending en worden niet verwijderd vanwege de bewaartermijn van meldingen;
- alleen de eigenaar mag zijn meldingen beheren;
- klantenpush blijft volledig gescheiden van eigenaarpush;
- de notificatiebel ververst automatisch.

## 31. Aanvullende open beslissingen

### Notifications

De events, de verplichtheid versus optionaliteit, de voorkeuren en de foutafhandeling zijn vastgelegd voor klantenpush v1 (`BUSINESS_RULES.md` §28) en voor eigenaar-notificaties v1 (`BUSINESS_RULES.md` §29). Openstaand blijft:

- Welke notification events buiten die twee bereiken moeten worden ondersteund, bijvoorbeeld appointment confirmation, reminders of terugkerende meldingen?
- Welke user notification preferences komen daarvoor beschikbaar, naast de expliciete opt-in per wachtrijvermelding (§28) en de expliciete pushopt-in per apparaat (§29)?
- Hoe moeten failed deliveries en retries worden behandeld voor die toekomstige events?

### PWA

- Is offline functionality gewenst?
- Welke gegevens mogen offline beschikbaar zijn?
- Is background synchronization vereist?
