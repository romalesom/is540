# IS540 Inventory Management – Projekt-Übergabe

Stand: 2026-10-15. Diese Datei fasst den Chat zusammen, damit in Claude Code / VS Code nahtlos weitergearbeitet werden kann.
Was unsicher oder ungeprüft ist, ist als **(unsicher)** markiert.

## 1. Ziel
Webfrontend (Prototyp) für die Case Study **IS 540 Management of Enterprise Systems** (Uni Mannheim, Prof. Höhle) auf Basis des selbst entworfenen ERP-Datenmodells und der migrierten "Coffee Case"-Daten.

**Wichtig:** Die offizielle Abgabe verlangt laut Aufgaben-PDF **Power Apps + Power BI** (Dataverse/OneDrive als Datenquelle), dazu Foliensatz (PDF), Video (max. 12 Min., mp4) und ZIP mit den Artefakten. Dieses Web-Frontend ist daher voraussichtlich nur Prototyp/Konzeptvorlage. **Vor dem Aufwand im ILIAS-Forum oder bei der Q&A am 03.11. (Übung, O 151) klären, ob ein anderes Tool erlaubt ist.**
Fristen laut PDF: Zwischennotizen 04.10.2026 (vorbei), Endabgabe 06.12.2026 23:59 CET, Abgabe per Mail an applicat@uni-mannheim.de.

## 2. Anforderungen aus dem PDF (App-Teil)
Mindestens 5 Screens:
1. **Inventory overview**: Suche, Sortierung, mindestens 2 kombinierbare Filter (Kategorie, Status, Standort)
2. **Machine detail**: Bearbeiten und Löschen, Service-Historie, Bestandsbewegungen des Artikels
3. **Create/browse**: neue Artikel mit validierter Eingabe, Write-back
4. **Order screen**: Auswahl → Bestellung mit Preis × Menge, Summe berechnet (nicht getippt)
5. **Home**: KPI-Kacheln, Low-Stock-Warnungen

Funktionen: Create/Change/Remove ohne die App zu verlassen; Validierung (Pflichtfelder, plausible Werte, keine doppelten IDs); Nachbestellpunkt löst Low-Stock-Warnung aus; zwei Rollen (Viewer / Stock Manager) mit unterschiedlichen Rechten; sichtbare Lade-, Leer- und Fehlerzustände; ein einheitliches Theme.
Optional laut PDF: Genehmigungsworkflow (Power Automate), Barcode/QR, zweite Datenquelle.
Power-BI-Teil (nicht Teil dieses Frontends): ≥2 verknüpfte Tabellen + Datumstabelle, ≥5 Measures, ≥3 Seiten (Management summary, Inventory health, Profitability), Slicer, Drill-through, Annahmen dokumentieren, Daten müssen mit der App übereinstimmen.

## 3. Entscheidungen im Chat
| Thema | Entscheidung |
|---|---|
| Frontend | Web-Prototyp: React + Vite + Supabase (Variante 1), läuft **lokal** |
| Rollen | Umschalter im UI (Viewer / Stock Manager), **keine** echte Authentifizierung |
| Bestellung | Maschinen werden per **FIFO** automatisch Assets zugeordnet |
| Design | Inspiriert von bee360.com, **eigene Marke** (kein Bee360-Logo/Name). Akzent #b61f29 (tiefes Rot), viel Weißraum, Kartenlayout, Line-Icons, sachlicher B2B-Ton. Exakte Schrift/Farben der Seite wurden nicht ermittelt, nur Akzentfarbe und grobe Struktur. |
| Migration der Daten | Nur Maschinen als Assets, Zubehör als Mengenartikel; Ziel Supabase + Excel |
| Kritische Entscheidungen | Immer mit Begründung und Empfehlung beim Nutzer abfragen, nicht allein entscheiden |

## 4. Datenmodell (Supabase, schema `public`)
Supabase-Projekt: **IS540**, id `ijvoiynfbyfdklppiyhp`, URL `https://ijvoiynfbyfdklppiyhp.supabase.co`, Region eu-central-1. API-Keys im Supabase-Dashboard (Einstellungen → API) holen, **nicht ins Repo committen** (`.env.local`).
RLS ist auf allen Tabellen aktiv, aber **ohne Policies** → ein Browser-Client sieht aktuell keine Daten, bis die Migration unten angewendet ist.

Tabellen (Spalten ungefähr, vor Nutzung per `information_schema` prüfen):
- `suppliers(supplier_id, supplier_name, country, lead_time_days, contact)`
- `locations(location_id, location_name, city, country)`
- `customers(customer_id, customer_name, city, country, contact)` – nur Namen befüllt
- `items(item_id, model, category, supplier_id, tracking_mode [Serialized|Quantity], unit_cost_eur, sale_price_eur, reorder_point, reorder_qty, status [Active|Discontinued])`
- `assets(asset_id, item_id, serial_number, location_id, condition, status [InStock|InService|Sold|Scrapped], purchase_order_id, acquisition_cost_eur, received_date, order_id)` – nur für Maschinen
- `inventory(item_id, location_id, stock_qty, condition)` – nur Mengenartikel (Zubehör)
- `purchase_orders(purchase_order_id, order_date, supplier_id, item_id, location_id, quantity, unit_cost_eur, expected_date, received_date, status)`
- `orders(order_id, order_date, customer_id, item_id, location_id, quantity, unit_price_eur, order_status [Open|Shipped|Delivered|Cancelled])`
- `service_history(service_id, asset_id, service_date, service_type, technician, cost_eur, outcome, next_service_due)`
- Views: `v_stock` (Bestand je Artikel/Standort: InStock-Assets + inventory), `v_order_margin`

Migrierte Mengen: 6 Lieferanten, 4 Standorte, 15 Kunden, 32 Artikel, 419 Einkaufsbestellungen, 7.595 Bestellungen, 1.791 Assets (1.597 Sold, 190 InStock, 4 Scrapped), 52 Services, 10 Inventory-Zeilen. Umsatz je Status: Delivered 3.863.628,50 / Shipped 550.046,00 / Open 54.998,00 / Cancelled 440.125,00 EUR (stimmt mit Excel überein). Gesamtbestand 434.

## 5. Annahmen der Migration (aus `IS540_Coffee_Case_Data.xlsx`)
- Seriennummern **synthetisch** (`SN-<Artikelnr>-<laufend>`), Asset-IDs `AST-#####`.
- Zuordnung von Verkäufen und Services zu Assets per FIFO ist **erfunden**, keine echte Historie.
- Stück-/Anschaffungskosten = aktuelle Artikelkosten (historische Kosten unbekannt).
- Preisregel aus den Daten abgeleitet: 5 % Rabatt bei Maschinen ab Menge 3, sonst Listenpreis (0 Ausnahmen in den Daten).
- `next_service_due` = Servicedatum + 180 Tage (Annahme).
- `StockMovements` und `Calendar` nicht übernommen. Bewegungen sind über Bestellungen/Einkaufsbestellungen abgebildet.
- Einkaufsbestellungs-ID `PO-yymmdd-NNN` aus der Quelle abgeleitet, Erwartungsdatum = Bestelldatum + Lieferzeit des Lieferanten.
- Zusatzspalte `tracking_mode`, zusätzlicher Zustand "Demo unit".
- Excel-Ausgabe der Zieltabellen: `ERP_Migration_IS540.xlsx` (wurde im Chat geliefert; nicht im Repo).

## 6. Offene Datenbank-Migration (NICHT angewendet)
Datei: `supabase/migrations/frontend_api_v1.sql` (in diesem Repo). Sie legt an:
- Lese-Policies, Insert/Update auf `items` für `anon`
- Views `v_item_overview` (Bestand, Warnflag `low_stock = stock_qty <= reorder_point`, Bestandswert) und `v_stock_movements` (Wareneingänge und Verkäufe)
- Funktionen (security definer): `place_order` (FIFO, Bestandsabbau, Rabattregel), `set_order_status` (Open→Shipped→Delivered, Storno mit Rückbuchung), `receive_stock`, `delete_item` (nur ohne Historie), `add_service`, `create_customer`
- Prüfregeln, z. B. ID-Format `MCH-###`

**Status:** Der Aufruf wurde im Chat zweimal vom Nutzer abgebrochen, der Grund wurde nicht genannt. Erst klären, dann anwenden. **Sicherheitsfolge:** Mit Rollenumschalter und `anon`-Key kann jeder mit dem Key schreiben. Nur für Demodaten und lokal vertretbar. Key nie committen, Repo privat halten.
Sicherere Alternative: Policies weglassen und ein lokales Node-Backend mit `service_role`-Key davorschalten (Key nur in lokaler `.env`).
Die SQL-Datei wurde **nicht gegen die Datenbank getestet** (unsicher: Syntax/Laufzeitfehler möglich).

## 7. Repo und Tooling
- GitHub: `romalesom/is540` (angelegt vom Nutzer). Cloud-Session konnte pushen (nur `README.md` auf `main`).
- Die Org `IS-540-Management-of-Enterprise-Systems/main` war nicht erreichbar (kein Zugriff).
- Seit dieser Chat-Session sind Supabase und GitHub nur dort als Konnektoren eingebunden. Lokal Supabase neu einrichten (MCP oder `.env`).

## 8. Nächste Schritte
1. Klären, ob Web-Prototyp für die Abgabe erlaubt ist (ILIAS/Q&A 03.11.).
2. Entscheiden: Migration anwenden / Backend-Variante / lokale Datenkopie.
3. Vite-React-App aufsetzen, Supabase-Client, Theme (#b61f29), 5 Screens, Rollenumschalter, Validierung, Lade-/Leer-/Fehlerzustände.
4. Lokal testen (Build, Browser), dann committen und pushen.
5. Parallel: Power-Apps-Screen-Plan mit Formeln und Power-BI-Konzept für die eigentliche Abgabe.
