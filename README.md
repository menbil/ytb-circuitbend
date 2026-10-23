# ⚡ CIRCUIT//BEND — Studio Hardware Audio & Vidéo Vaporwave & Glitch

Studio complet de **Circuit Bending, Tape Deck Decay & Vaporwave en temps réel** pour flux YouTube et playlists, combinant un pipeline graphique GPU sous **Three.js / React Three Fiber (Shaders GLSL customisés)**, un moteur de synthèse et distorsion analogique **Web Audio API** natif, et un backend relais **Node.js + `yt-dlp`**.

---

## 🎛️ Nouvelle Disposition & Ergonomie du Studio

- **Grand Écran Vidéo Immersif :** priorité visuelle centrale, aspect 16:9 haute fidélité.
- **Contrôle Direct au Clic :** un simple clic sur la vidéo met en pause ou relance la lecture immédiatement.
- **Dock de Contrôles en Bas (Zero Scroll) :** tous les potentiomètres organisés par onglets rapides accessibles sous les yeux sans défilement de page.
- **Playlist Latérale Flottante (Drawer) :** s'ouvre d'un clic via le bouton d'en-tête `PLAYLIST (N)` sans masquer l'écran vidéo. Les nouvelles vidéos YouTube ajoutées sont conservées dans la file d'attente et sélectionnées automatiquement.

---

## 📼 Nouveaux Modules DSP Audio (Vaporwave & Tape Detune)

1. **Moteur de Vitesse & Détunage Analogique (Tape Speed) :**
   - Contrôle direct du `playbackRate` (de 0.5x à 1.1x).
   - `preservesPitch = false` : la baisse de vitesse entraîne une chute physique proportionnelle du pitch (effondrement de la fréquence vers les infra-basses style *Chopped & Screwed*).
2. **Dual-LFO Wow & Flutter (Instabilité mécanique du cabestan) :**
   - *Wow* (0.5 Hz - 2.5 Hz) : modulation sinusoïdale lente simulant un galet presseur déformé.
   - *Flutter* (5 Hz - 15 Hz) : micro-vibration rapide avec drift aléatoire.
3. **Convolution Reverb "Abandoned Mall" (Mallsoft) :**
   - Réverbération synthétique diffuse longue (3.2s) simulant un centre commercial abandonné des années 80 ou un hall cathédrale.
4. **Tape Tone (Réponse Ferrique Type I) :**
   - Head bump à 90 Hz (+5.5 dB) et atténuation progressive des hautes fréquences au-dessus de 10-12 kHz.
5. **Tape Hiss Generator :**
   - Générateur de bruit rose/brun analogique filtré en bande passante.
6. **Bouton Momentané "Tape Stop" :**
   - Décélération exponentielle du son et de l'image simulant l'extinction du moteur de la cassette puis redémarrage progressif.

---

## 📺 Nouveaux Shaders GLSL (CRT, VHS & Vaporwave)

- **Bombement Cathodique (CRT Curvature) :** déformation sphérique en barillet du tube cathodique avec coins arrondis et bordures d'extinction.
- **Étalonnage Vaporwave & NTSC :** décalage des teintes vers les pastels fuchsia (#FF71CE) et cyan néon (#01CDFE), avec lift des ombres (noirs délavés de bande usée).
- **Aperture Grille (Masque de phosphore) :** micro-grille alternée de sous-pixels RVB microscopiques.
- **VHS Head Switching Noise :** bruit parasite caractéristique de la commutation des têtes hélicoïdales en bas de l'image.
- **V-Hold Drift :** défilement vertical et perte de synchronisation de trame.

---

## 🚀 Démarrage

```bash
npm run dev
```

- **Interface Studio :** [http://localhost:5173](http://localhost:5173)
- **Backend Relais :** [http://localhost:3001](http://localhost:3001)
