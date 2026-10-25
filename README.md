# Ben's Bike Trip 🏍️

A mobile-first, landscape motorcycle-stunt web game inspired by the *feel* of classic arcade road-trip games, with original art and gameplay code.

## First playable build
- Auto-accelerating bike with two-wheel suspension, hills, aerial rotation, flips, crashes, and boost.
- Collect coins to unlock bikes in the garage, including **Lil' Squeak**, a tiny bike.
- Local save data tracks coins, owned bikes, and personal best.
- iPhone-friendly hold controls, desktop WASD/arrow-key controls, and optional boost.
- Installable progressive web app with a simple offline cache.

## Controls
| Action | iPhone (landscape) | Desktop |
|---|---|---|
| Lean backward | Left touch button | A / ← |
| Lean forward | Right touch button | D / → |
| Boost | Center boost button | Space / ↑ |
| Pause | Pause button | Escape |

Acceleration is automatic.

## Development
Requires Node.js 22+.
```sh
npm install
npm run dev
```
`npm run build` typechecks and builds a `dist` folder.

## GitHub Pages
1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **GitHub Actions**, **not Deploy from a branch**.
3. Pushes to `main` automatically run `.github/workflows/deploy.yml` and publish to [focustap.github.io/BensBikeTrip/](https://focustap.github.io/BensBikeTrip/).

The Vite `base` is set to `/BensBikeTrip/`, since GitHub Pages serves this project from that subpath. If renaming the repository, update `vite.config.ts`, `manifest.webmanifest`, and `public/sw.js`.

## Roadmap
Add generated run variety, better stunts and landing feedback, bike upgrades, missions, sound effects, and tighter device testing. Physics and controls are an **early prototype** and will need tuning on real iPhones.
