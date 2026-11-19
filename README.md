# Atlas – privates Reisetagebuch

Eine statische, datenschutzfreundliche GitHub-Pages-App. Besuche werden auf einem interaktiven 3D-Globus dargestellt; Statistiken und eine chronologische Reiseliste werden direkt im Browser berechnet.

## Datenschutz und Speicherung

- Reisedaten liegen **nur im IndexedDB-Speicher des jeweiligen Browsers**.
- Es gibt kein Backend, kein Konto, keine Analytik und keine Datenbank im Repository.
- Ein öffentliches Repository enthält nur den App-Code – niemals die lokal gespeicherten Besuche.
- Das Löschen von Website-Daten, ein Browserwechsel oder ein Geräteverlust kann lokale Daten entfernen. Deshalb regelmäßig eine JSON-Sicherung exportieren.
- Verschiedene Browser, Profile, Geräte und eine installierte PWA haben gegebenenfalls getrennte Speicher.

Der 3D-Globus wird mit **CesiumJS** gerendert. Satellitenbilder von **Esri World Imagery** und transparente Ortsnamen aus **World Boundaries and Places** werden gemeinsam angezeigt. Beim Zoomen werden automatisch detailliertere Kacheln geladen; ein Kartenwechsel ist nicht nötig. Die lokal ausgelieferte Natural-Earth-II-Textur bleibt darunter als Offline-Grundlage erhalten. Satellitenbilder und Ortsnamen benötigen Internetzugang. Die Quellenangaben sind direkt im Globus sichtbar.

Beim Antippen eines Punktes ermittelt **Photon (Komoot / OpenStreetMap)** den Ort und das Land und übernimmt sie zusammen mit den gewählten Koordinaten direkt in die Reiseansicht. Alternativ lässt sich ein Ort ausdrücklich suchen und aus den Ergebnissen auswählen. Es gibt keine Anfragen während des Tippens, erfolgreiche Suchergebnisse werden für die Sitzung zwischengespeichert. Die öffentliche Photon-Instanz ist für moderate Nutzung vorgesehen und hat keine Verfügbarkeitsgarantie; bei Ausfällen ist die manuelle Eingabe möglich. Der Endpunkt ist in `dist/places.js` zentral konfiguriert.

Die Kartenanbieter sehen die angeforderten Kartenausschnitte. Photon erhält nur die explizit gesuchten Ortsnamen bzw. den angetippten Punkt sowie übliche Verbindungsdaten. Gespeicherte Reisen, Notizen und Reisezeiten werden nicht an diese Dienste übertragen.

## Reisen eintragen

- Globus mit einem Finger drehen, mit zwei Fingern oder dem Mausrad zoomen. Die Plus-/Minus-Tasten zoomen ebenfalls bis auf Stadtebene. Der Globus dreht sich nicht von selbst weiter.
- Einen Ort antippen oder über **Reise hinzufügen → Ort suchen** auswählen. Stadt, Land und Koordinaten erscheinen direkt im Formular; unter **Ort & Koordinaten bearbeiten** lassen sie sich korrigieren.
- Standardmäßig reicht **Monat & Jahr**. Ein Endmonat ist optional. **Genaue Tage** bleibt für exakte Zeiträume und bestehende Einträge verfügbar.
- Monatseinträge bleiben als `YYYY-MM` gespeichert; es werden keine Reisetage erfunden. Bestehende Tagesdaten und Sicherungen bleiben lesbar. Die Jahresstatistik zählt Reisen anhand ihres Beginns.
- Statistik und Datensicherung sind aufklappbar. Die Oberfläche passt sich an Handy und Desktop an.

Die Kartenkombination folgt dem Schichtenmodell der [Cesium-Sandcastle-Beispiele](https://sandcastle.cesium.com/?src=Imagery%20Layers.html) und der [OpenLayers-Beispiele mit ArcGIS](https://openlayers.org/en/latest/examples/arcgis-image.html). Die Ortsauflösung verwendet die [Photon-API](https://github.com/komoot/photon/blob/master/docs/api-v1.md).

## Lokal starten

```bash
npm install
npm run serve
```

Dann `http://localhost:4173` öffnen. `npm run serve` kopiert die benötigten CesiumJS-Dateien und Textur-Tiles automatisch nach `dist/vendor/`.

## Tests

```bash
npm test
```

## Auf GitHub Pages veröffentlichen

1. Dieses Repository zu GitHub pushen.
2. Unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** auswählen.
3. Der enthaltene Workflow `.github/workflows/pages.yml` veröffentlicht den Ordner `dist/` bei jedem Push auf `main`.

Die App funktioniert auch unter einem Projektpfad wie `https://name.github.io/travel_log/`, weil alle eigenen Dateien relativ referenziert werden.

## Sicherungen

Unter **Daten & Sicherung** kann eine versionierte JSON-Datei exportiert, geteilt und wiederhergestellt werden. Beim Wiederherstellen werden die aktuellen lokalen Daten erst nach einer Bestätigung ersetzt. Über den Teilen-Dialog eines Mobilgeräts lässt sich die Datei unter anderem in iCloud Drive, Google Drive oder als Mail-Anhang sichern.

Eine echte automatische Google-Drive-Synchronisierung würde ein eigenes Google-Cloud-Projekt, OAuth-Konfiguration und zusätzliche Berechtigungen benötigen. „Mit Apple anmelden“ ist nur eine Anmeldung und stellt einer statischen Website keinen iCloud-Dateispeicher bereit. Für diese bewusst backendfreie App ist der Datei-Export deshalb die einfachste und datensparsamste Lösung.
