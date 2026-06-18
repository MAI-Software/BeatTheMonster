# Monsters Boxing Hero

JRPG rhythm-sparring brawler with **camera motion combat**. Move your body so your
head follows a ball orbiting a circle, and throw left/right punches on the beat.
Perfect streaks build **Super Combos**; equipped **Flow States** (Invuln, "Ora Ora
Ora", ...) trigger on conditions. Campaign episodes, training, gacha (fragments,
no microtransactions), daily/weekly challenges, achievements, local ranking.

## Stack
Vite + TypeScript, canvas + DOM HUD, WebAudio SFX, MediaPipe Pose (camera), Capacitor (APK).

## Run (web)
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/  (Netlify publish dir)
```
Camera needs a secure context (localhost or HTTPS). On HTTPS (e.g. Netlify) the
phone browser can use the camera directly — no install needed.

## Android APK
```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
```

## Controls
- **Camera**: head follows the ball, fists = punches (left/right half = L/R).
- **Keyboard fallback**: A = left punch, D = right punch, mouse = head.
