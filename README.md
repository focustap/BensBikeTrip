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
| Slam downward | Hold both tilt buttons | A + D / ← + → / S / ↓ |
| Boost | Center boost button | W / Space / ↑ |
| Pause | Pause button | Escape |

Acceleration is automatic and runs start at cruising speed. Land flips, sustained wheelies/stoppies, big air, and slams to earn automatic **overboost**. It raises the engine speed target to 165% of cruise and can be chained up to eight seconds. The separate manual boost button remains available. Hold both tilt buttons to slam; releasing either returns to that side's normal tilt. Game text and control labels disable selection and Safari's long-press copy callout.

Coins are individual, rare pickups spaced roughly 1,550 pixels apart, worth one coin each with a close pickup radius. Stunts pay in overboost rather than coins. The distance reward is one coin per 1,000 meters. Existing saves, garage prices, and owned bikes remain intact.

## Development
Requires Node.js 24+.
```sh
npm ci
npm run dev
```
`npm run build` typechecks and builds a `dist` folder.

## Motorcycle physics
The motorcycle uses Planck (Box2D): a compound chassis/rider body and two physical circle tires connected by wheel joints. Suspension runs at 5.5 Hz with a 0.9 damping ratio; tires use friction and zero restitution. A rear-wheel motor supplies acceleration and boost through tire traction. The rider's helmet, torso, arms, legs, and handlebar fixtures share geometry with the canvas artwork. The rendered wheels follow their independent suspension positions and rotations.

The simulation uses meters internally (40 canvas pixels per meter), gravity of 20 m/s², and a fixed 120 Hz timestep with interpolated rendering for 60 FPS displays. The starter bike begins at 800 pixels/second rather than accelerating from a crawl. Broader hills and longer downslopes provide natural airtime. Left/right applies torque, with ground torque reduced from 155 to 100 and air torque from 110 to 62 (before inertia/handling scaling). Angles remain unwrapped, so rotations are unlimited. Angular damping resists spin without selecting an upright angle. There are no ground snaps, scripted jumps, terrain adhesion, launch impulses, or pitch limits. Slam adds a player-triggered downward force to all three airborne bodies; it never teleports or presses a grounded bike into the road. The camera follows high jumps vertically.

Terrain is streamed as 512-pixel chain segments with shared 8-pixel sampling and neighboring ghost vertices to prevent seam collisions. Chunks are removed behind the vehicle, and the physics world periodically shifts its origin to keep endless runs precise. Continuous collision detection is enabled on the chassis and tires.

Helmet contact crashes immediately. Violent rider-body impacts use contact impulse divided by chassis mass (a change in velocity above 3.8 m/s). A stationary wreck resting on its body without wheel support ends the run after 1.5 seconds. No crash depends on an angle threshold. Airborne stunt rewards wait for both tires to confirm a surviving landing. Each flip earns 2.5 seconds of overboost, big air (0.8 seconds airborne) adds one second, a landed slam adds 1.5 seconds, and each 0.85-second wheelie/stoppie earns 1.25 seconds. Rewards stack up to eight seconds, count down in simulation time, and don't consume manual boost while active. Overboost supplies drive through the tires; it cannot push the bike forward in midair or brake airborne momentum when it expires.

## Verification
```sh
npm test
npm run typecheck
npm run build
```
The deterministic tests cover every bike's flat-ground wheelie/stoppie and resulting helmet crash, repeated air rotations in both directions, counterrotation, full backflip landings followed by continued riding, suspension stability, chunk seams/origin shifts, the first course hill's natural airtime and backflip, upside-down and high-speed helmet impacts, gravity-only airborne momentum, boost traction, scarce coins, and keyboard/touch equivalence. They also verify matching results at 30, 60, and 120 rendering FPS, multi-pointer reset behavior, softer taps, earned automatic overboost, sustained wheelie rewards, overboost speed/expiry, slam force/release/landing rewards, and no ground-slam farming.

Browser smoke checks should use the built-in browser: ride, hold each rotation control, retry, boost, pause/resume, and visit the garage. Real iPhone Safari testing remains necessary for multi-finger capture/cancellation, safe-area and landscape rotation, background/resume, installed-PWA cache updates, sustained frame rate, and subjective handling. Desktop browser checks and deterministic physics tests do not establish real-device performance.

With the dev server running, `/BensBikeTrip/tests/mobile.html` embeds the game at 667×375 and 844×390 for small/large landscape layout checks. This test page is not included in the production bundle.

## GitHub Pages
1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, choose **GitHub Actions**, **not Deploy from a branch**.
3. Pushes to `main` automatically run `.github/workflows/deploy.yml` and publish to [focustap.github.io/BensBikeTrip/](https://focustap.github.io/BensBikeTrip/).

The Vite `base` is set to `/BensBikeTrip/`, since GitHub Pages serves this project from that subpath. If renaming the repository, update `vite.config.ts`, `manifest.webmanifest`, and `public/sw.js`.

## Roadmap
Add generated run variety, better stunts and landing feedback, bike upgrades, missions, sound effects, and real-iPhone handling/performance tuning.
