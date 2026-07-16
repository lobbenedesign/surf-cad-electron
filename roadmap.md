# SURF-CAD Electron — Roadmap

Documento di lavoro. Consolida due sessioni di ricerca (software di riferimento + tipologie di tavole/imbarcazioni + strumenti CAD classici) in un piano d'azione. Ogni voce cita la fonte per poter essere riverificata.

Report visivo della prima sessione di ricerca (Akushaper/Shape3D/altre tavole/skate): https://claude.ai/code/artifact/281b4267-623c-4d29-9148-eece43e13342

---

## 0. Stato attuale

**Legenda:** 🟢 completamente implementato · 🟡 implementato parzialmente · 🔴 assente

Cosa esiste già in `SURF-CAD ELECTRON/`:

- 🟢 Editor Outline (Bezier simmetrica, top view)
- 🟢 Editor Rocker & Deck (2 curve Bezier, side view)
- 🟢 Editor Cross-Section (9 stazioni, profilo rail Catmull-Rom, punti trascinabili)
- 🟢 Loft 3D live in three.js (usa i profili cross-section reali, non più formula ellittica)
- 🟢 Quad View (Outline / Cross Sections / Rocker&Thickness / 3D)
- 🟢 Tail Designer (round/square/pin/squash/swallow — swallow implementato come biforcazione reale della mesh, non solo cosmetica) e **notch reale visibile anche nella vista 2D Outline** (non solo in 3D)
- 🟢 Board Specification panel (misure per stazione: Nose, Nose 30cm, Center, Tail 30cm, Tail + volume stimato)
- 🟢 **Modulo Pinne completo**: editor outline (depth/base/rake trascinabili), 11 template (T1-T6 thruster, Q1 quad-rear, K1 keel, L1/L2 longboard, TW1 twin), 4 famiglie di foil (flat/50-50/80-20/inverted, distribuzione NACA reale), 6 sistemi di attacco (FCS I/II, Futures, US Box, Lokbox, Glass-on) con dimensioni tab da specifiche ufficiali, setup multi-pinna (single/twin/thruster/quad/2+1) con cant/toe per slot, montaggio 3D corretto (posizione risolta dalla reale larghezza del rail per stazione — mai più pinne fuori dallo scafo — ordine avanti/indietro e segno del cant corretti e verificati numericamente), editing posizione/orientamento con pinne accoppiate a specchio e manipolatore 2D drag-and-drop
- 🟢 **Template Tavola**: 5 preset (Shortboard/Fish/Longboard/Gun/Hybrid) con valori reali da `SURF PY_2/templates.py`, selezionabili dalla toolbar — generano outline/rocker/deck/tail/pinne coerenti in un click
- 🟢 **Undo/Redo**: history a snapshot dell'intero `BoardState` (non command-pattern — `BoardState` è già trattato come immutabile ovunque, quindi una entry di history è solo un riferimento, senza diff/patch). `beginEdit()`/`endEdit()` racchiudono un gesto di drag (bezier, cross-section, pinna, campi numerici) così le decine di eventi `pointermove`/`onChange` che genera collassano in un solo step di undo. Bottoni + scorciatoie Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z. Vedi `core/useBoardHistory.ts`. Pattern verificato contro l'architettura reale di OpenShaper (§1.6) — stesso approccio, senza bisogno di zustand.
- 🟡 **Tab Design grafico** (decal editor deck/bottom, disegno + import + export) — vedi §6 per il dettaglio completo di cosa è coperto e cosa manca ancora (rendering 3D del design sulla mesh, import PDF reale, rotate-handle).
- 🟢 **Sidebar ridimensionabile e collassabile**: drag-handle per allargare/restringere il pannello dimensioni, bottone ◀/▶ per collassarlo/riespanderlo lasciando più spazio alle viste.

- 🟡 **Export STL/DXF/G-code**: tre bottoni in toolbar, tutti verificati funzionanti in-browser (blob catturato e ispezionato, non solo "il download parte"). **STL**: ASCII, watertight (cap a naso/coda con winding verificato analiticamente), mesh tavola + pinne (con box), scala cm→mm. **DXF**: R12 `POLYLINE`/`VERTEX`, layer `OUTLINE` (contorno intero specchiato) + `PROFILE_ROCKER`/`PROFILE_DECK`. **G-code**: contorno outline in singola passata, `G21`/`G90`, plunge+cut+retract, verificato leggibile. Vedi §5 Ora e gap elencati lì (niente profile/deck/bottom g-code, niente cross-section/layer colorati/spline nel DXF).
- 🟢 **Weight Calculator**: dialog dedicato (`core/weightCalculator.ts` + `WeightCalculatorDialog.tsx`), formula da §1.6 (densità foam PU/EPS × volume + peso glass oz/yd² × area bagnata × 1.15 × strati × 2.5 rapporto resina + hardware), verificato che il calcolo torni esatto a mano (0.37kg foam per 9.15L PU = 9.15/1000×40, confermato).
- 🟢 **Tabella stazioni con toggle "Linea retta"/"Lungo stringer"**: `measurements.ts` ora calcola la posizione delle stazioni per arc-length lungo il rocker quando si seleziona "Lungo stringer", non solo per x retta — verificato in-browser che il toggle produce un delta reale e nella direzione fisicamente corretta (stazione più vicina alla punta ⇒ larghezza minore). Aggiunta anche l'**Area piano** (m²) accanto al volume. Non ha ancora colonne configurabili come la tabella di Shape3D (resta 🟡 solo su quel dettaglio, non tracciato separatamente).
- 🟢 **Fix interpolazione cross-section**: `interpolateStationPoints` non tronca più silenziosamente con `Math.min` se due stazioni hanno conteggi di punti diversi — ora ricampiona entrambe a un conteggio comune con `catmullRomSample` prima del blend. Nella UI attuale add/remove punto è già sincronizzato su tutte le stazioni quindi il bug non si manifestava, ma resta una protezione strutturale corretta (import futuri, edit per-stazione).
- 🟡 **Sistema di continuità punti di controllo — v1 scoped**: `core/curveConstraints.ts`, applicato in `CurveEditor2D`. Non è il modello anchor+handle completo di OpenShaper (che richiederebbe ristrutturare `CurveCP` ovunque è usato) — è il singolo vincolo a più alto valore sul modello che abbiamo davvero: i punti interni (P1/P2) di outline/rocker/deck non possono più superare in x il loro vicino, quindi la curva non può ripiegarsi su se stessa. Verificato in-browser: trascinando P1 oltre P2, si blocca esattamente alla x di P2 invece di superarla. Il modello completo (maschere per-asse, tangent-lock a 4 bit, punti slave/Fix, C2) resta 🔴 — vedi §3.2.

Mancano ancora, note dalla sessione precedente:
- 🔴 Import (.s26-equivalente, .brd/.s3d/.srf); export PDF spec-sheet della tavola (quello del **design grafico**, §6, è invece già implementato, ma è un export separato — non una spec sheet con outline/profilo/misure)
- 🔴 Ghost board, Volume Wizard, scheda spec/ordine PDF, guide points + trace-image — vedi §5 Prossimo

---

## 1. Software di riferimento — sintesi

### 1.1 BoardCAD (fonte primaria: sorgente Java locale)

Estratto da `boardcad-le-master/src/boardcad/i18n/LanguageResource_en_US.properties` (888 righe, la fonte più affidabile perché è ogni etichetta UI del programma reale). Vedi report artifact §2 per la tabella completa funzione-per-funzione. Punti che mancano ancora a noi: Guide points + "Fit curve to guidepoints", immagine di sfondo da ricalcare, Ghost board, Scale board con vincolo proporzioni, Fins dialog, Weight calculator, export DXF/STL/G-code, import .brd/.srf/.s3d.

### 1.2 Akushaper & Shape3D (fonte: akushaper.com, shape3d.com — manuale V9 scaricato e letto integralmente)

- **Volume Wizard** (Shape3D, tasto "\*" nel pannello Master Scale): risolve una dimensione dato un volume target.
- **Master Scale + tabella stazioni**: pannello con volume/lunghezza/larghezza/spessore/rocker, tasto "More >>" che espande una **tabella numerica** con colonne selezionabili (Width, Stringer Rocker, Profile Rocker, Stringer Thickness, Profile Thickness, V/Concave depth) a stazioni configurabili — alternativa numerica precisa all'editing grafico. Include il toggle **"A Straight Line" vs "The Stringer"** per il modo di misurazione (radicalmente diverso: 12" dalla coda in linea retta ≠ 12" dalla coda lungo lo stringer curvo).
- **Sistema di continuità dei punti di controllo** (pannello "Control point properties"), il pezzo più concreto e implementabile trovato:
  - 5 tipi di tangente: **Continuous** (default, maniglie collineari), **Angular** (corner, maniglie indipendenti — usato per il punto di rail), **Vertical** (usato per l'apex), **Horizontal** (usato per il punto di massima larghezza/spessore), **Continuous con angolo fisso**.
  - **Passive**: punto senza tangenti, "dead point" per mantenere lo stesso conteggio di punti tra stazioni diverse.
  - Checkbox **C2**: forza continuità di curvatura (non solo tangenziale/G1) — indipendente dal tipo di tangente.
  - Checkbox **Rel**/**Fix**: mostra posizione relativa a un altro punto / blocca la posizione relativa a un punto di riferimento (i due punti si muovono insieme).
  - Convenzione di design esplicita nel manuale: punto di rail → Angular, punto di apex → Vertical.
- **Contour Highlight 3D** (entrambi i software): vista isolata che evidenzia concavità/vee — standard de facto confermato da entrambi i concorrenti.
- **Ghost board quantitativo** (Shape3D): non solo overlay visivo, delta di volume sezione per sezione.
- Nota: il pannello "Model Parameters" con slider Length/Nose/Width/Rocker/Rail/Deck/Bottom-Contour visto in uno screenshot **non è stato trovato nel manuale Shape3D X** (ricerca full-text nel PDF, nessun riscontro). Candidati alternativi non confermati: FoilCAD (parametrico a slider, ma per hydrofoil non tavole surf), AkuShaper, o un customizer non identificato. Da trattare come funzionalità isolata da validare, non da un prodotto specifico — l'idea (modalità "guidata" a slider oltre all'editing Bezier manuale) resta valida indipendentemente dalla fonte.

### 1.3 "AI Shaper CAD" (fonte: forum.swaylocks.com, thread utente "Swied")

**Non è un prodotto pubblico.** È un fork privato non pubblicato di BoardCAD-LE, costruito da uno shaper hobbista tramite un agente AI (Gemini CLI) in circa 10 ore di sessioni di prompting — non un'app scritta da zero in React/Vite come lo screenshot lasciava supporre. Nessun dettaglio pubblicato su come funzioni davvero il ponte linguaggio-naturale→geometria al momento della generazione (se il tasto "Generate" chiami un LLM in tempo reale o applichi trasformazioni pre-codificate). L'autore ha reso open-source solo un fork base di BoardCAD-LE, raccomandando comunque di usare il repository ufficiale.

**Cosa vale la pena portare:** solo il pattern UX — casella di prompt in linguaggio naturale ("Apply a sharp 80/20 hard edge rail out the tail") → risultato in ~15 secondi. Non un'architettura da copiare, perché non è mai stata documentata.

### 1.4 FreeCAD (fonte: forum.freecad.org thread #35513, wiki.freecad.org)

**Non esiste un workbench FreeCAD dedicato al surf shaping.** Lo screenshot "Fish 2024" è il lavoro bespoke e mai pubblicato di uno shaper (Yvanr, YRS Surfboards) costruito sui workbench standard (Sketcher + Part Design + Surface + il componente di terze parti **Curves** di tomate44, il riferimento della community per superfici NURBS organiche tipo scafi/pesci). Nessun codice o macro condivisi.

Da FreeCAD prendiamo però l'**inventario degli strumenti CAD classici** che ci mancano — vedi §4.

### 1.5 Software per altre tipologie (fonte: ricerca web multi-fonte, dettaglio nell'artifact §4-§5)

| Categoria | Software dedicato | Gap di mercato |
|---|---|---|
| SUP | Nessuno — stesso motore Shape3D/Akushaper del surf | Estensione diretta |
| Kiteboard | Nessuno per la tavola (solo KaroroCAD per la vela) | Spazio bianco |
| Wakeboard | Nessuno | Spazio bianco, categoria più debole |
| Skimboard | Nessuno | Spazio bianco, parametri minimi |
| Bodyboard | NMD Bodyboards usa già Shape3D + CNC Akushaper in produzione | Estensione diretta |
| Windsurf | Nessuno dedicato — stesso motore surf | Estensione diretta, con feature nuove (vedi §2.2) |
| Skateboard | **SK8CAD** (web, parametrico, OpenJsCAD) — riferimento diretto valido | — |
| E-skateboard | Nessuno — community usa Fusion 360 pezzo per pezzo | Spazio bianco reale, ma richiede booleani solidi/assiemi |
| Canoa/Kayak | **KayakFoundry** (stazioni, ma fermo da anni), **DELFTship** (NURBS+chine, attivo), **Orca3D** (plugin Rhino, attivo) | Vedi §2.3 — modello dati diverso dal nostro |

### 1.6 OpenShaper (fonte: sorgente locale `3DCAD/OpenShaper-main`, letto integralmente — docs + codice)

Rebuild TypeScript moderno dello stesso BoardCAD-LE Java che già usiamo come riferimento (`boardcad-le-master`) — monorepo pnpm/turborepo: `apps/web` (React 18 + react-three-fiber + zustand + Tailwind v4), `apps/desktop` (shell Tauri), `packages/kernel|store|render2d|render3d|io|export|ui|units`. Ha già affrontato in modo rigoroso (con test golden-fixture su file `.brd` reali) diversi problemi che abbiamo ancora aperti.

**⚠️ Licenza GPL-3.0-or-later.** Non copiare codice `.ts` verbatim — gli algoritmi/comportamenti descritti nelle loro spec (`docs/specs/*.md`, prosa + formule, non codice) vengono reimplementati autonomamente da noi, esattamente come OpenShaper stesso ha fatto per ricostruire BoardCAD-LE "clean-room" dal Java legacy.

**Cosa abbiamo estratto (mappato sulle nostre voci di roadmap):**

- **Sistema di vincoli sui punti di controllo** (`docs/specs/junction-constraints.md`, porting diretto da `BezierBoard.java setLocks()`/`checkAndFixContinousy()`) — un modello molto più preciso e implementabile di quanto trovato in Shape3D (§1.2, §3.2): maschere per-asse sul drag (`mask=1` asse libero, `mask=0` asse bloccato), tangent-lock a 4 bit (`LOCK_X_MORE/LESS`, `LOCK_Y_MORE/LESS`, clampano la maniglia rispetto all'endpoint), punti "slave" (endpoint agganciati, si muovono insieme). Regole concrete verificabili: outline endpoints bloccati su entrambi gli assi; deck/bottom endpoints x-bloccati y-liberi; deck↔bottom si condividono nose+tail tramite slave reciproco; ogni punto di outline/deck/bottom ha tangenti vincolate a restare monotone in x (curva mai "ripiegata"); soglia di continuità angolare `||π − angolo_prev| − angolo_next| < 0.02 rad` (~1°) per riconciliare il flag "continuo" col tangente reale.
- **Algoritmo per il notch reale dello swallow/fish tail** (`outline-cutout.ts`, "AIShaper method") — risolve esattamente il nostro gap §0/§5: la outline diventa non-monotona in x in coda, il tip (punto di x minimo) separa un tratto "parete interna" (`tailInner`) da un tratto "rail esterno" (`mainRail`); per ogni stazione si calcola `(y_in, y_out)` per interpolazione lineare su tabella ordinata; un notch è reale solo se `innerMaxX − tipX > 0.05cm` **e** `tipHalfWidth > 0.5cm` (altrimenti è solo una tangente ripiegata, non un vero swallow); il loft 3D diventa un doppio guscio ±Y sigillato dalle pareti del notch; area/volume si integrano su `2·(y_out−y_in)` invece di `2·y_out`. Limite dichiarato: un solo notch per lato (niente batwing/code multi-punta).
- **Interpolazione sLinear e morphing tra cross-section con conteggi di punti diversi** (`docs/specs/kernel-interp.md`) — usa de Casteljau splitting per inserire punti nella spline più povera fino a pareggiare i conteggi, poi blend lineare. Il nostro `interpolateStationPoints` oggi tronca silenziosamente (`Math.min(lo.points.length, hi.points.length)`) se due stazioni hanno conteggi diversi — miglioria da adottare.
- **`bestFit` — fit least-squares di una bezier cubica a punti campionati** (chord-length parametrizzato, `M⁻¹·(UᵀU)⁻¹·Uᵀ·D`) — esattamente l'algoritmo che ci serve per "Guide points + immagine di sfondo da ricalcare" (§5 Prossimo).
- **Trace-image (digitalizzazione da foto/scan)** — implementato per davvero, non uno stub: immagine di riferimento per vista (outline/rocker) con opacità, mirror/flip, calibrazione a 4 click o lunghezza tipizzata per mappare pixel→cm. Workflow standard del settore, l'agente di ricerca lo segnala come "da prioritizzare se non già in roadmap" — lo promuoviamo in §5 Prossimo.
- **Ghost board — implementato per davvero**: overlay di una seconda tavola nelle viste 2D, diff delle specifiche derivate, layer DXF dedicato `GHOST` (tratteggiato, per confronto CNC), colore configurabile.
- **Weight calculator — formula concreta**: `estimateWeight(volumeL, planAreaM2, foam, glass)` — densità schiuma (PU 40 kg/m³, EPS 28 kg/m³) × volume + costanti stringer/hardware + peso tessuto (oz/yd²) × area bagnata × 1.15 (avvolgimento rail) × 2.5 (rapporto resina). Dichiarato esplicitamente "aiuto per preventivo, non una bilancia" — livello di ambizione corretto da replicare.
- **Export STL**: ASCII (non binario), loft ad anelli per stazione con `pointByTT`, richiude nose/tail a ventaglio, fallback alla mesh watertight del kernel per tavole con notch (swallow). **DXF**: entità R12, layer nominati con colori AutoCAD standard (OUTLINE bianco, ROCKER blu, CROSSSECTION verde, CENTERLINE rosso, GHOST grigio tratteggiato, FINS magenta). **PDF**: due esportatori distinti — uno stampa-1:1 a tassellatura multi-pagina (per ricalco su schiuma), uno spec-sheet HTML→stampa non in scala.
- **Nessun export G-code esiste in OpenShaper** (confermato via grep sul repo) — resta un'area completamente da inventare da noi, nessun riferimento da studiare.
- **Nessun Volume Wizard** (risolvi-dimensione-da-volume-target) — solo una tabella statica età→litri in una pagina marketing, non un solver contro il modello live. Resta greenfield.
- **Nessuno strumento fillet/chamfer, boolean, o gizmo 3D** — confermato assente anche in OpenShaper (l'editing lì è tutto su spline di controllo 2D, non su mesh 3D con transform). Conferma che §3.1/§3.3 sono territorio ancora inesplorato da chiunque nel dominio surf-CAD.
- **Pattern UI utili**: palette scura "Deep Ocean Tech" OKLCH (niente light/dark toggle, editor CAD nightmode-first); componente `Panel`/`PanelHeader`/`PanelBody` riusato ovunque come guscio generico invece di dialog modali; principio esplicito "i controlli vivono fisicamente vicino a ciò su cui agiscono" (i controlli Add/Delete/Copy di una cross-section stanno nell'header di quel pannello, non in una toolbar globale); collegamento bidirezionale spessore↔rocker scoping esplicito (edit di una curva globale aggiorna le sezioni, ma solo su centerline+larghezza, non la forma del rail); **pattern import-warning**: riparazioni cosmetiche di file corrotti mostrate come banner dismissibile non bloccante, riparazioni distruttive (perdita di geometria) bloccate da un modale con Annulla/Importa comunque — utile quando implementeremo import `.brd`/`.s3d`.
- **Sottosistema di costruzione Hollow Wood Surfboard (HWS)** — non richiesto dalla nostra roadmap attuale ma segnalato dall'analisi come "il sottosistema più prezioso oltre l'ovvio": genera stringer con incastri a mezzo-legno, N centine trasversali con slot complementari (egg-crate), nesting 2D reale su foglio e distinta taglio, esportabile DXF/SVG/PDF. Vedi §2.5 (nuova) e §5 Dopo se vogliamo differenziarci sulla costruzione in legno cavo.

### 1.7 Surf-Shaper (fonte: sorgente locale `3DCAD/Surf-Shaper-master`, letto integralmente)

**Non è un CAD engine** — è un frontend React sottile (create-react-app, non più mantenuto: `react-three-fiber` v8/`drei` v9/classi invece di hook) che chiama un modello parametrico proprietario su **Onshape** (CAD cloud) via API, riceve GLTF, e lo renderizza con three.js; l'unico output locale è STL per slicer 3D (non per CNC di produzione). La vera logica di shaping vive in un FeatureScript Onshape privato, non nel repository — nessun algoritmo di geometria da estrarre.

**Idee UX valide da portare:**
- **Comparazione live di 3 tavole side-by-side in 3D**, disposte a triangolo con bottoni "shift" per far ruotare quale tavola è quella "attiva" da editare — un'alternativa al Ghost-board-overlay per confrontare varianti, utile da tenere a mente per §5 Ghost board.
- **Pannello slider generato da metadati parametrici** (nome/min/max/default per dimensione) — conferma che il pattern "Model Parameters a slider" che avevamo segnato come non confermato in Shape3D (§1.2) è un pattern reale e valido, solo non documentato lì.
- **Stato di caricamento animato** durante il ricalcolo lento lato server — idea di polish per quando avremo operazioni pesanti (es. export CNC).

---

## 2. Espansione tipologie tavola/imbarcazione

### 2.1 Board acquatiche a tavola (surf, SUP, kite, wake, skim, bodyboard) — dettaglio completo nell'artifact §4

Riassunto delle feature nuove necessarie, per sottosistema condiviso invece che per singola tavola:

- **Sistema canali/scanalature parametrico** (bodyboard, SUP, kiteboard, wakeboard): array di canali (numero, apertura entrata/uscita, profondità, posizione lungo la coda) — più generale del singolo "canale" che abbiamo oggi.
- **Rail split percentuale** (bodyboard "60/40"): parametro bottom%/top% + angolo di chine + durezza del crease, distinto dal modello rail attuale.
- **Outline a specchio** (kiteboard/wakeboard twin-tip): modalità "mirror tip" dove nose=tail per costruzione.
- **Griglia inserti** (footstrap kiteboard, binding wakeboard): sistema parametrico posizione/spaziatura, con pattern standard predefiniti (es. binding wakeboard: piastra 6", viti M6).
- **Stato "senza pinna" di prima classe** (skimboard, bodyboard): non un caso limite con 0 pinne, ma un board-type a sé.
- **Famiglia rocker a stadi** (wakeboard: continuo/3-stage/5-stage; kiteboard: continuo/3-stage): curva segmentata con punti di piega netti, diversa dal rocker continuo del surf.
- **Core come proprietà di rigidità** (bodyboard PE/PP/NRG, kiteboard laminato multi-strato): oggi puramente cosmetico, deve alimentare un modello di flex.

### 2.2 Windsurf (fonte: ricerca web — Starboard, Green Water Sports, community windsurf)

Il nostro modello outline+rocker/deck+rail-stazioni copre ~70% del necessario. Feature nuove:

1. **Mast track**: slot scorrevole nel deck (30–50cm), parametri lunghezza/posizione fore-aft/larghezza/profondità/angolo (le tavole race moderne hanno il track inclinato, non sul centerline puro).
2. **Footstrap a inserti multipli discreti** (non scorrevoli come il mast track): tabella posizione per stazione, guidata da preset per disciplina (wave/freestyle = interni verso il centerline; slalom/race = esterni verso il rail).
3. **Daggerboard/centerboard box** (solo tavole longboard/principianti): cutout strutturale grande, con superfici di tenuta stagna — più impegnativo di un fin box.
4. **Famiglia fin box**: US/A-Box (posizione regolabile), Power Box (conico), Tuttle/Deep Tuttle (imbullonato, per pinne race fino a 70cm) — 3-4 profili di cutout parametrici distinti.
5. **Volume come specifica primaria**: le tavole windsurf si specificano per litri target, non lunghezza/spessore. Non esiste una formula standard volume→forma-rail: serve un **calcolatore di volume live agganciato al loft**, esattamente come Shape3D/Akushaper fanno già per il surf — non una formula separata.
6. **Fondo planante**: preset vee/concava selezionabili per stazione, già coperto concettualmente dal nostro modello cross-section.

### 2.3 Canoa e Kayak, singolo e doppio/tandem (fonte: ricerca web — DELFTship, KayakFoundry, Orca3D, boatdesign.net, kastenmarine.com)

**Questo è un salto architetturale, non un'estensione.** Due famiglie di software esistono: a stazioni (KayakFoundry — il più vicino alla nostra pipeline attuale, ma fermo da anni) e NURBS con curve chine/sheerline (DELFTship/Orca3D — pratica navale vera, richiede il check di sviluppabilità sotto).

Curve e parametri che il nostro modello **non ha affatto** oggi:

- **Rocker di prua e di poppa indipendenti** (non una singola curva continua come il surf) — influenzano manovrabilità/tracking in modo asimmetrico.
- **Famiglia sezione trasversale discreta**: flat-bottom / shallow-arch / shallow-V / round-bottom — selettore discreto per stazione, non un continuum come la nostra rail.
- **Sheerline**: curva del bordo superiore/murata in vista di profilo — curva completamente nuova, non esiste equivalente nel nostro modello (rocker e deck gestiscono già top/bottom di profilo, sheerline è il bordo superiore in pianta).
- **Linea di chiglia** (keel line): dritta o con rocker in profilo.
- **Curve di prua/poppa** (stem profiles): plumb / raked / recurved.
- **Waterline length (LWL)** distinta da lunghezza fuori tutto — governa la velocità teorica dello scafo (v ≈ 1.34×√LWL in nodi/piedi), concetto che il surf non ha mai (le tavole planano, non dislocano).
- **Freeboard**: altezza scafo sopra la linea di galleggiamento.
- **Coefficiente prismatico (Cp)**: metrica di distribuzione del volume per scafi a dislocamento, analoga concettualmente al volume in litri del windsurf ma calcolata diversamente.
- **Cutout pozzetto/coaming** (kayak): singolo o doppio, con bordo rialzato per la gonna parasprazzi; KayakFoundry gestisce fino a 3 pozzetti indipendenti o condivisi.
- **Posizionamento gunwale/traverse** (canoa aperta): non una curva lofted, ma un problema di piazzamento vincolato dall'ergonomia del rematore.
- **Vincolo di sviluppabilità** (solo se vogliamo supportare costruzione in compensato stitch-and-glue): ogni pannello tra le chine deve poter essere "srotolato" piatto (curvatura Gaussiana zero), perché il compensato piega in una sola direzione alla volta. Il fiberglass/composito (come quasi tutte le nostre tavole) non ha questo vincolo. **Decisione da prendere**: se limitiamo kayak/canoa a costruzione composita/strip-built, il costo di implementazione è vicino a quello del windsurf (riusa il motore di loft esistente); se vogliamo servire il mercato DIY stitch-and-glue (dove KayakFoundry e Carlson Hull Designer storicamente vivevano, entrambi ora fermi — gap di mercato reale), serve un sottosistema di validazione geometrica a sé.

**Singolo vs tandem**: scafi tandem tipicamente 16-18ft contro 12-15ft del singolo; distanza tra i due pozzetti (con o senza vano stivaggio centrale — cambia se i rematori possono remare fuori sincrono); scelta tra pozzetto unico condiviso (permette a un singolo rematore di centrarsi) o due pozzetti separati (tenuta stagna migliore); range di trim accettabile più ampio per gestire due rematori di peso diverso.

### 2.4 Pinne — sottosistema trasversale — 🟢 implementato

Fonte dimensioni: manuale ufficiale FCS (appropedia.org/FCSManual.pdf), manuale ufficiale Futures (foamez.com/Future_man-1.pdf), retailer spec per US Box/Lokbox, True Ames "Fin Terminology". Vedi `src/renderer/src/core/finTypes.ts` e `finGeometry.ts`.

- 🟢 **Editor outline**: depth/base/rake trascinabili, stessa logica Catmull-Rom del resto dell'app.
- 🟢 **11 template**: T1-T6 (thruster), Q1 (quad rear), K1 (keel), L1/L2 (longboard 8"), TW1 (twin) — dimensioni ispirate a template reali (es. Roam Performance Fin: Height 4.41-4.72", Base 4.29-4.61").
- 🟢 **Foil**: flat / 50-50 / 80-20 / inverted, con distribuzione di spessore NACA 00xx reale (non un placeholder), tapering lungo lo span.
- 🟢 **Attacco**: FCS I (twin plug 19mm, tolleranza 2mm — spec ufficiale), FCS II (fig-8 tool-less, cant preset 0/3/5/9°), Futures (box side 3/4" con 6° di cant integrato nel box stesso, box center 1/2" — spec ufficiale), US Box (canale 1"×1", tang 3/8", spec standardizzata), Lokbox (legacy, approssimato), Glass-on (nessun box).
- 🟢 **Setup multi-pinna**: single/twin/thruster/quad/2+1, con cant/toe realistici di default per slot (i valori side-fin 5-9° di cant, 1/4" toe sono heuristics da shaper, non spec — vedi ricerca).
- 🟢 **Montaggio 3D corretto**: ogni pinna è posizionata secondo distanza-dalla-coda + **inset dal rail** (non più un offset laterale assoluto — vedi bugfix sotto), con cant/toe applicati e verificati numericamente per una divergenza reale delle punte (non convergenza), appesa sotto la rocker line nel punto giusto. Verificato su più template (default, Gun/quad) — le pinne non fluttuano più fuori dallo scafo a nessuna larghezza tavola.
- 🟢 **Editing posizione/orientamento con pinne accoppiate a specchio**: nel pannello "Setup pinne" ogni pinna laterale espone dist.coda/inset-dal-rail/cant/toe editabili; modificarne una aggiorna automaticamente la gemella simmetrica (stesso dist.coda, inset/cant/toe rispecchiati). La pinna singola/centrale resta sempre bloccata sullo stringer (nessun controllo laterale esposto).
- 🟢 **Manipolatore 2D di posizionamento**: nuova vista top-down (`FinPlacementMap.tsx`) nel tab Pinne con marker trascinabili per ogni pinna sopra il contorno reale della tavola — trascinare una pinna laterale sposta anche la gemella, la pinna centrale si muove solo in avanti/indietro (bloccata sullo stringer). Verificato via drag reale nel browser.

**Bugfix critico (segnalato dall'utente con screenshot):** le pinne laterali usavano un offset laterale assoluto (es. 11cm) indipendente dalla reale larghezza del rail in quel punto — su un tail stretto (5-7cm di mezza larghezza) questo le posizionava a metà fuori dallo scafo, "sospese in aria". Inoltre la pinna centrale (trailing) aveva `distFromTail` maggiore delle laterali, cioè era più avanti di loro (invertito rispetto a un setup thruster/quad reale, dove le laterali stanno più avanti e la centrale più vicina alla coda), e il segno del `cant` era invertito e faceva convergere le punte invece di farle divergere (verificato con un calcolo numerico della trasformazione 3D, non solo a occhio). Tutti e tre corretti: `railInset` ora si risolve dalla larghezza reale del rail in quella stazione (`finSlotMountPosition` in `finTypes.ts`), gli ordini `distFromTail` sono stati invertiti, il segno di `cant` è stato corretto.

**Non ancora fatto**:
- 🔴 FCS II slot exact mm (i due thread Swaylocks con le misure esatte danno 403, servirebbe accesso manuale via browser)
- 🔴 Foil IFT/cambered/flat-bev di FCS
- 🔴 Generazione automatica della glassing-fillet per Glass-on
- 🟡 Manipolatore 3D (gizmo trascinabile direttamente nella vista 3D) — solo il manipolatore 2D è implementato per ora; vedi §3.3

**Validazione incrociata (§1.6):** OpenShaper è arrivato a un `FinConfig` parametrico con sistemi di attacco (FCS II, Futures, US box, glass-on) e silhouette tracciate da `.foil` di riferimento — stessa direzione presa da noi, con specifiche ufficiali equivalenti o più dettagliate sul lato box (dimensioni tab). Il nostro montaggio 3D multi-setup (single/twin/thruster/quad/2+1 con cant/toe per slot) è più ricco di quanto trovato in OpenShaper.

### 2.5 Costruzione Hollow Wood Surfboard (HWS) — nuova categoria, non richiesta finora

Trovata in OpenShaper (§1.6) come sottosistema di export completo, non uno stub: genera dallo stesso modello board un piano di costruzione in legno cavo — stringer con incastri a mezzo-legno, N centine trasversali con slot complementari a incastro (egg-crate, profondità che sommano all'altezza interna del telaio), placche nose/tail sviluppate per trigonometria, nesting 2D reale su foglio da taglio e distinta pezzi, esportabile DXF/SVG/PDF. Nessun concorrente (BoardCAD, Shape3D, Akushaper) unifica questo con il motore di shape — se vogliamo differenziarci sulla costruzione hollow-wood è un'estensione naturale del nostro export (§5 Dopo), non richiede un nuovo modello dati.

---

## 3. Strumenti CAD classici mancanti (fonte: wiki.freecad.org — Sketcher, Part Design, Part, Surface workbench)

Oggi la nostra app ha solo: drag di punti di controllo su canvas 2D, e un loft 3D non editabile direttamente. Mancano gli strumenti base di un CAD vero. Elenco derivato dall'inventario reale di FreeCAD, filtrato per rilevanza:

### 3.1 Editing curve 2D (analogo Sketcher workbench)
- 🟡 Bezier a 4 punti trascinabile 🟢 già presente; linea/arco/cerchio/rettangolo/**B-Spline** 🔴 assenti
- 🔴 **Fillet/Chamfer tra due segmenti** (raccordo/smusso) — utile per unire tratti di outline
- 🔴 **Trim / Extend / Split** su una curva
- 🔴 Constraint espliciti: tangente, parallelo, uguale, simmetrico, orizzontale/verticale, distanza/angolo con quota visualizzata
- 🔴 Toggle punto **driving/reference** (quota che pilota la geometria vs quota puramente informativa)

### 3.2 Continuità e vincoli dei punti di controllo (da Shape3D §1.2 + modello preciso da OpenShaper §1.6)
Il nostro `CurveEditor2D` e `CrossSectionEditor` trattavano ogni punto come completamente libero. Shape3D dà il vocabolario (Continuous/Angular/Vertical/Horizontal/Passive + C2), OpenShaper dà un modello implementabile riga-per-riga (porting diretto da `BezierBoard.java`, vedi §1.6) — da reimplementare autonomamente (non copiare, licenza GPL):
- 🟢 **Monotonicità in x (v1 scoped)** — `core/curveConstraints.ts`: i punti interni P1/P2 di outline/rocker/deck sono clampati a restare tra i loro vicini (`P0.x ≤ P1.x ≤ P2.x ≤ P3.x`), applicato live durante il drag in `CurveEditor2D`. Copre il caso pratico più dannoso (curva che si ripiega, geometria non valida) senza richiedere la ristrutturazione a anchor+handle. Verificato in-browser.
- 🔴 **Maschere per-asse sugli endpoint**: un moltiplicatore (0 o 1) per asse sul delta di drag — es. outline endpoints bloccati su entrambi gli assi (non trascinabili), deck/bottom endpoints x-bloccati/y-liberi (restano sulla stessa stazione longitudinale ma l'altezza è editabile). Oggi solo l'asse x degli endpoint è bloccato (non un sistema di maschere generico).
- 🔴 **Tangent-lock a 4 bit per maniglia** (`LOCK_X_MORE`/`LOCK_X_LESS`/`LOCK_Y_MORE`/`LOCK_Y_LESS`): richiede un modello anchor+handle (2 tangenti indipendenti per punto) che il nostro `CurveCP` a 4-punti-liberi non ha — il nostro P1/P2 SONO già le "maniglie" nel senso bezier standard, ma senza un punto-ancora separato non c'è nulla su cui clampare la maniglia in modo relativo.
- 🔴 **Vincolo slave/Fix** (punto agganciato a un altro, endpoint snapati identici + tangenti traslate insieme) — es. deck e bottom condividono lo stesso tip di nose e di tail. Questa è anche la base tecnica per: rail sempre a spessore costante dal bottom, o outline e cross-section che restano coerenti quando si cambia lunghezza.
- 🔴 Checkbox C2 (continuità di curvatura) indipendente dal tipo di tangente; soglia di riconciliazione angolare suggerita: `||π − angolo_prev| − angolo_next| < 0.02 rad` (~1°).
- 🟡 Nota d'implementazione: il v1 monotonicità è stato applicato come clamp **live durante il drag** (dentro `handlePointerMove`), non come pass di ri-snap post-edit come OpenShaper raccomandava — più semplice da innestare nel codice esistente, comportamento identico per l'utente (il punto non supera mai il vicino, in entrambi i casi). Il resto del modello (maschere, tangent-lock, slave) richiederebbe la ristrutturazione a anchor+handle e lì la scelta di OpenShaper (pass post-edit idempotente) resta quella giusta da seguire.

### 3.3 Operazioni 3D (analogo Part / Part Design workbench)
- 🔴 **Estrusione/Pad**: da una sezione 2D a un solido — utile per plugs, inserti, box pinna
- 🔴 **Pocket/taglio**: sottrazione di un solido da un altro — necessario per box pinna, mast track, daggerboard box, cutout pozzetto kayak
- 🔴 **Rivoluzione**: utile per plug pinna simmetrici, tappi
- 🔴 **Boolean union/subtract/intersect** tra solidi — prerequisito diretto per il modulo e-skateboard (§2, enclosure/motor-mount) e per i fin box
- 🔴 **Manipolatore 3D** (gizmo move/rotate/scale) sull'oggetto selezionato in vista 3D — oggi la vista 3D è solo visualizzazione, non si può selezionare/spostare nulla. Per le pinne esiste già un manipolatore **2D** equivalente (drag su vista top-down, §2.4) — il gizmo 3D vero e proprio resta da fare

### 3.4 Misurazione e quotatura
- 🟡 Strumento misura generico (distanza, angolo, raggio) tra due punti/edge selezionati in 2D o 3D — `core/measurements.ts` calcola già misure per stazione (Board Specification panel), ma non è un tool generico interattivo punto-a-punto in 2D/3D
- 🔴 Quote persistenti visualizzate sul disegno (non solo il pannello misure a lato che abbiamo già)

### 3.5 Superfici (analogo Surface workbench — solo se serve qualità NURBS vera)
- 🔴 Loft tra sezioni con continuità scelta (G0/G1/G2) — oggi il nostro loft è una semplice griglia triangolata, non una vera superficie NURBS
- Nota: valutare se serve davvero (three.js non ha un kernel NURBS nativo — richiederebbe integrare OpenCascade.js, per cui `jsketcher-main` resta un riferimento salvato in `3DCAD/`)

---

## 4. Verifica e pulizia cartelle `3DCAD/`

Rivalutazione finale dopo aver estratto tutto il valore utile da ciascun progetto. `SURF-CAD ELECTRON` e `SURF PY_2` esclusi per istruzione esplicita.

| Cartella | Decisione | Motivo |
|---|---|---|
| `Board Cad Content macos` | **Mantenuta** | App BoardCAD compilata e funzionante — utile per confronto visivo diretto durante lo sviluppo, non solo testo estratto |
| `BoardCAD-2026` | **Mantenuta** | Prototipo Python precedente: contiene `exporters.py` (GCodeExporter, PDFExporter) e `calculators.py` (VolumeCalculator) non ancora portati — logica da riusare nella fase "Ora" |
| `boardcad-java-source` | **Rimossa** | Conteneva solo una copia annidata quasi identica di `boardcad-le-master`, nessun contenuto proprio |
| `boardcad-le-master` | **Mantenuta** | Sorgente Java canonico, riferimento per algoritmi specifici (fit Bezier, generazione G-code) oltre alle sole label già estratte |
| `boardcad-le-master 1` | **Rimossa** | Fork Gradle ridondante con lo stesso contenuto core della copia canonica già mantenuta |
| `jsketcher-main` | **Mantenuta** | Riferimento per kernel NURBS (OpenCascade.js) e solver di vincoli 2D — rilevante per §3.2 e §3.5 se si deciderà di integrarlo |
| `BoardCAD_macos_3_0_1.dmg` | **Rimosso** | Installer originale non patchato, ridondante con l'app già estratta e funzionante in `Board Cad Content macos` |
| `FUNZIONALITa e Metodi`, `analyze_projects.py`, `report` | **Rimossi** | Output di un'analisi precedente ormai superata (cita progetti come `SURF PY_1`, `cad3dify-main`, `render 3D Cad` non più presenti) — sostituiti da questo documento |
| `OpenShaper-main` | **Mantenuta** | Rebuild TypeScript moderno di BoardCAD-LE, riferimento principale ora per §1.6: sistema di vincoli sui punti di controllo, algoritmo notch swallow tail, export STL/DXF/PDF, sottosistema HWS. Licenza GPL-3.0 — solo studio/reimplementazione, non copia di codice |
| `OpenShaper-main copy.zip` | **Da rimuovere (proposta, non eseguita)** | Duplicato zippato (3.7MB) della cartella `OpenShaper-main` già estratta — ridondante, nessun contenuto proprio. Non cancellato in questa sessione: azione distruttiva, da confermare con l'utente |
| `Surf-Shaper-master` | **Mantenuta** | Frontend React sottile su Onshape cloud CAD (§1.7) — nessun algoritmo di geometria proprio, ma riferimento per idee UX (comparazione 3 tavole live, slider parametrici) |

---

## 5. Roadmap prioritizzata

**Legenda:** 🟢 completamente implementato · 🟡 implementato parzialmente · 🔴 assente

### Ora — completa il motore esistente
- 🟢 Fins dialog → **fatto**, e ampliato oltre lo scope originale: modulo pinne completo con 11 template, 6 sistemi di attacco con specifiche ufficiali, foil NACA, montaggio 3D multi-setup (vedi §2.4)
- 🟢 Bugfix montaggio pinne + posizionamento/orientamento editabile → **fatto**: corretto il posizionamento assoluto che faceva fluttuare le pinne laterali fuori dallo scafo su rail stretti, invertito l'ordine avanti/indietro pinna centrale↔laterali, corretto il segno del cant che faceva convergere le punte invece di divergere (verificato con calcolo numerico della trasformazione 3D). Aggiunto editing posizione/orientamento con mirroring automatico della pinna gemella e un manipolatore 2D drag-and-drop (`FinPlacementMap.tsx`) — vedi §2.4. Il manipolatore 3D vero e proprio resta 🔴 (§3.3).
- 🟢 Template tavola (Shortboard/Fish/Longboard/Gun/Hybrid) → **fatto**: valori reali portati da `SURF PY_2/templates.py`, curve outline/rocker/deck calibrate a colpire esattamente i valori di spec (vedi `core/boardTemplates.ts`), tail-type e fin-setup assegnati per template
- 🟢 Undo/Redo → **fatto**: history a snapshot dell'intero `BoardState` con coalescenza `beginEdit`/`endEdit` per i gesti di drag, bottoni + scorciatoie Ctrl/Cmd+Z e +Shift+Z (vedi `core/useBoardHistory.ts` e §0) — pattern verificato contro l'architettura reale di OpenShaper §1.6, verificato in-browser (drag di un punto di controllo → un solo Undo lo annulla interamente)
- 🟡 Tab Design grafico (rettangoli/linee, import immagine/SVG/PDF, export PNG/SVG/PDF, deck/bottom condivisi o separati) → **fatto in gran parte**, vedi §6 per il dettaglio completo. Resta 🔴 il rendering come texture reale sulla mesh 3D, il rendering vero delle pagine PDF importate (oggi solo segnaposto), e una maniglia di rotazione dedicata nel canvas.
- 🟢 Sidebar ridimensionabile (drag-handle) e collassabile (◀/▶) → **fatto**, verificato in-browser
- 🟢 Notch reale dello swallow tail nella vista 2D Outline → **fatto**: si è scoperto che una funzione `applyTailToOutline()` in `core/tailShape.ts` esisteva già pronta per questo scopo esatto (commento nel codice: "fine for 2D path drawing") ma non era mai stata collegata a nessuna vista — bastava agganciarla. Aggiunto un `renderOverride` opzionale a `CurveEditor2D` che trasforma i punti campionati prima del disegno senza toccare i punti di controllo trascinabili. **Bonus**: la stessa funzione gestisce anche il taglio netto della coda "square", quindi ora anche quella si vede correttamente in 2D (prima mostrava sempre la punta piena). Verificato in-browser su Fish (swallow, notch a V visibile) e su square (taglio netto visibile).
- 🟡 Export STL / DXF / G-code → **fatto in versione base**, verificato in-browser catturando e ispezionando il contenuto reale dei tre file (non solo che il download parte): STL ASCII (mesh tavola + pinne, scala cm→mm, `core/exportSTL.ts`), **watertight** (cap a ventaglio su naso e coda aggiunti in `meshGenerator.ts`, winding verificato analiticamente per normali corrette in entrambi i cap, non solo "sembra giusto" — 8048 facce, 0 NaN, verificato leggendo il blob reale), DXF R12 `POLYLINE`/`VERTEX` (layer `OUTLINE` + `PROFILE_ROCKER`/`PROFILE_DECK`, `core/exportDXF.ts`), G-code contorno outline singola passata (`G21`/`G90`, plunge/cut/retract, `core/exportGcode.ts`). Gap rispetto a quanto possibile (da §1.6): 🔴 DXF senza cross-section, layer colorati AutoCAD standard, layer `GHOST`, o variante spline; 🔴 G-code solo outline, mancano profile/deck/bottom multi-passata come nel menu G-code completo di BoardCAD.
- 🟡 Sistema di continuità/vincoli dei punti di controllo → **v1 scoped fatta**: `core/curveConstraints.ts`, i punti interni di outline/rocker/deck non superano più in x il loro vicino (curva mai ripiegata), verificato in-browser con un drag reale oltre il vicino. Il modello completo da §3.2 (maschere per-asse, tangent-lock a 4 bit, slave) richiede prima una ristrutturazione di `CurveCP` da 4-punti-liberi ad anchor+handle — non fatto in questa iterazione, resta 🔴 come voce a sé.
- 🟢 Weight calculator → **fatto**: formula da §1.6 (densità schiuma PU/EPS × volume + peso tessuto oz/yd² × area bagnata × fattore rail-wrap × rapporto resina + hardware), dialog dedicato con breakdown, verificato che il calcolo torni esatto a mano — vedi §0.
- 🟢 Tabella numerica stazioni con toggle linea-retta/lungo-stringer → **fatta**: `BoardSpecPanel` ora ha il toggle, `measurements.ts` calcola la posizione via arc-length sul rocker per il modo stringer, aggiunta anche l'Area piano — vedi §0. Non ha ancora colonne configurabili come Shape3D (dettaglio minore, non un gap separato).
- 🟢 Interpolazione tra cross-section con conteggi di punti diversi → **fix fatto**: `interpolateStationPoints` ricampiona con `catmullRomSample` invece di troncare con `Math.min` — vedi §0.
← **prossimo in coda: Sistema di continuità completo (anchor+handle) e Ghost board**

### Prossimo — colma il gap con Akushaper/Shape3D
- 🔴 **Guide points + immagine di sfondo da ricalcare (trace-image)** — **promosso qui dal blocco sotto**: workflow standard del settore per digitalizzare una tavola da foto/scan, confermato "da prioritizzare" dall'analisi di OpenShaper (§1.6), che lo ha implementato per davvero (non uno stub): immagine di riferimento per vista con opacità/mirror, calibrazione a 4 click o lunghezza tipizzata (pixel→cm), più un fit least-squares di bezier cubica ai punti digitalizzati (`bestFit`, chord-length parametrizzato) — algoritmo riutilizzabile anche per "Fit curve to guidepoints" di BoardCAD (§1.1)
- 🔴 Ghost board con confronto quantitativo (delta volume per sezione) — esiste solo un ghost overlay delle altre stazioni della stessa tavola in `CrossSectionEditor`, non un confronto tra due tavole. Ora ben specificato da §1.6: overlay 2D di una seconda tavola + diff delle spec derivate + layer DXF dedicato tratteggiato + colore configurabile. Idea alternativa da Surf-Shaper §1.7: comparazione live di N tavole affiancate in 3D invece di un overlay.
- 🔴 Volume Wizard (risolve una dimensione dato un volume target) — **confermato greenfield**: non esiste in OpenShaper (solo una tabella statica età→litri, non un solver) né in Surf-Shaper. Nessun riferimento da studiare, va progettato da zero.
- 🔴 Scheda spec/ordine PDF — da §1.6: separare in due esportatori distinti come fanno loro, uno stampa-1:1 a tassellatura multi-pagina (ricalco su schiuma) e uno spec-sheet non in scala (tabella dimensioni + disegno piano/rocker/sezione)
- 🔴 Sistema di continuità completo (anchor+handle, maschere per-asse, tangent-lock a 4 bit, slave/Fix, C2) — vedi §3.2; il v1 scoped (solo monotonicità in x) è già fatto in Ora
- 🟡 Strumenti CAD base: fillet/chamfer tra segmenti 🔴, trim/extend 🔴, manipolatore 3D 🔴, misura generica 🟡 (calcolo misure per stazione già presente in `measurements.ts`/`BoardSpecPanel`, ma non come tool interattivo punto-a-punto) — §3.1, §3.3, §3.4. **Confermato territorio inesplorato**: nessuno di questi esiste nemmeno in OpenShaper (editing lì è tutto su spline 2D, non su mesh 3D con transform) — bassa priorità relativa, non è un gap competitivo urgente

### Dopo — espansione di categoria e architettura
- 🔴 Stack di curve nominate con vincoli (riscrittura del modello dati — sblocca rail asimmetriche, deck multipli)
- 🔴 Modalità Bodyboard (canali + rail 60/40)
- 🔴 Modalità SUP (hull planing/displacement, deck stance)
- 🔴 Modalità Windsurf (mast track, footstrap a griglia, fin box family, volume-first)
- 🔴 Modalità Skateboard (concave/kick/truck-holes, riferimento diretto: SK8CAD)
- 🔴 Griglia inserti condivisa (footstrap kiteboard / binding wakeboard) + outline a specchio
- 🟢 Sottosistema pinne condiviso multi-tavola (§2.4) — implementato per il surf, riutilizzabile così com'è per le altre tipologie; validato contro il `FinConfig` di OpenShaper (§1.6), il nostro è già più ricco sul lato montaggio multi-setup
- 🔴 Operazioni booleane solide (estrusione/pocket/union) — prerequisito per fin box, mast track box, e per il modulo e-skateboard
- 🔴 Modulo E-skateboard (enclosure, motor mount, zone di flex) — nessun concorrente lo ha unificato, differenziazione reale
- 🔴 Modalità Canoa/Kayak, composita (rocker prua/poppa separati, sheerline, keel line, stem, LWL/Cp, pozzetto) — senza vincolo di sviluppabilità
- 🔴 Decisione + eventuale sottosistema di sviluppabilità superfici per Canoa/Kayak in compensato (stitch-and-glue) — gap di mercato reale (KayakFoundry e Carlson Hull Designer entrambi fermi) ma costo implementativo alto
- 🔴 **Sottosistema di costruzione Hollow Wood Surfboard (HWS)** — nuova categoria da §2.5, trovata in OpenShaper come pipeline di manifattura completa (stringer+centine egg-crate+nesting 2D+distinta taglio+export DXF/SVG/PDF), nessun concorrente unifica questo col motore di shape — differenziazione reale se vogliamo servire il mercato hollow-wood
- 🔴 Import `.brd`/`.s3d`/`.srf` — quando affrontato, adottare il pattern **import-warning** da §1.6: riparazioni cosmetiche → banner dismissibile non bloccante; riparazioni con perdita di geometria → modale di conferma Annulla/Importa comunque. Attenzione alle vulnerabilità note sui parser XML (XXE) documentate nell'assessment BoardCAD-LE che OpenShaper stesso cita (§1.6) — disabilitare risoluzione entità esterne se si parserizza `.s3d`/`.s3dx` (XML)

---

## 6. Design grafico — tab "🎨 Design" — 🟡 implementato parzialmente

Feature non presente in nessuno dei software di riferimento studiati (BoardCAD, Shape3D/Akushaper, OpenShaper) sotto questa forma — decal/grafica applicata a deck/bottom non è un concetto che i CAD di shaping tradizionali coprono (loro si fermano alla geometria); più vicino a un tool di editing grafico 2D dedicato. Vedi `core/design.ts`, `components/DesignEditor.tsx`.

**Modello dati:** `BoardState.design` = `{ linkSurfaces, deck: DesignLayer[], bottom: DesignLayer[] }`. Ogni `DesignLayer` (rect/line/image/pdf) ha posizione/dimensione/rotazione in coordinate cm di piano tavola (stesse coordinate dell'outline), così resta coerente se la tavola cambia lunghezza/larghezza. `linkSurfaces` = true fa condividere lo stesso set di livelli tra deck e bottom (un solo design per entrambi i lati); altrimenti sono due set indipendenti.

- 🟢 **Disegno primitive**: rettangolo (pieno o solo contorno, colore/spessore editabili) e linea, con drag-to-move e drag-to-resize (maniglia sull'angolo) verificati nel browser con eventi pointer reali.
- 🟢 **Import immagine/SVG**: file scelto dall'utente → letto come data URL → livello posizionato al centro tavola, scalato per stare in una dimensione ragionevole, poi liberamente spostabile/ridimensionabile/ruotabile (rotazione solo via campo numerico, senza maniglia dedicata).
- 🟡 **Import PDF**: il file viene accettato e salvato (data URL), ma mostrato solo come segnaposto (icona + nome file) — non c'è ancora un rendering reale della pagina PDF (richiederebbe integrare pdf.js, non fatto in questa iterazione per contenere lo scope).
- 🟢 **Design condiviso o separato top/bottom**: toggle Top(Deck)/Bottom + checkbox "stesso design su top e bottom" — verificato che passare a "condiviso" mostra davvero lo stesso layer su entrambe le superfici.
- 🟢 **Export PNG**: canvas pulito (senza guide/selezione) renderizzato a risoluzione fissa (8px/cm) ed esportato come blob scaricabile.
- 🟢 **Export SVG**: XML vettoriale vero costruito a mano (rect/line/image nativi con trasformazioni), non un raster — riapribile/editabile in altri tool vettoriali.
- 🟢 **Export PDF**: via libreria `jspdf` (nuova dipendenza, MIT, aggiunta a `package.json`), pagina dimensionata esattamente su lunghezza/larghezza tavola in cm, contenuto incorporato come immagine raster (garantisce fedeltà visiva 1:1 con l'editor, incluse le rotazioni — non instrada rect/line come vettori PDF nativi).

**Non ancora fatto**:
- 🔴 Rendering del design come texture reale sulla mesh 3D (oggi il design esiste solo nell'editor 2D dedicato, non si vede ancora "stampato" sulla tavola nella vista 3D) — richiederebbe generare UV mapping per le facce deck/bottom nel `meshGenerator.ts` (oggi la mesh è un'unica superficie senza split deck/bottom con materiali separati) e applicare il canvas del design come texture — lavoro non banale, non incluso in questa iterazione
- 🔴 Rendering reale delle pagine PDF importate (serve pdf.js) — oggi solo segnaposto
- 🔴 Maniglia di rotazione dedicata nel canvas (oggi la rotazione si imposta solo via campo numerico, non trascinando)
- 🔴 Multi-selezione, allineamento/distribuzione, livelli con z-order riordinabile via drag
- 🔴 Pattern/texture ripetute (es. motivo a righe/scaglie ripetuto su tutta la superficie, diverso da un singolo livello immagine)

---

## Fonti principali

- Sorgente locale: `boardcad-le-master/src/boardcad/i18n/LanguageResource_en_US.properties`
- Sorgente locale: `SURF PY_2/templates.py`, `design_logic.py`, `geometry.py`, `presets.py`
- akushaper.com/software · shape3d.com (User Manual V9, CNC Option, Design Pro)
- forum.swaylocks.com — thread "I build an AI-assisted surfboard CAD design website" (84257) e thread di build successivo (84429)
- forum.freecad.org (thread 35513) · wiki.freecad.org (Sketcher/PartDesign/Part/Surface workbench) · github.com/tomate44/CurvesWB
- sk8cad.com · electric-skateboard.builders · esk8.news
- inflatableboarder.com · thekitespot.com · news.lakemonster.com · ebodyboarding.com · bodyboard-depot.com
- greenwatersports.com · windsurf.star-board.com · surf-magazin.de
- delftship.net · blueheronkayaks.com (KayakFoundry) · orca3d.com · kastenmarine.com · boatdesign.net · forum.woodenboat.com
- Sorgente locale: `3DCAD/OpenShaper-main` (letto integralmente — `docs/specs/*.md`, `docs/superpowers/*.md`, codice `packages/*` e `apps/*`). **Licenza GPL-3.0-or-later — reimplementare autonomamente, non copiare codice.**
- Sorgente locale: `3DCAD/Surf-Shaper-master` (letto integralmente — frontend React sottile su Onshape cloud CAD, nessun algoritmo di geometria proprio)
