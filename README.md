# ⚡ CIRCUIT//BEND — Studio Audio & Vidéo Analogique, Glitch & Vaporwave

Studio temps réel de **Circuit Bending, VHS / CRT Decay, Datamosh Temporel & Synthèse Audio Analogique** dans le navigateur.  
Il combine un pipeline graphique GPU sous **Three.js / React Three Fiber (Shaders GLSL multi-passes & Ping-Pong RenderTargets)**, un moteur DSP **Web Audio API** natif, une **Matrice de Modulation par Glisser-Déposer**, le support matériel **Web MIDI (Novation Launch Control / XL)** et un serveur relais **Node.js + `yt-dlp`**.

---

## 🚀 Installation & Démarrage

### Prérequis
- **Node.js** (v18+)
- **Yarn** (`yarn@1.22+`) ou `npm`
- **`yt-dlp`** (installé sur le système ou dans le `PATH` pour l'extraction de flux et playlists YouTube)
- **`ffmpeg`** *(optionnel, utilisé par le backend pour convertir les captures WebM en MP4 matériel)*

### Installation des dépendances
```bash
yarn install
```

### Lancer le studio en mode développement (Frontend + Backend)
```bash
yarn dev
```
- **Interface Studio (Vite) :** `http://localhost:5173`
- **Serveur Relais API (Express) :** `http://localhost:3001`

---

## 🎛️ Fonctionnalités & Guide d'Utilisation

### 1. Sources Vidéo & Audio Live (Barre supérieure & Drag & Drop)
- **`YT STREAM` + `PLAYLIST (N)`** : Colle n'importe quelle URL de vidéo ou de playlist YouTube pour la router directement dans les shaders WebGL et le moteur Web Audio.
- **`WEBCAM`** : Route le flux de votre caméra en direct dans le moteur VHS / CRT / Datamosh.
- **`SCREEN`** : Capture une fenêtre, un onglet ou votre écran complet en temps réel.
- **`MEDIA` (ou Glisser-Déposer plein écran)** : Glissez-déposez directement un fichier vidéo (`.mp4`, `.webm`, `.mov`), audio (`.mp3`, `.wav`, `.ogg`) ou un preset (`.json`) n'importe où sur l'écran pour le charger instantanément.

---

### 2. Ergonomie des Commandes & Modes d'Affichage
- **Glisser verticalement** sur un contrôle rotatif pour modifier sa valeur.
- **`Shift` + Glisser** : Mode haute précision (**5x plus fin**).
- **Molette de la souris** : Incrémente / décrémente finement le contrôle survolé.
- **Double-clic sur un contrôle** : Réinitialise immédiatement le paramètre à sa valeur neutre d'usine.
- **Mode `◐ GLASS` / `◉ X-RAY`** :
  - **`GLASS` (par défaut)** : Rack translucide avec flou optique permettant de voir la vidéo en arrière-plan.
  - **`X-RAY`** : Fond ultra-transparent et inversion chromatique négative de la vidéo sous le panneau.
- *Note : Lorsque le panneau principal est déployé, la barre de timeline en arrière-plan se masque automatiquement pour éviter toute superposition.*

---

### 3. Matrice de Modulation par Glisser-Déposer (`MOD MATRIX`)
Située en haut de la matrice, elle propose **5 sources de modulation** que vous pouvez **glisser-déposer directement sur n'importe quel contrôle Vidéo ou Audio** :
- **`∿ LFO 1` (Violet)** : Oscillateur basse fréquence principal avec éditeur de courbe multi-segments (**MSEG**) indépendant.
- **`∿ LFO 2` (Cyan)** : Second oscillateur basse fréquence totalement indépendant (propre courbe MSEG, propre vitesse et propre division rythmique).
- **`⚡ ENV AUDIO` (Vert)** : Suiveur d'enveloppe audio temps réel calibré sur les **basses et kicks (35 Hz – 180 Hz)** avec normalisation automatique (*Auto-Gain*). Idéal à glisser sur `DATAMOSH MELT`, `RGB SHIFT` ou `FILTER CUTOFF` pour faire réagir l'image au rythme.
- **`✥ MACRO X` & `✥ MACRO Y` (Ambre / Rose)** : Pilotés en direct par la position horizontale et verticale du **Vector Pad X/Y**.

#### Éditeur de Courbes MSEG & Réglages d'Assignation
- **Éditer la courbe (`LFO 1` ou `LFO 2`)** :
  - **Glisser un nœud** pour sculpter la forme d'onde en temps réel.
  - **Double-clic sur la grille** : Ajouter un nouveau nœud.
  - **Clic-droit sur un nœud** : Supprimer le nœud.
- **Synchronisation BPM & `TAP` Tempo** :
  - Cliquez en rythme sur **`TAP`** (ou appuyez sur la touche **`B`**) ou saisissez le **`BPM`** : `LFO 1` (`1/4`) et `LFO 2` (`1/2`) se synchronisent automatiquement au tempo.
  - Vous pouvez aussi choisir manuellement une division (`FREE`, `1/1`, `1/2`, `1/4`, `1/8`, `1/16`) indépendamment pour `LFO 1` et `LFO 2`.
- **Ajuster ou supprimer une modulation sur un contrôle** :
  - **Glisser verticalement le badge coloré** sous le contrôle pour doser la profondeur de modulation (`-100%` à `+100%`).
  - **Cliquer sur le badge** (ou clic-droit) pour supprimer la connexion.
  - L'onglet **`ROUTES (N)`** récapitule toutes les connexions actives avec bascule **Unipolaire (`UNI +`) / Bipolaire (`BIP ±`)**.

---

### 4. Vector Pad X/Y 2D & Enregistreur de Mouvement (`● REC` / `▶ LOOP`)
- **Surface 2D** : Pilote simultanément `MACRO X` et `MACRO Y` (ou, par défaut sans assignation manuelle, le Glitch/RGB Shift sur X et le Filtre/Datamosh sur Y).
- **`○ SPRING` / `● HOLD`** :
  - `SPRING` : Le curseur revient automatiquement au centre (`50% / 50%`) dès que vous relâchez la souris.
  - `HOLD` : Le curseur reste verrouillé à l'endroit où vous le lâchez.
- **Motion Looper (`● REC` → `● ARM` → `▶ LOOP`)** :
  1. Cliquez sur **`● REC`** (le bouton passe en **`● ARM`**).
  2. Cliquez et dessinez un mouvement sur le Pad X/Y : la trajectoire se trace sur la grille.
  3. Relâchez la souris : le bouton passe en **`▶ LOOP`** et rejoue votre mouvement en boucle infinie à 60 FPS.
  4. Cliquez sur **`▶ LOOP`** ou sur **`↺`** pour arrêter et effacer la boucle.

---

### 5. Crossfader de Morphing A ↔ B
- Permet d'interpoler en douceur tous les paramètres Vidéo et Audio entre un **Preset A** et un **Preset B**.
- Vous pouvez choisir les presets via les deux menus déroulants **ou glisser-déposer directement n'importe quel bouton de preset du haut vers le Slot A ou le Slot B**.

---

### 6. Effets Vidéo & Shaders GLSL (`16 Contrôles`)
1. **`CRT CURVATURE`** : Bombement sphérique du tube cathodique et vignettage des coins.
2. **`VAPORWAVE TINT`** : Étalonnage analogique magenta / cyan néon et noirs délavés.
3. **`LUMINANCE`** : Contraste et solarisation analogique des hautes lumières.
4. **`PHOSPHOR MASK`** : Masque d'ombre RVB / grille Trinitron.
5. **`CHROMA SMEAR`** : Bavage horizontal de la sous-porteuse couleur NTSC.
6. **`HEAD SWITCHING`** : Bruit de commutation des têtes magnétiques VHS en bas de l'image.
7. **`V-HOLD DRIFT`** : Perte de synchronisation verticale et défilement de trame.
8. **`DATAMOSH MELT`** : Vrai **Datamosh temporel** par flux optique (*Lucas-Kanade multi-échelles* + buffer Ping-Pong). À `0.00`, l'effet est 100 % désactivé ; dès qu'on le monte, les mouvements de la vidéo étirent et font fondre les pixels des trames précédentes.
9. **`H-SYNC LOSS`** : Déchirure horizontale des lignes de balayage.
10. **`RGB SHIFT`** : Séparation physique des canaux Rouge / Vert / Bleu.
11. **`SCANLINES`** : Lignes de balayage cathodiques entrelacées.
12. **`COLOR BLEED`** : Déphasage chromatique VHS.
13. **`CAP. FEEDBACK`** : Persistance rétinienne du phosphore et traînées fantômes.
14. **`RF NOISE`** : Neige radiofréquence d'antenne analogique.
15. **`3D RELIEF`** : Extrusion topographique 3D du maillage selon la luminance.
16. **`SIDECHAIN KICK`** : Réactivité directe des shaders aux impacts de basses.

---

### 7. Effets Audio & Tape DSP (`16 Contrôles`)
1. **`TAPE SPEED`** : Vitesse du cabestan (`0.5x` à `1.1x`) couplée physiquement à la hauteur (`PITCH`) ou découplée.
2. **`WOW RATE` & `WOW DEPTH`** : Pleurage lent d'excentricité du galet presseur.
3. **`FLUTTER RATE` & `FLUTTER DEPTH`** : Scintillement mécanique rapide de la tête de lecture.
4. **`TAPE TONE`** : Bosse grave ferrique (90 Hz) et atténuation progressive des aigus.
5. **`TAPE HISS`** : Souffle continu de bande magnétique Type I.
6. **`MICRO DROPOUTS`** : Micro-coupures aléatoires d'oxyde usé.
7. **`STUTTER SPEED`** : Vitesse de découpage de la boucle lors d'un `TAPE STOP // FREEZE`.
8. **`BITCRUSHER`** : Réduction de résolution binaire et décimation Lo-Fi.
9. **`TAPE DRIVE`** : Saturation harmonique asymétrique à bande.
10. **`RING MOD MIX` & `RING FREQ`** : Modulateur en anneau analogique (`30 Hz` – `1200 Hz`) pour timbres métalliques et robotiques.
11. **`FILTER CUTOFF`, `FILTER RES` & `TYPE (LP / HP / BP)`** : Filtre multimode résonant.
12. **`TAPE DELAY` & `MALL REVERB`** : Écho à bande et réverbération *Abandoned Mall*.

---

### 8. OSD Caméscope VHS 1994 Éditable (`VCR OSD`)
- Cliquez sur **`VCR OSD`** en haut à droite de l'écran (ou touche **`V`**) pour afficher l'interface verte de caméscope VHS 1994 (et masquer automatiquement les pastilles HUD modernes en doublon).
- **Texte personnalisable au clic** : Cliquez directement sur **`CH 03 // NTSC-M`**, sur le **titre en bas à gauche**, sur la **date (`OCT 27 1994`)** ou sur l'**heure (`PM 11:42`)** pour taper votre propre texte VHS (double-cliquez sur le titre pour restaurer le titre automatique).

---

### 9. Capture Photo (`SNAP`), Enregistrement Vidéo (`REC`) & Partage URL (`SHARE PATCH`)
- **`SNAP` (ou touche `S`)** : Capture instantanément une image `.png` haute résolution du rendu WebGL.
- **`REC`** : Enregistre le flux vidéo (30 FPS verrouillés) et la sortie audio traitée en `.mp4` / `.webm` (encodage matériel H.264 / VP8 sans saccades).
- **`SHARE PATCH`** : Génère et copie dans le presse-papiers un lien unique (`?patch=...`) contenant l'intégralité de vos réglages Vidéo, Audio, LFO et routages de modulation.

---

## ⌨️ Raccourcis Clavier Live & « Punch-In FX »

| Touche | Action |
| :--- | :--- |
| **`Espace`** | Lecture / Pause du flux vidéo & audio |
| **`T`** ou **`F`** | **Tape Stop // Buffer Freeze** (arrêt progressif du moteur de bande & gel granulaire) |
| **`B`** | **Tap Tempo** (tapez en rythme pour caler le BPM et synchroniser `LFO 1` & `LFO 2`) |
| **`D` (Maintenir)** | 💥 **Punch-In FX : Datamosh Melt** (fusion datamosh intense tant que `D` est maintenue, retour normal au relâchement) |
| **`X` (Maintenir)** | ⚡ **Punch-In FX : H-Sync Glitch** (décrochage VHS & décalage RGB momentané tant que `X` est maintenue) |
| **`C` (Maintenir)** | 🔊 **Punch-In FX : Bitcrush + Ring Mod** (destruction audio/couleur momentanée tant que `C` est maintenue) |
| **`R`** | **Randomize** (génère un patch complet aléatoire Vidéo + Audio + LFO + Modulations) |
| **`L`** | Activer / Désactiver le moteur de modulation LFO |
| **`V`** | Afficher / Masquer l'overlay **VCR OSD 1994** |
| **`S`** | **Snapshot** photo instantané (`.png`) |
| **`Z`** | Basculer en **Mode Zen** (masque toute l'interface pour profiter du plein écran) |
| **`1` à `5`** | Charger directement les Presets d'usine 1 à 5 (`1` = *Direct Bypass / Clean*) |
| **`Échap`** | Quitter le Mode Zen / Fermer les tiroirs |

---

## 🎚️ Mapping Matériel Web MIDI — Novation Launch Control

Le studio détecte automatiquement votre **Novation Launch Control** (ou **Launch Control XL**) via Web MIDI. En cliquant sur le bouton **`MIDI`**, une **vue matérielle interactive** reproduit vos 16 contrôles rotatifs, vos 8 pads et vos 4 boutons fléchés pour visualiser ou modifier chaque assignation d'un clic.

### Rangée du Haut (`K1` à `K8` — `CC 21` à `CC 28`) : Vidéo & Datamosh
| Contrôle | CC | Paramètre assigné |
| :--- | :---: | :--- |
| **K1** | `CC 21` | **H-Sync Loss / Glitch** (`video.glitchIntensity`) |
| **K2** | `CC 22` | **RGB Channel Shift** (`video.rgbShift`) |
| **K3** | `CC 23` | **Datamosh Melt Temporel** (`video.datamosh`) |
| **K4** | `CC 24` | **Capacitive Feedback** (`video.feedback`) |
| **K5** | `CC 25` | **VHS Color Bleed** (`video.colorBleed`) |
| **K6** | `CC 26` | **Vaporwave Tint** (`video.vaporwaveTint`) |
| **K7** | `CC 27` | **CRT Scanlines** (`video.scanlines`) |
| **K8** | `CC 28` | **CRT Tube Curvature** (`video.crtCurvature`) |

### Rangée du Bas (`K9` à `K16` — `CC 41` à `CC 48`) : Audio & Crossfader Morph A/B
| Contrôle | CC | Paramètre assigné |
| :--- | :---: | :--- |
| **K9** | `CC 41` | **Tape Saturation Drive** (`audio.drive`) |
| **K10** | `CC 42` | **Bitcrusher Lo-Fi** (`audio.bitcrush`) |
| **K11** | `CC 43` | **Filter Cutoff (80 Hz – 18 kHz)** (`audio.filterCutoff`) |
| **K12** | `CC 44` | **Filter Resonance (Q)** (`audio.filterResonance`) |
| **K13** | `CC 45` | **Tape Speed & Pitch (0.5x – 1.1x)** (`audio.tapeSpeed`) |
| **K14** | `CC 46` | **Wow & Flutter Detune** (`audio.wowDepth`) |
| **K15** | `CC 47` | **Abandoned Mall Reverb** (`audio.reverbWet`) |
| **K16** | `CC 48` | **Crossfader Morphing A ↔ B** (`mod.morphAB`) |

### Les 8 Pads (`PAD 1` à `PAD 8` — Notes Factory `9–12 / 25–28`, User `36–43`, `CC 73–80`)
| Pad | Action déclenchée |
| :--- | :--- |
| **PAD 1** | **Play / Pause** (`action.playToggle`) |
| **PAD 2** | **Tape Stop // Buffer Freeze** (`action.tapeFreeze`) |
| **PAD 3** | **Randomize Chaos Patch** (`action.randomize`) |
| **PAD 4** | **Reset Clean // Bypass All FX** (`action.resetClean`) |
| **PAD 5** | **Capture Photo Snapshot PNG** (`action.snapshot`) |
| **PAD 6** | **Enregistrement Vidéo Session MP4** (`action.recordToggle`) |
| **PAD 7** | **Preset : 1984 Abandoned Mall** (`action.preset1`) |
| **PAD 8** | **Preset : Damaged VHS Tape** (`action.preset2`) |

### Les 4 Boutons Fléchés à droite (`▲ ▼ ◄ ►` — `CC 114` à `CC 117`)
| Bouton | CC | Action déclenchée |
| :--- | :---: | :--- |
| **▲ Haut** | `CC 114` | **Tap Tempo BPM Sync** (`action.tapTempo`) |
| **▼ Bas** | `CC 115` | **Activer / Désactiver Moteur LFO** (`action.lfoToggle`) |
| **◄ Gauche** | `CC 116` | **Vidéo Précédente de la Playlist** (`action.prevTrack`) |
| **► Droite** | `CC 117` | **Vidéo Suivante de la Playlist** (`action.nextTrack`) |
