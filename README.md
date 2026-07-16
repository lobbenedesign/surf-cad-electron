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
- **Esportazione per la Produzione:** Export funzionante in formato **STL** (3D per stampe), **DXF** (per CAD/CNC) e **G-code** (per fresatura outline).
- **Undo/Redo:** Cronologia completa degli stati della tavola per modifiche sicure.
- **Design Grafico:** Inserimento e posizionamento di decalcomanie e design su deck e bottom (forme primitive, immagini, import SVG).

## 📸 Anteprima (Screenshots)

![Screenshot 1](images/Screenshot%202026-07-16%20alle%2012.36.16.png)
![Screenshot 2](images/Screenshot%202026-07-16%20alle%2012.37.00.png)
![Screenshot 3](images/Screenshot%202026-07-16%20alle%2012.37.14.png)
![Screenshot 4](images/Screenshot%202026-07-16%20alle%2013.26.03.png)

## 🗺️ Roadmap e Prossime Implementazioni

Stiamo lavorando per rendere SURF-CAD ELECTRON lo strumento definitivo per qualsiasi tipo di imbarcazione o tavola. Di seguito le implementazioni previste per il futuro:

### Ottimizzazioni e Strumenti CAD Base
- **Sistema avanzato di continuità dei punti di controllo:** Maschere per asse, blocco delle tangenti e vincoli tra punti (slave/fix) per curve sempre fluide (es. C2).
- **Trace-image (Digitalizzazione da Foto):** Inserimento di immagini di riferimento in background con opacità regolabile e calibrazione per ricalcare fedelmente tavole esistenti.
- **Ghost Board e Confronto Quantitativo:** Possibilità di sovrapporre una seconda tavola nelle viste 2D per valutare visivamente e numericamente i delta di volume e forma.
- **Weight Calculator:** Calcolatore del peso finale della tavola in base a densità della schiuma (PU/EPS), hardware, tessuto di vetro e resina.
- **Volume Wizard:** Strumento per generare e scalare automaticamente le dimensioni della tavola al fine di raggiungere un volume target.
- **Scheda di Produzione PDF:** Generazione di fogli in scala 1:1 (multi-pagina per ricalco su schiuma) e scheda specifiche per l'ordine.
- **Tabella Numerica Stazioni:** Alternativa avanzata per l'editing delle specifiche tramite griglia numerica.
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

## 📄 Licenza

Questo progetto è rilasciato sotto licenza [MIT].
