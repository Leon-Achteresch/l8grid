# Entscheidung über das vorhandene Feature-Portfolio

Stand: 15.11.2026. Die Feature-Recherche ist auf direkten Nutzerauftrag beendet. Bewertet werden die bereits gesammelten Vorschläge; dies ist keine neue Recherche. Änderungen entstehen auf `development`, Ziel des PR ist `main`.

Die Umsetzung beschränkt sich auf klar abgegrenzte Ergänzungen mit bekanntem Daten-/Aktionsvertrag. Ein bedingter Kandidat aus fremden Nutzerfällen ist keine Zusage, dass ein neuer Datenkern, fremde Rechte oder ein übergreifender Workflow lokal funktionieren. Der übrige Umfang wird hier ausdrücklich zurückgestellt und nicht als umgesetzt ausgegeben. Bestehende Funktionen bleiben nutzbar.

## Umgesetzter Umfang

Drei reine Bibliotheksfunktionen: `rowsForContent`, `rowsForAspectRatio` und `resizeItems`. Inhaltshöhe wird vom Host gemessen; der Kern erhält keine eigene Mess-/Pollingautomatik. Seitenverhältnisse werden auf ganze Rasterzeilen aufgerundet; Constraints können eine exakte Ratio verhindern. Gemeinsame Größen achten feste bzw. nicht skalierbare Elemente und lösen Kollisionen mit dem bestehenden Solver. Der Playground zeigt Kachelfinder, bewusste Auswahl, gemeinsame Größe und angenäherte 16:9-Größe. Die Suche ist ein Hostbeispiel, keine Fachdatensuche im Rasterkern.

## Entscheidung je vorhandener Portfolio-ID

| ID | Vorhandene Idee | Entscheidung / Grenze |
| --- | --- | --- |
| F02 | F02 · Kachelhöhe am Inhalt ausrichten: | Teilumfang: reine Zeilenberechnung, keine automatische Höhenmessung. |
| F07 | F07 · Widgets aus einem Katalog hineinziehen — Komfortkandidat: | Zurückgestellt: eigener Interaktions-/Layoutvertrag mit erheblicher Wirkung auf bestehende Pointer-, Tastatur- oder Kollisionsregeln; kein zusätzlicher Kernpfad aus den vorläufigen Belegen. |
| F09 | F09 · Gewünschtes Seitenverhältnis erhalten: | Teilumfang: Rasterapproximation, keine neue Resize-Engine. |
| F11 | F11 · Nachbarbreiten bewusst gemeinsam ändern — optional: | Zurückgestellt: eigener Interaktions-/Layoutvertrag mit erheblicher Wirkung auf bestehende Pointer-, Tastatur- oder Kollisionsregeln; kein zusätzlicher Kernpfad aus den vorläufigen Belegen. |
| F12 | F12 · Kachelfinder für große Dashboards: | Playground-Beispiel für Kachelfinder; Host verwaltet die Namen. |
| F13 | F13 · Zusammengehörige Kacheln gemeinsam bewegen: | Zurückgestellt: eigener Interaktions-/Layoutvertrag mit erheblicher Wirkung auf bestehende Pointer-, Tastatur- oder Kollisionsregeln; kein zusätzlicher Kernpfad aus den vorläufigen Belegen. |
| F14 | F14 · Verschachtelte Bereiche zuklappen: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F15 | F15 · Themen innerhalb eines Dashboards wechseln — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F18 | F18 · Eine Kachel vorübergehend groß betrachten — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F19 | F19 · Eine gewählte Größe auf mehrere Kacheln übertragen — bedingt: | Umgesetzt: explizite gemeinsame Größe mit bestehenden Constraints. |
| F16 | F16 · Konfigurierte Kacheln zwischen Dashboards übernehmen: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F22 | F22 · Nur zum Kontext passende Kachelbereiche anzeigen: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F17 | F17 · Gemeinsame Vorlagen referenzieren statt vollständig kopieren — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F20 | F20 · Raster für Druckseiten aufbereiten — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F21 | F21 · Ausgewählte Kacheln weitergeben — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F23 | F23 · Lange Dashboards im Kiosk durchlaufen — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F24 | F24 · Raster bewusst von rechts bedienen — bedingt: | Zurückgestellt: eigener Interaktions-/Layoutvertrag mit erheblicher Wirkung auf bestehende Pointer-, Tastatur- oder Kollisionsregeln; kein zusätzlicher Kernpfad aus den vorläufigen Belegen. |
| F25 | F25 · Verlinkte Zielkachel zuverlässig erreichen — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F26 | F26 · Messwertdetails bei Live-Refresh bedienbar halten — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F27 | F27 · Inneren Widgetarbeitsstand beim Bereichswechsel behalten — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F28 | F28 · Gewählten Tabellenumfang strukturiert weiterverwenden — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F29 | F29 · Fachlichen Datenstand einer Zahl zeigen — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F30 | F30 · Von einer Kennzahl zu passenden Einzelzeilen — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F31 | F31 · Filterbezug je Kachel verständlich machen — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F32 | F32 · Bekannte Datensätze jenseits des Tabellenausschnitts finden — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |
| F33 | F33 · Fachliche Zeilenkennung beim Querlesen sichtbar halten — bedingt: | Kein Ausbau des Rasterkerns: fachliche Daten, Filter, Hosts, Freigaben und Providerverträge bleiben beim einbettenden Produkt. |

## Prüfung und Abbildungen

Screenshots unter `docs/screenshots/` zeigen echte gerenderte Komponenten mit synthetischen Testdaten. Sie sind kein Nachweis einer Live-Instanz oder erfolgreich ausgeführter Fachoperationen. Konkrete ausgeführte Tests stehen im PR; unerreichbare/native Grenzen werden dort separat benannt. Historische Ideen und Reserven bleiben im Forschungsarchiv erhalten; daraus werden keine automatischen Folgeaufträge.
