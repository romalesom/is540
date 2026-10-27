# IS540 Inventory Management

Stand: 2026-10-15. Projektnotizen für Claude-Code-Sessions und Mitwirkende.

## Arbeitsweise
- **Nicht allein entscheiden.** Bei jeder offenen Design-, Daten- oder Architekturfrage Optionen mit Empfehlung vorlegen und die Entscheidung des Nutzers abwarten.
- Schreibende SQL-Befehle (insbesondere `delete`) über den Supabase-Connector werden in dieser Umgebung abgelehnt. Nicht umgehen, sondern das SQL dem Nutzer zum Ausführen im Supabase-SQL-Editor geben.
- Vor Code zu Next.js die Doku in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`). Next 16 weicht von älteren Versionen ab.

## Kontext
Case Study **IS 540 Management of Enterprise Systems** (Uni Mannheim): Bestandsverwaltung für Kaffeemaschinen (MES-Solutions-Hackathon). Endabgabe 06.12.2026, 23:59 CET.
Die Aufgaben-PDF verlangt formal Power Apps + Power BI. Der Nutzer hat sich bewusst für eine **eigenständige Web-App mit eingebautem Reporting** entschieden (kein Power BI). Das nicht erneut problematisieren.

## Stack und Architektur
- **Next.js 16** (App Router, TypeScript), **Tailwind 4**, **Recharts 3** für Diagramme.
- `cacheComponents` ist **aus**: Alle Seiten rendern pro Request live, weil Bestände immer aktuell sein müssen.
- **Datenzugriff nur serverseitig** ([src/lib/supabase.ts](src/lib/supabase.ts)): Server Components lesen, Server Actions (`src/app/actions/*`) schreiben, beides mit `SUPABASE_SECRET_KEY`. RLS ist auf allen Tabellen aktiv, **ohne Policies**, der Browser hat also keinen direkten DB-Zugriff. Keine Policies für `anon` anlegen.
- **Rollen** Viewer / Stock Manager: UI-Umschalter, gespeichert im Cookie, ohne Login. Jede Server Action prüft `requireManager()` ([src/lib/role.ts](src/lib/role.ts)).
- **Mehrtabellen-Buchungen als DB-Funktionen** (seit 26.10.2026): neue Abläufe (Retoure, später Umlagerung, Inventur, Verschrottung) laufen als Postgres-Funktion in einer Transaktion. Server Action prüft Rolle und Eingaben, ruft dann `db().rpc(...)`. Die Funktion prüft die Geschäftsregeln erneut. `execute` nur für `service_role` (für `anon`/`authenticated` entzogen). Testen per `do $$ … raise exception 'ROLLBACK …' $$`, damit nichts gespeichert wird.
- **Validierung** in [src/lib/validation.ts](src/lib/validation.ts) und in den Server Actions. Summen und Preise werden immer aus den Stammdaten berechnet, nie aus Formularwerten übernommen.

## Lokal starten
```
npm install
# .env.local (nicht committen):
# SUPABASE_URL=https://ijvoiynfbyfdklppiyhp.supabase.co
# SUPABASE_SECRET_KEY=sb_secret_…   (Supabase → Project Settings → API Keys)
npm run dev
```
Prüfen mit `npx tsc --noEmit`, `npm run lint` und `npm run build`. Nach neuen Routen `npx next typegen` ausführen, damit `PageProps<…>` die Route kennt. Bei unerklärlichen Fehlern im Dev-Server hilft oft `.next/dev` löschen und neu starten. Typisch nach neuen Exporten in `src/lib/data.ts`: „… is not a function“ → Dev-Server neu starten. Der erste Aufruf einer Seite nach dem Neustart braucht wegen des Kompilierens oft 15–40 s.

## Funktionsumfang
**ERP**
- **Home:** KPI-Kacheln; „Below reorder point“ führt zu `/alerts` (Low-Stock-Alarme mit „Reorder“), „Revenue“ zum Reporting. Darunter die 5 nächsten eintreffenden Purchase Orders (offen, nach Liefertermin, überfällige markiert), die 5 neuesten Sales Orders (alle Status) und Value by location
- **Inventory:** Suche, Sortierung, Filter nach Kategorie, Standort und Bestandsstatus
- **Detail:** Bestand je Standort, Bewegungen, Service-Historie, Geräte
- **New item / Edit:** ID-Vorschlag, Prüfung auf doppelte IDs und plausible Werte; beim Anlegen mindestens ein Lieferant mit Preis
- **Lieferanten je Artikel** (n:m): in der Detailansicht hinzufügen, Preis und Lieferzeit ändern, entfernen (der letzte Lieferant ist nicht entfernbar); Seite `/suppliers` zeigt alle Lieferanten mit Artikeln und Preisen
- **Remove:** nur bei Bestand 0 und ohne offene Bestellung; setzt immer den Status `Discontinued` (Soft Delete), nie hartes Löschen
- **Purchase orders:** anlegen mit Lieferantenauswahl (günstigster vorausgewählt, bei Gleichstand kürzere Lieferzeit; Preis und Liefertermin vom gewählten Lieferanten); Receive (Maschinen → neue Assets, Zubehör → `inventory` +); Cancel
- **Sales orders:** anlegen bucht sofort ab (Maschinen per FIFO auf `Sold`); Rabattsätze und Staffel aus `/settings` (Standard: 5 % ab 3 Maschinen vorausgewählt, 10 % wählbar; änderbar); Status Open → Shipped → Delivered; Cancel nur bei Open, mit Rückbuchung; **Return** bei Shipped/Delivered (Teilmengen möglich, Maschinen per Seriennummer): „Resellable“ → zurück ins gewählte Lager (Maschinen als `Used`), „Defective“ → verschrottet; bei vollständiger Rückgabe Status `Returned`
- **Transfers** (`/transfers`): Umlagerung zwischen Standorten mit Status InTransit → Received (oder Cancelled → zurück zur Quelle). Maschinen verlassen die Quelle per FIFO (Status `InTransit`, ohne Standort). Unterwegs-Ware zählt zum Bestandswert, ist aber nirgends verfügbar; Inventar, Artikelseite und Home zeigen „in transit“. „Transfer“-Button auf der Artikelseite.
- **Stock counts** (`/counts`): Inventur je Standort. Maschinen per Seriennummer abhaken (nicht gefunden → `Missing`; früher fehlende, jetzt gefundene → wieder `InStock`), Zubehör als Menge (Buchbestand vorausgefüllt). Jede Differenz wird eine Bestandskorrektur. Liste vergangener Zählungen mit Differenzen und Wertänderung.
- **Scrap** (Artikelseite): Maschinen per Seriennummer bzw. Zubehör-Menge mit Pflicht-Grund verschrotten (→ `Scrapped`, Zustand Defective), bewertet zu Anschaffungs- bzw. Standardkosten.
- **Settings** (`/settings`, ändern nur Stock Manager): MwSt.-Satz und Rabattsätze mit optionaler Mindestmenge (Staffel, nur Maschinen, höchste erreichte Stufe gewinnt). Änderungen wirken nur auf neue Aufträge.
- **Brutto-Anzeige:** Brutto = netto × (1 + MwSt.) wird nur angezeigt, nie gespeichert, und nur bei Preisen vor einer Transaktion: Verkaufspreis im Inventar und am Artikel, Lieferantenpreise, Artikelformular, Formulare für neue Sales/Purchase Orders. Bestehende Aufträge und das Reporting bleiben netto. Vereinfachung: ein Satz für alle Lieferanten (kein Reverse Charge, keine Einfuhrumsatzsteuer).
- **Service monitor:** überfällig, kommende Termine, verkauft und nie gewartet; Record service (nächster Termin +180 Tage)

**Reporting** (`/reporting`, eigenes Seitenmenü mit „Back to ERP“): Management summary, Inventory health, Profitability, Purchasing & suppliers (inkl. Preisvergleich über Lieferanten), After-sales & service sowie Drill-through `/reporting/item/[id]`. Jede Seite hat eigene Filter.
Kennzahlen und Formeln liegen zentral in [src/lib/reporting.ts](src/lib/reporting.ts). Die Daten werden serverseitig seitenweise geladen (PostgREST liefert max. 1000 Zeilen) und in TypeScript aggregiert.

**Layout:** responsiv. Unter 768 px Kopfzeile mit Drawer, Tabellen werden zu Karten. Design nach bee360.com (Rot `#b61f29`, Open Sans, Material Symbols). Die Diagrammfarben kommen aus einer farbenblind-geprüften Palette in [src/components/charts.tsx](src/components/charts.tsx).

## Datenmodell (Supabase-Projekt IS540, `ijvoiynfbyfdklppiyhp`, eu-central-1)
- `items`: `tracking_mode` Serialized | Quantity, `status` Active | Discontinued. `unit_cost_eur` ist der **Standardpreis** (Bewertung, Marge, Prüfung Verkaufspreis ≥ Kosten), nicht der Einkaufspreis eines Lieferanten.
- `item_suppliers` (n:m Artikel ↔ Lieferant, seit 19.10.2026): `unit_cost_eur` = Angebotspreis des Lieferanten, `lead_time_days` optional (leer → `suppliers.lead_time_days`). Ersetzt die frühere Spalte `items.supplier_id`.
- `assets`: nur Maschinen; `status` InStock | InService | Sold | Scrapped; `order_id` verweist auf den Verkauf
- `inventory`: nur Mengenartikel (Zubehör), je Artikel und Standort
- `purchase_orders`: Status Ordered | Received | Cancelled
- `sales_orders` (Kundenaufträge, bis 19.10.2026 `orders`): Status Open | Shipped | Delivered | Returned | Cancelled. Einkauf liegt in `purchase_orders`. `unit_price_eur` ist der **Nettopreis** nach Rabatt; `discount` (seit 19.10.2026) speichert den Rabatt als Dezimalbruch (0.05 = 5 %; DB prüft 0 ≤ discount < 1, die erlaubten Sätze prüft der Server gegen `discount_tiers`). Listenpreis zum Auftragszeitpunkt = `unit_price_eur / (1 − discount)`.
- `sales_returns` (`RET-####`): Retouren mit Menge, `disposition` Resellable | Defective, Ziel-/Annahmestandort, `refund_eur` (= Menge × Netto-Stückpreis), `cost_eur` (Anschaffungskosten der Ware). `sales_return_assets` verknüpft die zurückgegebenen Maschinen dauerhaft, weil `assets.order_id` bei Rücknahme geleert und bei Wiederverkauf neu gesetzt wird. Gebucht nur über `create_sales_return(...)`.
- **Reporting und Retouren:** negative Zeilen im Monat der Retoure (wie eine Gutschrift). Umsatz − Erstattung, COGS − Kosten nur bei Resellable (defekte Ware bleibt als Verlust). Stückzahlen netto; Kennzahl Return rate auf Profitability.
- `stock_transfers` (`TRF-####`): Artikel, von/nach, Menge, Status InTransit | Received | Cancelled, Versand-/Eingangsdatum. `stock_transfer_assets` verknüpft die Maschinen. Gebucht nur über `create_stock_transfer`, `receive_stock_transfer`, `cancel_stock_transfer`. View `v_in_transit`: Menge unterwegs je Artikel. Asset-Status jetzt InStock | InTransit | InService | Sold | Scrapped.
- `stock_counts` (`CNT-####`, Standort, Datum, Notiz) und `stock_adjustments` (`ADJ-#####`): Artikel, Standort, Menge mit Vorzeichen, Grund Count difference | Scrapped, `value_eur` mit Vorzeichen (zu Kosten), optional `count_id`. `stock_adjustment_assets` verknüpft Maschinen. Gebucht nur über `post_stock_count(...)` und `scrap_stock(...)`. Asset-Status jetzt InStock | InTransit | InService | Missing | Sold | Scrapped.
- **Reporting Inventory health:** Bestandswert inkl. Unterwegs-Ware (ohne Standortfilter); Karte „Write-offs by item“ = negative Korrekturen im Zeitraum zu Kosten, wiedergefundene Ware separat.
- `app_settings` (genau eine Zeile, `id = 1`): `vat_rate` als Dezimalbruch (0.19). `discount_tiers`: `rate` (PK, Dezimalbruch), `min_qty` optional (leer → wählbar, nie vorausgewählt).
- Weitere Tabellen: `service_history`, `suppliers`, `locations`, `customers`
- Views:
  - `v_stock`: Bestand = InStock-Assets + `inventory`
  - `v_order_margin`: Marge = Anschaffungskosten der verknüpften Assets (inkl. über `sales_return_assets` zurückgegebener), sonst Menge × Artikelkosten
  - `stock_movements`: Migration in `supabase/migrations/`; Zugang = erhaltene Einkaufsbestellungen, Abgang = nicht stornierte `sales_orders`, Zugang = Retouren mit Resellable, Umlagerung = „Transfer out“ beim Versand und „Transfer in“ beim Eingang (stornierte fehlen), Korrekturen als „Count difference“ / „Scrapped“
- ID-Schemata:
  - Artikel `MCH-###`, Einkauf `PO-YYMMDD-<Artikelnr>[-n]`, Verkauf `ORD-<n>`
  - Assets `AST-#####`, Seriennummern `SN-<Artikelnr>-####`, Services `SVC-####`

**Annahmen der Datenmigration** (aus `IS540_Coffee_Case_Data.xlsx`):
- Seriennummern sind synthetisch.
- Die Zuordnung von Verkäufen und Services zu Assets per FIFO ist konstruiert.
- Anschaffungskosten = aktuelle Artikelkosten.
- `next_service_due` = Servicedatum + 180 Tage.
- In den Daten gibt es 5 % Rabatt nur bei Maschinen ab 3 Stück.

**Ausgangsbestand nach der Migration:** 32 Artikel, 1.791 Assets, 419 Einkaufsbestellungen, 7.595 Aufträge, 10 Lagerzeilen, 52 Services. Die Verkaufsdaten reichen von 10/2025 bis 09/2026.

## Offene Punkte
1. **Testdaten zurückrollen:** In der DB liegen noch Testdatensätze vom 15.10.2026 (Artikel MCH-033 bis MCH-036 und alles, was daran hängt). Stand bei der letzten Prüfung: 36 / 1.808 / 427 / 7.598 / 12 / 53. Sie verzerren das Reporting, der Zeitraum endet dadurch im Oktober statt im September. Rollback im SQL-Editor ausführen, danach sollte die Zählabfrage 32 / 1791 / 419 / 7595 / 10 / 52 ergeben:
   ```sql
   begin;
   -- Retouren auf Testaufträge (z. B. RET-0001 vom 26.10.2026 auf ORD-7596) zuerst
   delete from sales_return_assets where return_id in (select return_id from sales_returns where order_id in (select order_id from sales_orders where order_date > '2026-09-30'));
   delete from sales_returns   where order_id in (select order_id from sales_orders where order_date > '2026-09-30');
   -- Test-Umlagerungen TRF-0001 bis TRF-0003 vom 26.10.2026 (alle auf MCH-034)
   delete from stock_transfer_assets where transfer_id in (select transfer_id from stock_transfers where item_id > 'MCH-032');
   delete from stock_transfers where item_id > 'MCH-032';
   -- Test-Inventuren CNT-0001/CNT-0002 und Abschreibungen ADJ-00001 bis ADJ-00004 vom 26./27.10.2026 (nur Testartikel)
   delete from stock_adjustment_assets where adjustment_id in (select adjustment_id from stock_adjustments where item_id > 'MCH-032');
   delete from stock_adjustments where item_id > 'MCH-032';
   delete from stock_counts where count_id in ('CNT-0001', 'CNT-0002');
   delete from service_history where service_id > 'SVC-0052';
   delete from assets          where asset_id   > 'AST-01791';
   delete from sales_orders    where order_date > '2026-09-30';
   delete from inventory       where item_id    > 'MCH-032';
   delete from purchase_orders where order_date > '2026-09-30';
   delete from items           where item_id    > 'MCH-032';
   commit;
   ```
2. **Storno nach Versand** (Shipped → Cancelled) ist nicht vorgesehen. Bei Bedarf mit dem Nutzer klären.
3. **Atomarität:** Wareneingang und Verkauf schreiben mehrere Tabellen ohne gemeinsame Transaktion. Für den Prototyp akzeptiert; später als DB-Funktion möglich.
4. **Alte Spalte `items.supplier_id` entfernen:** wird von der App nicht mehr benutzt (seit `item_suppliers`), ist aber noch vorhanden und nullable. Im SQL-Editor ausführen: `alter table public.items drop column supplier_id;`
5. **Abgabe-Artefakte** stehen noch aus: Foliensatz (PDF), Video (max. 12 Min.), ZIP.
