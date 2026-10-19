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
- **Validierung** in [src/lib/validation.ts](src/lib/validation.ts) und in den Server Actions. Summen und Preise werden immer aus den Stammdaten berechnet, nie aus Formularwerten übernommen.

## Lokal starten
```
npm install
# .env.local (nicht committen):
# SUPABASE_URL=https://ijvoiynfbyfdklppiyhp.supabase.co
# SUPABASE_SECRET_KEY=sb_secret_…   (Supabase → Project Settings → API Keys)
npm run dev
```
Prüfen mit `npx tsc --noEmit`, `npm run lint` und `npm run build`. Nach neuen Routen `npx next typegen` ausführen, damit `PageProps<…>` die Route kennt. Bei unerklärlichen Fehlern im Dev-Server hilft oft `.next/dev` löschen und neu starten.

## Funktionsumfang
**ERP**
- **Home:** KPIs und Low-Stock-Alarme mit „Reorder“
- **Inventory:** Suche, Sortierung, Filter nach Kategorie, Standort und Bestandsstatus
- **Detail:** Bestand je Standort, Bewegungen, Service-Historie, Geräte
- **New item / Edit:** ID-Vorschlag, Prüfung auf doppelte IDs und plausible Werte; beim Anlegen mindestens ein Lieferant mit Preis
- **Lieferanten je Artikel** (n:m): in der Detailansicht hinzufügen, Preis und Lieferzeit ändern, entfernen (der letzte Lieferant ist nicht entfernbar); Seite `/suppliers` zeigt alle Lieferanten mit Artikeln und Preisen
- **Remove:** nur bei Bestand 0 und ohne offene Bestellung; setzt immer den Status `Discontinued` (Soft Delete), nie hartes Löschen
- **Purchase orders:** anlegen mit Lieferantenauswahl (günstigster vorausgewählt, bei Gleichstand kürzere Lieferzeit; Preis und Liefertermin vom gewählten Lieferanten); Receive (Maschinen → neue Assets, Zubehör → `inventory` +); Cancel
- **Sales orders:** anlegen bucht sofort ab (Maschinen per FIFO auf `Sold`); Status Open → Shipped → Delivered; Cancel nur bei Open, mit Rückbuchung
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
- `sales_orders` (Kundenaufträge, bis 19.10.2026 `orders`): Status Open | Shipped | Delivered | Cancelled. Einkauf liegt in `purchase_orders`.
- Weitere Tabellen: `service_history`, `suppliers`, `locations`, `customers`
- Views:
  - `v_stock`: Bestand = InStock-Assets + `inventory`
  - `v_order_margin`: Marge = Anschaffungskosten der verknüpften Assets, sonst Menge × Artikelkosten
  - `stock_movements`: Migration in `supabase/migrations/`; Zugang = erhaltene Einkaufsbestellungen, Abgang = nicht stornierte `sales_orders`
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
   delete from service_history where service_id > 'SVC-0052';
   delete from assets          where asset_id   > 'AST-01791';
   delete from sales_orders    where order_date > '2026-09-30';
   delete from inventory       where item_id    > 'MCH-032';
   delete from purchase_orders where order_date > '2026-09-30';
   delete from items           where item_id    > 'MCH-032';
   commit;
   ```
2. **Rabattregel:** Das Verkaufsformular erlaubt 0, 5 oder 10 % frei, die Daten folgen „5 % bei Maschinen ab 3 Stück“. Noch nicht entschieden, ob angeglichen wird.
3. **Storno nach Versand** (Shipped → Cancelled) ist nicht vorgesehen. Bei Bedarf mit dem Nutzer klären.
4. **Atomarität:** Wareneingang und Verkauf schreiben mehrere Tabellen ohne gemeinsame Transaktion. Für den Prototyp akzeptiert; später als DB-Funktion möglich.
5. **Alte Spalte `items.supplier_id` entfernen:** wird von der App nicht mehr benutzt (seit `item_suppliers`), ist aber noch vorhanden und nullable. Im SQL-Editor ausführen: `alter table public.items drop column supplier_id;`
6. **Abgabe-Artefakte** stehen noch aus: Foliensatz (PDF), Video (max. 12 Min.), ZIP.
