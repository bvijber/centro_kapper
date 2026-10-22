# Centro Kapper — Business Rules

**Document:** Business Rules  
**Versie:** 1.0  
**Status:** Living Document / Source of Truth  
**Project:** Centro Kapper  
**Laatste update:** 2026-10-21

---

## 1. Doel

Dit document bevat de concrete bedrijfsregels van Centro Kapper.

De regels in dit document bepalen het gewenste gedrag van de applicatie.

Technische implementatie mag deze regels niet zelfstandig veranderen of aanvullen.

Wanneer een bedrijfsregel nog niet is besloten, wordt deze expliciet gemarkeerd als:

`OPEN BESLISSING`

Een developer of AI-agent mag een `OPEN BESLISSING` niet zelfstandig invullen.

---

# 2. Customer booking

## Account

Customers mogen een afspraak maken zonder een account.

**Status: BESLOTEN**

## Beschikbaarheid

Customers kunnen uitsluitend kiezen uit automatisch berekende beschikbare tijdstippen.

Een bezet tijdstip wordt niet aangeboden.

De volledige duur van de gekozen dienst moet beschikbaar zijn.

Beschikbaarheid houdt rekening met:

- openingstijden;
- gesloten dagen;
- pauzes;
- blokkades;
- bestaande afspraken;
- serviceduur;
- buffer;
- huidige datum/tijd.

**Status: BESLOTEN**

## Ambigue lokale tijden tijdens DST fall-back

Tijdens de `Europe/Amsterdam` fall-back kan dezelfde lokale kloktijd twee keer voorkomen. Wanneer een lokale tijd daardoor ambigu is, wordt de vroegste geldige absolute instantie gebruikt.

Dezelfde lokale kloktijd wordt slechts één keer als booking slot aangeboden. Er worden geen dubbele lokale booking slots aangeboden voor de twee mogelijke instanties van die kloktijd.

**Status: BESLOTEN**

## Buffer

De barber configureert één algemene buffer in minuten.

De buffer wordt toegepast tussen afspraken. Totale bezette tijd voor beschikbaarheidsberekening is:

`service duration + configured buffer`

**Status: BESLOTEN**

---

# 3. Starttijden en slot interval

Er is een **vast bookinginterval van 15 minuten**.

Beschikbare starttijden zijn gebonden aan 15-minutenintervallen, bijvoorbeeld 09:00, 09:15, 09:30 en 09:45. Dit interval geldt voor zowel customers als de eigenaar. Een beschikbare starttijd wordt bepaald op basis van:

- openingstijden;
- breaks;
- whole-day blocks;
- bestaande bezette afspraken;
- service duration;
- algemene buffer;
- het vaste bookinginterval van 15 minuten.

Een afspraak moet volledig binnen de beschikbare periode passen. Service durations blijven dynamisch, bijvoorbeeld 35 minuten. De buffer blijft gelden. Wanneer een afspraak inclusief buffer eindigt op een niet-geïntervalleerd tijdstip, is het volgende beschikbare slot het eerstvolgende 15-minuteninterval. Een afspraak die inclusief buffer om 11:40 eindigt, maakt dus 11:45 beschikbaar als volgend slot.

Er wordt geen configureerbare `slot_interval`-setting geïmplementeerd; het interval staat vast op 15 minuten.

**Status: BESLOTEN**

---

# 4. Vooruit boeken

Klanten mogen **onbeperkt vooruit boeken**.

Er wordt geen einddatum of maximum aantal dagen vooruit als booking-horizon afgedwongen. Er wordt geen onnodige `booking_horizon_days`-setting aangemaakt zolang onbeperkt de definitieve regel is.

**Status: BESLOTEN**

---

# 5. Minimale boekingstijd

Er is geen minimale tijd tussen het boeken en de afspraak.

Een customer mag dus, zolang het tijdstip beschikbaar is, ook op korte termijn boeken.

**Status: BESLOTEN**

Same-day booking is daarmee toegestaan zolang het tijdstip nog beschikbaar is.

---

# 6. Openingstijden

De barber kan openingstijden per weekdag beheren.

Per dag is één openingstijdblok voldoende.

Bijvoorbeeld:

`09:00 – 18:00`

Meerdere afzonderlijke openingstijdblokken op dezelfde dag zijn momenteel geen requirement.

**Status: BESLOTEN**

---

# 7. Tijdelijke blokkades

De barber kan dagen volledig blokkeren.

Een tijdelijke blokkade geldt voor een volledige dag.

Blokkades voor slechts een gedeelte van een dag zijn momenteel geen requirement.

**Status: BESLOTEN**

---

# 8. Diensten

De barber kan diensten beheren.

Minimaal:

- naam;
- beschrijving;
- prijs;
- duur;
- actief/inactief.

Een dienst kan worden gedeactiveerd/gearchiveerd in plaats van fysiek verwijderd.

**Status: BESLOTEN**

---

# 9. Prijs en serviceduur

De barber kan prijs en duur van een dienst wijzigen.

Nieuwe afspraken gebruiken de actuele configuratie.

Bestaande afspraken behouden hun oorspronkelijke:

- dienstnaam;
- prijs;
- duur.

Historische afspraakgegevens worden niet automatisch aangepast door een wijziging aan de dienst.

**Status: BESLOTEN**

---

# 10. Customer afspraak wijzigen

Een customer mag een eigen afspraak wijzigen.

Dit mag naar:

- een andere datum;
- een ander tijdstip;
- een andere dienst.

Bij wijzigen wordt de nieuwe afspraak volledig opnieuw gevalideerd.

Het nieuwe moment moet beschikbaar zijn en voldoen aan alle geldende boekingsregels.

**Status: BESLOTEN**

Er geldt momenteel geen aparte wijzigingstermijn.

---

# 11. Customer annuleren

Een customer kan een eigen afspraak annuleren tot **24 uur vóór de afspraak**.

Binnen 24 uur vóór de afspraak kan de customer de afspraak niet meer zelfstandig annuleren.

De customer kan dan wel een **annuleringsverzoek** indienen bij de barber.

De barber beslist vervolgens wat ermee gebeurt.

Het annuleren van een afspraak levert een interne notificatie voor de eigenaar op (zie §29).

**Status: BESLOTEN**

---

# 12. Geannuleerde afspraken

Wanneer een afspraak wordt geannuleerd, telt deze niet langer als bezette capaciteit voor de beschikbaarheidsberekening.

Het vrijgekomen tijdstip kan daardoor direct opnieuw beschikbaar worden voor customers, mits het verder aan alle regels voldoet.

**Status: BESLOTEN**

---

# 13. Barber beheer van afspraken

De barber heeft volledige operationele controle over afspraken.

De barber kan:

- afspraken bekijken;
- afspraken aanmaken;
- afspraken wijzigen;
- afspraken annuleren;
- afspraken bevestigen;
- afspraken starten;
- afspraken afronden;
- afspraken als `no_show` markeren.

De barber mag een bestaande afspraak volledig wijzigen, inclusief:

- klant;
- dienst;
- datum;
- tijd.

**Status: BESLOTEN**

---

# 14. Barber boeken buiten normale beschikbaarheid

Bij handmatig door de barber gemaakte of aangepaste afspraken kan de barber de normale beschikbaarheidsregels overrulen voor:

1. openingstijden;
2. break periods;
3. whole-day blocks.

Dit geldt uitsluitend voor normale klantboekingsregels. Dit is een bewuste barber-actie en verandert de normale customer availability niet.

Customers zien dergelijke uitzonderlijke barber-afspraken niet automatisch als beschikbare slots.

**Status: BESLOTEN**

---

# 15. Overlappende afspraken

Overlap is configureerbaar. Default gedrag: **overlap blokkeren**.

Wanneer de barber overlap toestaat:

1. de applicatie detecteert het conflict;
2. de barber krijgt een duidelijke waarschuwing;
3. de barber moet de conflictueuze afspraak expliciet bevestigen;
4. er mag nooit stilzwijgend een conflict worden aangemaakt.

Customers mogen nooit overlappende afspraken creëren of een overlap forceren.

**Status: BESLOTEN — configureerbaar, default: blokkeren**

---

# 16. Online afspraakbevestiging

Een online door een klant gemaakte afspraak krijgt standaard status:

`new`

De afspraak wordt niet automatisch `confirmed`. De barber moet de afspraak handmatig bevestigen.

Implementeer geen automatische online confirmation.

**Status: BESLOTEN**

---

# 17. No-show

Een `no_show`-afspraak blijft als historische afspraak geregistreerd.

Wanneer de barber een afspraak als `no_show` markeert, wordt het bijbehorende tijdslot altijd automatisch vrijgegeven, zodat het weer beschikbaar kan worden voor nieuwe boekingen. De vrijgave gebeurt atomair met de statusovergang. De `no_show`-status zelf blijft behouden.

**Status: BESLOTEN — altijd automatisch vrijgeven**

---

# 18. Terminale afspraken

Wanneer een afspraak de status:

- `completed`;
- `cancelled`;
- `no_show`

heeft bereikt, mag deze niet meer via de normale afspraakflow worden gewijzigd.

**Status: BESLOTEN**

Eventuele administratieve correcties zijn een aparte functionaliteit en vormen geen normale afspraakwijziging.

---

# 19. Appointment source

De barber hoeft bij het aanmaken van een afspraak geen bron te selecteren.

Bronnen zoals:

- telefoon;
- WhatsApp;
- walk-in;
- online;
- staff

zijn geen afzonderlijke productfunctionaliteit voor de barber.

Een eventueel bestaand technisch `source`-veld mag alleen blijven bestaan wanneer daar een aantoonbare technische of administratieve reden voor is.

**Status: BESLOTEN**

---

# 20. Wachtrij

De wachtrij ondersteunt beide situaties:

- walk-ins;
- klanten die geen passende online beschikbaarheid kunnen vinden.

## Doel

De wachtrij is onderdeel van de productfunctionaliteit.

**Status: BESLOTEN**

## Aanmelden

- Een klant kan zichzelf via de app aanmelden.
- De barber kan een walk-in handmatig toevoegen.
- Beide komen in dezelfde wachtrij terecht.
- Bij iedere wachtrij-aanmelding is een **servicekeuze verplicht**.

Een aanmelding door een klant of gast levert een interne notificatie voor de eigenaar op (zie §29). Een walk-in die de eigenaar zelf toevoegt levert geen notificatie op.

## Volgorde

De wachtrij werkt volgens **FIFO — First In, First Out**:

- vroegste actieve aanmelding komt eerst;
- geen handmatige herorden.

## Opnieuw aanmelden

Een klant mag meerdere keren een wachtrij-aanmelding doen.

Een eerdere verlaten/afgehandelde entry wordt niet hergebruikt; een nieuwe aanmelding krijgt een nieuwe positie.

## Wachtrijstatussen

Gebruik conceptueel minimaal:

- `waiting`
- `called`
- `in_service`
- `completed`
- `cancelled`
- `skipped`

De exacte persistence-implementatie wordt pas bepaald tijdens de Queue Domain-fase.

## Called

Wanneer de barber een klant oproept:

- status wordt `called`;
- klant ontvangt later een pushnotificatie;
- de klant ziet ook in de app duidelijk dat hij/zij aan de beurt is.

## Start behandeling

`called` wordt niet automatisch `in_service`.

De barber moet expliciet de behandeling starten.

Flow: `waiting → called → in_service → completed`

## Niet reageren

Als een klant niet reageert op een `called`-status:

- de barber kan de klant overslaan;
- de barber bepaalt vervolgens per geval:
  - definitief uit de actieve wachtrij verwijderen;
  - of opnieuw achteraan plaatsen.

De FIFO-volgorde moet daarbij behouden blijven.

## Zelf verlaten

Een klant kan zichzelf **altijd** uit de actieve wachtrij verwijderen.

De historische registratie blijft behouden.

Het verlaten van de wachtrij door een klant of gast levert een interne notificatie voor de eigenaar op (zie §29).

## Behandeling annuleren

Een barber kan een wachtrij-item met status `in_service` annuleren.

Flow: `in_service → cancelled`

## Afhandeling

Wanneer een klant geholpen is:

- de actieve wachtrij-entry wordt beëindigd;
- de entry blijft als historie geregistreerd;
- er wordt niet automatisch een afspraak aangemaakt.

## Geschatte wachttijd

De klant ziet:

- huidige positie;
- aantal wachtenden vóór hem/haar;
- geschatte wachttijd.

De geschatte wachttijd wordt berekend op basis van de actieve klanten vóór deze klant:

`sum(service duration + configured buffer)`

Omdat de servicekeuze verplicht is, is voor iedere actieve wachtrij-entry een service duration beschikbaar.

De geschatte wachttijd is een indicatie en geen garantie.

---

# 21. Saloninformatie

De barber kan relevante bedrijfsinformatie beheren.

Minimaal moet rekening worden gehouden met:

- salonnaam;
- barbernaam;
- adres;
- telefoonnummer.

**Status: BESLOTEN**

---

# 22. Single-barber model

Centro Kapper is een single-barber applicatie.

Er wordt geen aparte multi-barber bedrijfslogica geïntroduceerd zolang daar geen productrequirement voor bestaat.

De barber is de beheerder van de applicatie.

Er hoeft productmatig geen onderscheid te worden gemaakt tussen:

- staff;
- medewerker;
- barber.

Voor de huidige applicatie is de primaire operationele beheerder simpelweg:

**de barber**.

---

# 23. Belangrijke beschikbaarheidsregel

Een afspraak is alleen geldig wanneer de volledige afspraakduur plus de geconfigureerde buffer past.

Bijvoorbeeld:

Een dienst duurt 45 minuten en de buffer is 15 minuten. Totale bezette tijd is 60 minuten.

Een starttijd om 17:30 is alleen beschikbaar wanneer:

`17:30 – 18:30`

volledig beschikbaar is.

Het feit dat `17:30` zelf vrij is, is onvoldoende.

De volledige tijdsrange moet beschikbaar zijn.

---

# 24. Server-side afdwinging

Alle bovenstaande bedrijfsregels die invloed hebben op data-integriteit, beschikbaarheid, autorisatie of afspraken moeten server-side worden afgedwongen.

Frontend-validatie is alleen aanvullende UX-validatie.

De server moet bij het daadwerkelijk maken of wijzigen van een afspraak opnieuw controleren:

- beschikbaarheid;
- dienst;
- duur;
- buffer;
- openingstijden;
- blokkades;
- bestaande afspraken;
- gebruikersrechten;
- relevante business rules.

---

# 25. Configuratieprincipe

Wanneer een bedrijfsregel door de barber configureerbaar is, mag de waarde niet hardcoded worden in de booking-engine.

Dit geldt onder andere voor:

- buffer;
- annuleringstermijn (24 uur);
- buiten normale beschikbaarheid boeken;
- overlappende afspraken (default: blokkeren);
- handmatige bevestiging;
- dienstprijzen;
- serviceduur;
- openingstijden.

---

# 26. Open beslissingen

De volgende onderwerpen zijn nog niet definitief vastgesteld:

1. notification events buiten Web Push v1 (v1 ondersteunt uitsluitend `called`, zie §28) en buiten Eigenaar-notificaties v1 (zie §29);
2. algemene user notification preferences buiten de v1 opt-in per wachtrijvermelding (§28) en buiten de expliciete pushopt-ins van Eigenaar-notificaties v1 (§29);
3. notificatiekanalen buiten Web Push (e-mail en sms zijn geen onderdeel van v1).

Failed delivery/retry behavior is voor Web Push v1 vastgelegd in §28 en voor Eigenaar-notificaties v1 in §29. Afwijkende retry- of bewaarregels voor toekomstige events zijn nog open.

Deze punten mogen niet zelfstandig door een developer of AI-agent worden ingevuld.

---

# 27. Besluitvormingsprocedure

Wanneer tijdens de ontwikkeling een niet-vastgelegde bedrijfsregel wordt aangetroffen:

1. identificeer de ontbrekende beslissing;
2. markeer deze als `OPEN BESLISSING`;
3. bespreek de beslissing;
4. werk dit document bij;
5. implementeer de regel pas daarna.

Een technische implementatie mag nooit zelfstandig een ontbrekende productbeslissing introduceren.

---

## 28. Notifications

### Notification capability

Het systeem moet relevante operationele en customer notifications kunnen ondersteunen.

De notificatiefunctionaliteit bestaat uit twee gescheiden onderdelen:

- **Web Push v1** (§28) — pushmeldingen voor klanten in de wachtrij;
- **Eigenaar-notificaties v1** (§29) — de interne notificatiebel voor de eigenaar en de optionele pushmeldingen voor de eigenaar.

Beide onderdelen hebben elk hun eigen events, retentie, toestemming en foutafhandeling. Wat §28 vastlegt, geldt uitsluitend voor klantenpush en wordt niet uitgebreid door §29; wat §29 vastlegt, geldt uitsluitend voor de eigenaar.

### Notification business rules (Web Push v1)

**Status: BESLOTEN — Web Push v1**

De onderstaande regels zijn definitief voor Web Push v1. De technische implementatie is nog niet uitgevoerd; §28 beschrijft uitsluitend productregels, geen bestaande functionaliteit.

Notifications mogen geen ongeautoriseerde of privacygevoelige informatie aan verkeerde gebruikers leveren.

#### Notificatiemoment

Web Push v1 verstuurt uitsluitend een notificatie wanneer een wachtrijvermelding daadwerkelijk overgaat naar status `called`. Alleen een nieuwe statusovergang naar `called` activeert de notificatie. Als een klant push pas activeert nadat de vermelding al `called` is, wordt geen notificatie met terugwerkende kracht verstuurd.

#### Opt-in en toestemming

De klant activeert push expliciet via een knop op de eigen wachtrijpagina. Browsertoestemming wordt uitsluitend na die expliciete gebruikersactie gevraagd, nooit automatisch bij het laden of bezoeken van een pagina. De wachtrij blijft bruikbaar als push niet wordt ondersteund, niet is toegestaan of niet wordt geactiveerd. De klant kan push vanuit de wachtrijpagina uitschakelen en kan daarnaast de browsertoestemming via de browserinstellingen intrekken.

#### Inhoud van de notificatie

De notificatie gebruikt exact deze generieke tekst:

- Titel: `Centro Kapper`
- Bericht: `Je bent aan de beurt. Open de app voor meer informatie.`

De pushpayload bevat geen klantnamen, contactgegevens, guest-capabilities, geheime tokens of andere persoonsgegevens.

#### Idempotentie en apparaten

Er bestaat maximaal één logische notificatie per combinatie van wachtrijvermelding en statusovergang naar `called`. Meerdere apparaten/subscriptions per wachtrijvermelding zijn toegestaan en elke actieve gekoppelde subscription mag de notificatie ontvangen, maar meerdere apparaten betekenen niet dat dezelfde logische notificatie opnieuw mag worden aangemaakt. Er wordt onderscheid gemaakt tussen een logische notificatie, een verzendpoging en daadwerkelijke aflevering: een succesvolle verzendaanroep garandeert niet dat de browser de melding heeft getoond.

#### Gasten en accounts

Web Push v1 ondersteunt zowel gasten als klanten met een account. Elke subscription wordt gekoppeld aan één specifieke wachtrijvermelding. Voor gasten gelden de bestaande guest-capability-flow en toegangsbeveiliging. Een guest-capability of ander geheim wordt nooit opgenomen in de pushpayload of een publiek toegankelijke URL. De notification-click opent de veilige app-flow voor de bijbehorende wachtrijvermelding; de toegang wordt via de bestaande autorisatie- en capability-mechanismen afgehandeld.

#### Verzendfouten en retries

Maximaal drie verzendpogingen in totaal per subscription en logische notificatie, inclusief de eerste poging. Alleen tijdelijke fouten mogen opnieuw worden geprobeerd; permanente fouten worden niet opnieuw geprobeerd. Een ongeldig of verlopen subscription-resultaat leidt tot deactivering van die subscription. Retries zijn begrensd en idempotent en creëren geen nieuwe logische notificatie. De implementatie maakt onderscheid tussen tijdelijke en permanente foutcategorieën.

#### Minimale registratie en bewaartermijn

Alleen noodzakelijke technische gegevens worden bewaard, waaronder wachtrijvermelding en event, idempotentiesleutel, verzendstatus, aantal pogingen, tijdstempels en noodzakelijke foutcategorieën. Volledige pushpayloads of onnodige persoonsgegevens worden niet bewaard. Verzendregistraties worden maximaal 30 dagen bewaard en daarna automatisch opgeruimd.

#### Einde van een wachtrijvermelding

De subscription die aan een wachtrijvermelding is gekoppeld, wordt automatisch gedeactiveerd wanneer die vermelding de status `completed`, `cancelled` of `skipped` krijgt. Een nieuwe wachtrijvermelding vereist een eigen expliciete pushactivatie.

#### Geen fallback naar andere kanalen

Web Push v1 introduceert geen e-mail- of sms-notificaties. Wanneer push niet beschikbaar is of toestemming ontbreekt, blijft de wachtrijpagina de actuele informatie tonen: positie in de wachtrij, aantal wachtenden en geschatte wachttijd.

#### Implementatiestatus

De productregels hierboven zijn afgesproken, maar de volledige Web Push-functionaliteit is nog niet geïmplementeerd. De volgende technische onderdelen moeten later afzonderlijk worden gepland en uitgevoerd en worden hier niet als aanwezig beschreven: keuze en installatie van een Web Push-library; databaseschema en migratie voor subscriptions en notificatieregistraties; server-only VAPID-configuratie; service-worker-handlers voor push en notification-click; opt-in- en uitschakelinterface; veilige subscriptionregistratie en -deactivering; dispatch bij `called`; idempotentie, retrybeleid en opschoning; automatische opschoning na 30 dagen; autorisatie-, privacy-, security- en integratietests; bijbehorende architectuur- en database-documentatie.

---

## 29. Eigenaar-notificaties v1

**Status: BESLOTEN — Eigenaar-notificaties v1**

Deze paragraaf is de bron van waarheid voor alle meldingen die de **eigenaar** ontvangt. Klantenpush blijft volledig geregeld in §28 en wordt door deze paragraaf niet gewijzigd.

De technische implementatie volgt deze productregels; §29 beschrijft uitsluitend productregels, geen bestaande functionaliteit. De technische beschrijving van de interne bel en van eigenaarpush staat in `ARCHITECTURE.md` §37 en §38 en in `DATABASE_RULES.md` §35 en §36.

### Onderdelen

De eigenaar-notificatie bestaat uit twee onderdelen:

1. **Interne notificatiebel** — een afgeschermde, in-app meldingenlijst met ongelezen teller in het eigenaarsgedeelte van de applicatie;
2. **Optionele pushmeldingen voor de eigenaar** — Web Push naar de eigen apparaten van de eigenaar.

De interne bel is altijd beschikbaar. Push is optioneel en wordt door de eigenaar per apparaat ingeschakeld.

### Gebeurtenissen

De eigenaar ontvangt een interne notificatie bij:

1. **Nieuwe wachtrij-inschrijving** — een klant of gast meldt zich zelf aan in de wachtrij;
2. **Nieuwe afspraak** — er wordt een afspraak geboekt;
3. **Annulering** — een afspraak gaat over naar de status `cancelled`;
4. **Klant verlaat de wachtrij** — een klant of gast verlaat de actieve wachtrij.

Het triggerpunt van een gebeurtenis is de daadwerkelijke statusovergang, niet de plek waar de gebruiker op klikte. Een annulering is daarmee iedere daadwerkelijke overgang van een afspraak naar de status `cancelled`, ongeacht of de klant, de eigenaar of een goedgekeurd annuleringsverzoek die overgang veroorzaakt.

Een afzonderlijke statusovergang wordt **maximaal één keer** als gebeurtenis geregistreerd. Een annuleringsverzoek of een goedkeuring die niet tot een nieuwe statusovergang leidt, levert zelfstandig geen extra gebeurtenis op voor dezelfde overgang.

Overige gebeurtenissen, zoals het oproepen, starten of afronden van een wachtrij-entry, leveren in v1 geen notificatie voor de eigenaar op.

### Geen melding bij walk-in door de eigenaar zelf

Wanneer de eigenaar zelf een walk-in aanmaakt, ontstaat **geen** notificatie. De eigenaar is al op de hoogte; een melding zou dubbel zijn.

Een melding ontstaat uitsluitend bij een aanmelding die door een klant of gast zelf is gedaan.

### Inhoud en privacy

- De **interne notificatiebel** mag de klantnaam bevatten. De bel is uitsluitend zichtbaar voor de eigenaar.
- **Pushmeldingen voor de eigenaar bevatten geen klantnaam en geen andere persoonsgegevens** — geen naam, geen telefoonnummer, geen e-mailadres, geen notities en geen herleidbare koppeling naar een specifieke klant, afspraak of wachtrij-entry. Dit is dezelfde privacyregel als voor klantenpush in §28.
- Notificaties bevatten geen secrets, capability-tokens of andere geheimen.

### Lezen en beheren

- Klikken op een notificatie **markeert deze als gelezen** en **opent de relevante pagina**.
- Daarnaast is **alles als gelezen markeren** beschikbaar.
- Alleen de **eigenaar** mag zijn notificaties beheren. Notificaties van de eigenaar zijn niet inzichtelijk voor klanten, gasten of andere gebruikers.
- Het beheren van notificaties is een server-side bevoegdheid. Een verborgen of uitgeschakelde UI is geen autorisatie.

### Retentie

- De bewaartermijn van de interne eigenaar-notificaties is **vast: 30 dagen**. De eigenaar kan deze niet wijzigen.
- Notificaties worden na 30 dagen **automatisch verwijderd**, ongeacht of ze gelezen of ongelezen zijn.
- Er is **geen** optie of instelling voor onbeperkte bewaring en geen andere retentie-instelling. De technische pushgegevens van de eigenaar volgen de aparte regels in *Technische pushgegevens*; de bewaartermijn voor klantenpush blijft zoals vastgelegd in §28.

### Technische pushgegevens

Deze regels gelden uitsluitend voor de technische gegevens van **eigenaarpush**. De bewaartermijn en de werking van klantenpush blijven zoals vastgelegd in §28.

- Verzendregistraties worden **uitsluitend bewaard zolang ze nodig zijn** voor verzending, retries, herstel en deduplicatie. Zodra ze die rol hebben vervuld, worden ze veilig opgeschoond.
- Voor deze technische gegevens geldt **geen vaste bewaartermijn**. Het moment van opschoning volgt uit het gebruik, niet uit een termijn.
- Tijdelijke claims, locks en verlopen herstelgegevens worden opgeschoond **zodra dat veilig kan**. Een lopende of nog herstelbare toestand wordt niet voortijdig verwijderd.
- **Actieve, geldige pushabonnementen worden bewaard zolang ze nodig zijn voor verzending.** Zij zijn geen notificatiehistorie en worden niet verwijderd uitsluitend vanwege de bewaartermijn van notificaties.

### Eigenaarpush

- Eigenaarpush is **optioneel**.
- Push vereist **expliciete toestemming** van de eigenaar, gegeven vanuit een expliciete gebruikersactie. Toestemming wordt nooit automatisch gevraagd bij het openen, bezoeken of herladen van een pagina.
- De eigenaar kan push **per apparaat uitschakelen**. Meerdere apparaten worden ondersteund: elk ingeschakeld apparaat ontvangt dezelfde melding, en het uitschakelen van één apparaat heeft geen invloed op de andere apparaten.
- **Er is geen stilteperiode in v1.** De eigenaar kan push per apparaat uitschakelen; een tijd- of dagvenster waarin geen push wordt verstuurd bestaat niet in v1.
- Wanneer push niet wordt ondersteund, niet is toegestaan of niet is ingeschakeld, blijft de interne notificatiebel volledig beschikbaar en is de bel het enige kanaal.

### Annuleringen

Annuleringen verschijnen in de interne notificatiebel en worden **via push gemeld wanneer push is ingeschakeld**. Zonder ingeschakelde push blijft de annulering zichtbaar in de bel.

### Foutafhandeling

- Een notificatie- of pushfout mag de **kernactie niet laten mislukken**. Het aanmelden in de wachtrij, het boeken van een afspraak, het annuleren van een afspraak en het verlaten van de wachtrij slagen ook wanneer het aanmaken of versturen van een melding mislukt.
- De uitkomst van een mislukte melding blijft intern vastgelegd, zodat herstel achteraf mogelijk is. De gebruiker ziet daarvan niets in de kernflow.

### Idempotentie

- Het aanmaken van een notificatie is **idempotent**. Een herhaalde aanroep of een retry van dezelfde gebeurtenis levert **één** notificatie op, niet meerdere.
- Bij een afspraakannulering is de gebeurtenis gekoppeld aan de statusovergang zelf: één overgang naar `cancelled` levert precies één gebeurtenis op (zie Gebeurtenissen).
- Meerdere apparaten betekenen niet dat dezelfde logische notificatie opnieuw wordt aangemaakt: één logische notificatie kan naar meerdere apparaten worden verstuurd.

### Scheiding met klantenpush

- Klantenpush (§28) en eigenaarpush (§29) zijn **volledig gescheiden**: eigen subscriptions, eigen events, eigen retentie en eigen foutafhandeling.
- Een klantabonnement ontvangt nooit een eigenaarsmelding en een eigenaarabonnement nooit een klantmelding.

### Automatische verversing

- De notificatiebel **ververst automatisch**. De ongelezen teller en de meldingenlijst worden zonder handmatige actie bijgewerkt.
- Automatische verversing is alleen-lezen en verandert de leesstatus niet. Alleen een expliciete actie van de eigenaar markeert notificaties als gelezen.
