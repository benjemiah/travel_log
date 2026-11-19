# Atlas – privates Reisetagebuch

Eine statische, datenschutzfreundliche GitHub-Pages-App. Besuche werden auf einem interaktiven 3D-Globus dargestellt; Statistiken und eine chronologische Reiseliste werden direkt im Browser berechnet.

## Datenschutz und Speicherung

- Reisedaten liegen **nur im IndexedDB-Speicher des jeweiligen Browsers**.
- Es gibt kein Backend, kein Konto, keine Analytik und keine Datenbank im Repository.
- Ein öffentliches Repository enthält nur den App-Code – niemals die lokal gespeicherten Besuche.
- Das Löschen von Website-Daten, ein Browserwechsel oder ein Geräteverlust kann lokale Daten entfernen. Deshalb regelmäßig eine JSON-Sicherung exportieren.
- Verschiedene Browser, Profile, Geräte und eine installierte PWA haben gegebenenfalls getrennte Speicher.

Der 3D-Globus wird mit **CesiumJS** gerendert. Die Standardansicht lädt hochauflösende Kartenkacheln mit Städten und Ortsnamen direkt von **OpenStreetMap**; dafür ist kein Konto oder API-Token nötig. Dabei gehen keine gespeicherten Reisedaten an OpenStreetMap, der Dienst sieht aber technisch die gerade sichtbaren Kartenausschnitte und übliche Verbindungsdaten. Über „Relief“ lässt sich jederzeit auf die lokal ausgelieferte Natural-Earth-II-Textur wechseln, die auch offline funktioniert.

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
