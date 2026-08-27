# SURF-CAD ELECTRON

SURF-CAD ELECTRON è un'applicazione desktop per il design e la modellazione 3D di tavole da surf, sviluppata con **React**, **TypeScript** ed **Electron**. L'applicazione fornisce un set completo di strumenti per shaper, consentendo di progettare tavole con precisione millimetrica, gestire le specifiche tecniche e visualizzare il risultato in tempo reale.

## 🚀 Caratteristiche Principali (Attualmente Implementate)

- **Editor 2D Completo:**
  - **Outline:** Modellazione della curva di outline tramite curve di Bezier simmetriche (Top View).
  - **Rocker & Deck:** Gestione del profilo laterale (Side View) con curve indipendenti per deck e bottom.
  - **Cross-Section:** Editor per le sezioni trasversali a 9 stazioni con profilo rail basato su Catmull-Rom.
- **Loft 3D Live:** Generazione in tempo reale della mesh 3D della tavola, con rendering accurato tramite Three.js basato sui profili cross-section.
- **Viste Multiple (Quad View):** Lavoro contemporaneo su Outline, Cross Sections, Rocker/Thickness e visualizzazione 3D.
- **Tail Designer:** Gestione avanzata del tail (round, square, pin, squash, swallow) con notch reale e corretto posizionamento 3D/2D.
- **Modulo Pinne Completo:** 11 template (thruster, quad, keel, ecc.), 4 famiglie di foil, 6 sistemi di attacco (FCS I/II, Futures, US Box, ecc.), setup multi-pinna e posizionamento 3D estremamente realistico e coerente con la larghezza della tavola.
- **Board Specification Panel:** Controllo analitico delle misure per ogni stazione (Nose, Center, Tail) e calcolo del volume stimato.
- **Template Tavola Integrati:** Preset pronti all'uso per Shortboard, Fish, Longboard, Gun e Hybrid.
- **Esportazione per la Produzione:** Export funzionante in formato **STL** (mesh watertight con naso/coda chiusi, 3D per stampe), **DXF** (per CAD/CNC) e **G-code** (per fresatura outline).
- **Undo/Redo:** Cronologia completa degli stati della tavola per modifiche sicure, con coalescenza dei gesti di drag in un solo step.
- **Design Grafico:** Inserimento e posizionamento di decalcomanie e design su deck e bottom (forme primitive, immagini, import SVG, export PNG/SVG/PDF).
- **Weight Calculator:** Stima peso (foam PU/EPS + glass oz/yd² + hardware) a scopo di preventivo.
- **Volume Wizard:** Risolve automaticamente lunghezza, larghezza o spessore per colpire un volume target in litri.
- **Ghost Board:** Sovrapposizione tratteggiata di una seconda tavola (template o snapshot) nelle viste Outline/Rocker, con delta di volume e larghezza per stazione.
- **Scheda Spec/Ordine PDF:** Foglio riassuntivo A4 non in scala con diagrammi outline/profilo, tabella stazioni, volume e area.
- **Trace-image:** Immagine di riferimento caricabile dietro gli editor Outline e Rocker, con opacità, posizione, dimensione e specchiatura regolabili, per ricalcare tavole esistenti da foto.
- **Tabella Stazioni Avanzata:** Toggle tra misurazione "a linea retta" e "lungo lo stringer" (arc-length reale sul rocker), più area piano in m².
- **Continuità dei Punti di Controllo (v1):** i punti interni delle curve outline/rocker/deck non possono superare i vicini in x — la curva non si "ripiega" mai su se stessa.

## 📸 Anteprima (Screenshots)

![Screenshot 1](images/Screenshot%202026-07-16%20alle%2012.36.16.png)
![Screenshot 2](images/Screenshot%202026-07-16%20alle%2012.37.00.png)
![Screenshot 3](images/Screenshot%202026-07-16%20alle%2012.37.14.png)
![Screenshot 4](images/Screenshot%202026-07-16%20alle%2013.26.03.png)

## 🗺️ Roadmap e Prossime Implementazioni

Stiamo lavorando per rendere SURF-CAD ELECTRON lo strumento definitivo per qualsiasi tipo di imbarcazione o tavola. Di seguito le implementazioni previste per il futuro:

### Ottimizzazioni e Strumenti CAD Base
- **Sistema di continuità dei punti di controllo (v2 completo):** oggi solo la monotonicità in x è garantita (v1); mancano ancora maschere per asse, blocco delle tangenti a 4-bit e vincoli slave/fix tra punti (es. deck↔bottom condividono il tip), che richiedono un modello anchor+handle.
- **Scheda di Produzione PDF in scala 1:1:** oggi la scheda PDF è un riassunto non in scala; manca ancora la stampa multi-pagina in scala reale per ricalco su schiuma.
- **Strumenti CAD Aggiuntivi:** Raccordi (Fillet/Chamfer), trim/extend di segmenti, manipolatore 3D (gizmo) e quotature persistenti sul disegno.
- **Operazioni Booleane Solide:** Operazioni 3D (estrusione, pocket, unione/sottrazione) necessarie per una corretta realizzazione dei box per pinne, mast track e altri inserti.

### Espansione delle Modalità e Categorie
- **Modalità Bodyboard:** Supporto per canali inferiori e rail 60/40.
- **Modalità SUP (Stand Up Paddle):** Gestione dello scafo (planing/displacement) e area di stance per il deck.
- **Modalità Windsurf:** Inserimento del mast track (scassa dell'albero), footstrap in griglia configurabile, famiglie di scasse specifiche (Tuttle, Power Box) e approccio progettuale basato primariamente sul volume.
- **Modalità Skateboard / E-Skateboard:** Gestione del concave, kicktail, fori per i truck, enclosure per batterie e motor mount con analisi del flex.
- **Modalità Wakeboard e Kiteboard:** Outline a specchio (twin-tip) e griglia inserti per i binding/footstrap.
- **Modalità Canoa / Kayak:** Gestione avanzata dello scafo con rocker indipendenti per prua/poppa, sheerline, keel line, e configurazione dei pozzetti.
- **Costruzione Hollow Wood Surfboard (HWS):** Sottosistema completo per creare tavole in legno cavo (calcolo stringer con incastri, centine egg-crate, piano di nesting su fogli da taglio).

### Importazione ed Esportazione
- **Importazione file CAD legacy:** Supporto per il caricamento di formati storici del settore (.brd, .s3d, .srf) con un sistema intelligente per risolvere automaticamente eventuali problemi di geometria.

## 🛠️ Requisiti e Installazione

Il progetto utilizza [Electron Vite](https://electron-vite.org/) per un setup rapido di Electron con React e TypeScript.

1. **Clona la repository:**
   ```bash
   git clone https://github.com/TUO_PROFILO/surf-cad-electron.git
   cd surf-cad-electron
   ```

2. **Installa le dipendenze:**
   ```bash
   npm install
   ```

3. **Avvia in modalità sviluppo:**
   ```bash
   npm run dev
   ```

4. **Compila per la produzione (Esportazione app nativa):**
   ```bash
   # Per macOS
   npm run build:mac
   
   # Per Windows
   npm run build:win
   
   # Per Linux
   npm run build:linux
   ```

## ✅ Test automatizzati

Il progetto ha una suite di **31 test automatizzati** ([Vitest](https://vitest.dev/)) sulla logica geometrica/matematica pura del CAD (nessun test su rendering React/Three.js, non significativamente unit-testabile):

- `src/renderer/src/core/bezier.test.ts` — valutazione curve di Bezier cubiche (valori noti a t=0/0.5/1, riduzione a interpolazione lineare per punti equispaziati collineari), concatenazione di path multi-segmento (`evaluatePath`), interpolazione lineare stile `numpy.interp` con clamping, resampling di una curva su una griglia X comune.
- `src/renderer/src/core/spline.test.ts` — spline Catmull-Rom: passaggio esatto per ogni punto di controllo, riduzione a retta per punti collineari equispaziati, caso degenere a 2 punti.
- `src/renderer/src/core/curveFit.test.ts` — fit least-squares di una bezier cubica su punti campionati da una curva nota, con recupero dei control point entro tolleranza e round-trip (ri-valutando la curva fittata si riproducono i punti di partenza).
- `src/renderer/src/core/units.test.ts` — conversione cm → formato imperiale (piedi/pollici/frazioni in 16-esimi) usata per le misure tavola.
- `src/renderer/src/core/weightCalculator.test.ts` — stima peso tavola (schiuma PU/EPS, vetro oz/yd², hardware): linearità rispetto a volume/layer di vetro, valori attesi calcolati a mano sui coefficienti (densità schiuma, fattore rail-wrap, rapporto resina/vetro).

Un bug reale è stato trovato e corretto durante la scrittura dei test: `cmToImperialStr` (in `units.ts`) produceva una stringa malformata (`6'"` invece di `6' 0"`) per lunghezze esattamente su un confine di piede intero, perché la cifra dei pollici veniva omessa quando risultava zero. Vedi il test di regressione in `units.test.ts`.

Esecuzione:
```bash
npm test
```

La CI su GitHub Actions (`.github/workflows/ci.yml`) esegue `npm run typecheck` + `npm test` su `ubuntu-latest` a ogni push/PR verso `main`. Il packaging Electron (`build:win`/`build:mac`/`build:linux`) non è incluso in CI: richiede toolchain nativi per piattaforma ed è fuori scope per un gate rapido.

## 📄 Licenza

Questo progetto è rilasciato sotto licenza [MIT].
