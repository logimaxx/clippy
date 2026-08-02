# Webklip – Analiză de produs și direcții de diferențiere

> Ultima verificare față de cod: iulie 2026

## Concluzie

Webklip este deja mai matur decât lasă să se înțeleagă homepage-ul. Funcționalități precum:

* încărcarea de fișiere (multiplu, până la 10/clip);
* evidențiere sintaxă (syntax highlighting);
* preview Markdown;
* QR Code;
* version history cu restore;
* REST API, CLI și webhooks;

există deja, însă nu sunt suficient de bine comunicate pe homepage.

Principala provocare nu mai este dezvoltarea funcționalităților de bază, ci diferențierea produsului și poziționarea lui pe piață.

---

# Stare actuală vs. roadmap

## Ce există deja (Phase 2–3)

Verificat în cod (`src/`, `assets/`, `website/static/pages/docs/`).

### Core (anonim, fără cont)

| Funcție | Stare | Note |
| --- | --- | --- |
| Sync în timp real | ✅ | WebSocket — `assets/src/clip-sync.js` |
| URL-uri simple | ✅ | `/my-clip` sau vanity `/{team}/{name}` |
| Expirare automată | ✅ | Preset-uri: 15 min, 1h, 24h, 7 zile + burn after read |
| PIN | ✅ | bcrypt, header `X-Clip-Pin` |
| Criptare E2E | ✅ | AES-256-GCM client-side, cheie în `#key=` |
| Burn-after-read | ✅ | Implicit la creare; owner exempt |
| Fișiere | ✅ | Upload multiplu (max 10), download individual |
| Syntax highlighting | ✅ | CodeMirror — JS, TS, Python, Bash, JSON, HTML, CSS, SQL, Markdown |
| Markdown preview | ✅ | Toggle preview în editor |
| QR Code | ✅ | `GET /:slug/qr` + meniu Share |
| Colaborare live | ✅ | Editare simultană pe același clip |
| Version history | ✅ | Auto-save la 5s, restore din sidebar |
| Live presence (basic) | ✅ | Afișează „N devices”, nu nume/typing |
| PWA | ✅ | Manifest + service worker (cache assets statice) |

### Integrări și cont (opțional)

| Funcție | Stare | Note |
| --- | --- | --- |
| REST API | ✅ | `GET/POST/PUT/DELETE /api/v1/clips/:slug` |
| CLI | ✅ | `bun run cli -- -l slug -m "text"` |
| Webhooks | ✅ | Evenimente `read`, `burned`, `expired` |
| API keys | ✅ | Via cont sau `POST /api/v1/auth/api-keys` |
| Teams | ✅ | Workspace + URL-uri vanity |
| Rol viewer (read-only) | ✅ | Membri team cu rol `viewer` nu pot edita |

### Ce lipsește (confirmat absent din cod)

* Export TXT / Markdown / JSON
* Download ZIP (bulk — doar fișiere individuale)
* Browser extension
* Clipboard sync universal (Ctrl+C → Ctrl+V fără deschidere site)
* AI actions, chat, voice notes, whiteboard, checklist
* Device pairing, Nearby Sharing (WebRTC)
* Offline sync al conținutului
* Live Log Viewer
* Self-destruct per download de fișier (burn-after-read e la nivel de clip)

---

# Observații privind produsul actual

### Puncte forte

* fără cont obligatoriu;
* sincronizare în timp real;
* URL-uri simple și ușor de distribuit;
* expirare automată;
* PIN și criptare end-to-end;
* burn-after-read;
* suport pentru fișiere;
* API + CLI pentru DevOps;
* produs simplu și foarte rapid.

### Ce poate fi îmbunătățit

Homepage-ul (`website/static/pages/home.html`) transmite imaginea unui „online clipboard”, în timp ce produsul este deja mai capabil.

**Lipsesc din landing** (deși există în produs):

* QR Code
* Syntax highlighting
* Markdown preview
* Version history
* REST API / CLI

Acest gap sub-vinde produsul. Detalii de copy în `website/HOMEPAGE_COPY.md`.

### Clarificări terminologice

| Termen în analiză | Ce înseamnă de fapt în Webklip |
| --- | --- |
| Undo / istoric | Version history cu restore — nu Ctrl+Z clasic |
| Read Only | Clip ars după vizită (read-only pentru recipient) + rol `viewer` în teams |
| Live Presence | Doar număr de dispozitive conectate — fără „John is typing…” |
| Expirare personalizabilă | Preset-uri fixe în UI; TTL arbitrar doar via API |
| Disposable API | **Deja implementat** — REST + CLI + webhooks |

---

# Funcționalități la concurență — ce mai merită evaluat

Majoritatea itemilor din lista inițială sunt deja implementate (vezi tabelul de mai sus). Rămân de analizat ca gap-uri reale:

* export TXT / Markdown / JSON
* download ZIP (toate fișierele dintr-un clip)
* expirare cu TTL complet arbitrar în UI (nu doar preset-uri)
* undo clasic (Ctrl+Z) pe lângă version history

---

# Funcționalități cu potențial mare de diferențiere

## Browser Extension

Cea mai importantă direcție.

Exemple:

* Ctrl+C → disponibil instant în Webklip
* Right Click → Share via Webklip
* Share current selection
* Share current page

Reduce drastic numărul de pași.

---

## Clipboard Sync

Universal Clipboard între dispozitive.

Exemplu:

Ctrl+C pe PC

↓

Ctrl+V pe telefon

fără deschiderea site-ului.

> **Notă:** sync-ul actual (`clip-sync.js`) funcționează doar când clipul e deschis în browser — nu e clipboard de sistem.

---

## Temporary Workspace

În loc de un simplu clipboard, un spațiu temporar care poate conține:

* text
* fișiere
* imagini
* checklist *(lipsește)*
* linkuri
* cod
* note

Toate în același URL.

> Parțial acoperit astăzi: text + cod + fișiere + imagini în același clip. Lipsesc tipurile structurate (checklist, linkuri ca entități).

---

## AI Actions

Acțiuni AI direct pe conținutul clipului.

Exemple:

* Summarize
* Translate
* Improve
* Explain
* Explain code
* Fix grammar
* Beautify JSON
* Generate Regex
* Generate SQL
* Convert formats

---

## Live Presence (extins)

Azi: număr de dispozitive conectate (`2 devices`).

Viitor:

* Mihai is viewing
* John is typing...

---

## Temporary Chat

Fiecare clip poate avea un chat temporar care expiră împreună cu clipul.

---

## Voice Notes

Atașare rapidă de mesaje audio.

---

## Whiteboard

Schițe rapide.

---

## Self Destruct After Download

Fișierul se șterge după primul download.

> Distinct de burn-after-read (la nivel de clip/view). Nu există încă.

---

## Device Pairing

Telefon + desktop asociate permanent prin QR.

Nu mai este nevoie de distribuirea URL-urilor.

---

## Nearby Sharing

Transfer direct prin LAN/WebRTC atunci când dispozitivele sunt în aceeași rețea.

---

## Offline Mode

Funcționează offline și sincronizează ulterior.

> PWA există, dar service worker-ul cache-uiește doar assets statice — nu conținutul clipurilor.

---

## Live Log Viewer

Publicarea în timp real a logurilor de aplicație.

Ideal pentru suport tehnic și DevOps.

---

# Ideea cu cel mai mare potențial

## Webklip ca „Temporary Workspace”

În loc să fie perceput ca:

> Online Clipboard

poate deveni:

> Disposable Workspace

Un spațiu temporar pentru colaborare și transfer rapid de informații.

Un workspace poate conține simultan:

* note *(parțial — text liber)*
* fișiere *(da)*
* cod *(da — syntax + preview)*
* imagini *(da)*
* checklist *(nu)*
* linkuri *(nu ca entități)*
* AI *(nu)*
* comentarii *(nu)*
* chat *(nu)*
* voice notes *(nu)*

Totul expiră automat.

Această poziționare reduce concurența directă cu serviciile clasice de clipboard.

---

# Segmente de utilizatori cu potențial

În locul publicului larg, produsul poate fi optimizat pentru persoane care folosesc acest tip de workflow de zeci de ori pe zi.

Exemple:

* dezvoltatori software
* administratori de sistem
* DevOps *(API/CLI deja util aici)*
* suport tehnic
* QA
* consultanți IT
* freelanceri
* designeri

---

# Direcții de dezvoltare recomandate

## Prioritate 0 — fără cod nou, impact imediat

* Actualizare homepage — comunică ce există deja (QR, syntax, preview, API)
* Capturi reale ale produsului
* Repoziționare copy: „Temporary Workspace” vs. „online clipboard”

---

## Prioritate 1

* Browser Extension
* Clipboard Sync între dispozitive (sistem, nu doar in-tab)
* Temporary Workspace (tipuri de conținut structurat)
* AI Actions

---

## Prioritate 2

* Device Pairing
* Nearby Sharing
* Offline Sync (conținut, nu doar assets)
* Folders / Collections *(teams acoperă parțial organizarea)*

---

## Prioritate 3

* API discoverability — SDK, exemple, integrări (API-ul există, dar e sub-comunicat)
* Export TXT / Markdown / JSON + download ZIP
* Live Logs
* Pipelines (OCR → Translate → Share, Image → PDF etc.)
* Whiteboard
* Voice Notes
* Temporary Chat

---

# Concluzie

Cea mai importantă oportunitate nu este adăugarea unui număr mare de funcționalități, ci schimbarea percepției produsului.

În prezent, Webklip poate fi perceput ca un simplu clipboard online — deși are deja editor de cod, preview Markdown, QR, version history, API și colaborare live.

Direcția strategică recomandată este transformarea lui într-un **Temporary Workspace**: un spațiu temporar, privat și colaborativ, destinat schimbului rapid de informații între oameni și dispozitive.

Această poziționare este mai greu de copiat, extinde semnificativ cazurile de utilizare și diferențiază produsul de serviciile clasice de tip clipboard sau pastebin.

**Primul pas concret:** aliniază homepage-ul cu realitatea produsului (vezi `website/HOMEPAGE_COPY.md`), apoi investește în diferențiere (extension, clipboard sync, workspace extins).
