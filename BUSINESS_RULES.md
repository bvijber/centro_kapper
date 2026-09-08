# Centro Kapper — Business Rules

**Document:** Business Rules  
**Versie:** 1.0  
**Status:** Living Document / Source of Truth  
**Project:** Centro Kapper  
**Laatste update:** 2026-09-03

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

Er is **geen vaste slot interval**.

Starttijden zijn **dynamisch**. Een beschikbare starttijd wordt bepaald op basis van:

- openingstijden;
- breaks;
- whole-day blocks;
- bestaande bezette afspraken;
- service duration;
- algemene buffer.

Een afspraak moet volledig binnen de beschikbare periode passen. Er wordt geen afzonderlijke `slot_interval`-setting geïmplementeerd.

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

Het gedrag waarmee de resterende tijd weer beschikbaar komt is **configureerbaar**:

- automatisch vrijgeven;
- of handmatig vrijgeven door de barber.

De `no_show`-status zelf mag hierdoor niet verdwijnen of vervangen worden.

**Status: BESLOTEN — configureerbaar**

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
- `no_show`-gedrag;
- dienstprijzen;
- serviceduur;
- openingstijden.

---

# 26. Open beslissingen

De volgende onderwerpen zijn nog niet definitief vastgesteld:

1. notification events;
2. notification verplicht versus optioneel;
3. notification preferences;
4. failed delivery/retry behavior.

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

### Notification business rules

De exacte notification types, triggers, timing en user notification preferences zijn nog niet definitief vastgesteld.

Notifications mogen geen ongeautoriseerde of privacygevoelige informatie aan verkeerde gebruikers leveren.

Notification preferences moeten later als expliciete business rules worden vastgesteld. Een notification capability is daarom geen toestemming om zelfstandig concrete events, reminder-tijden, voorkeuren of deliverygedrag te definiëren.

**Status: OPEN BESLISSING voor concrete notification business rules**

### Aanvullende open beslissingen

- Welke notification events moeten worden ondersteund?
- Welke notifications zijn verplicht versus optioneel?
- Welke user notification preferences zijn configureerbaar?
- Hoe moeten failed deliveries en retries worden behandeld?
