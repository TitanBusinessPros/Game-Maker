# Game-Maker

A single-file-per-page, browser-based **game maker**. No build step, no
server. Three pages, one Firebase project:

- **`index.html`** — the map/game builder. A checklist: upload art/sound,
  set unit stats, add computer-player opponents, pick a map size. Saves to
  Firestore. Requires signing in with Google.
- **`play.html`** — the actual game. Loads a saved map's data and runs a
  real, standalone skirmish: your own two-or-more factions only, nothing
  of the original inspiration game in it except the mechanics. Has its own
  "Team A / Team B" pre-match screen, and a "Download as index.html"
  button that packages everything into one offline-playable file.
- **`admin.html`** — lets one specific Google account (`adonai4you@gmail.com`)
  add art/sound to a shared library that shows up as a "📚 Library" picker
  next to every upload slot in `index.html`, so map-makers can pick
  existing assets instead of uploading their own.

## The idea

Reuse a proven strategy-game *ruleset* — real-time mining economy, a
research tree, a build queue, HP/attack/range/speed combat — as the
engine under someone else's own art, names, and units. Not a reskin of
the original game (its 20-nation galaxy, its aliens, its branding never
appear) — a genuinely separate, self-contained game per map.

## `index.html` — the checklist

1. **Map basics** — name, what to call a homeworld (Planet/Island/Base/etc),
   and a **map size** (Tiny / Small = 3× Tiny / Medium = 2× Small /
   Large = 2× Medium — actually scales homeworld spacing in `play.html`,
   not just a label).
2. **Your faction & computer players** — you're always the human player;
   add 1-5 computer-controlled opponents, each with its own name, color,
   and homeworld art.
3. **Resource & mining** — the deposit every homeworld gets nearby (name,
   size, art - a real "mine" image, separate from the vessel that works
   it) and the mining unit that drains it (name, income/hour, art).
4. **Combat units** — add as many as you want, each with hp/attack/range/
   speed/cost - the exact fields `play.html`'s engine reads.
5. **Sounds** — background music, intro music, attack/building-destroyed/
   homeworld-under-attack/game-over sfx. All optional, all `.mp3`.
6. **My Maps** — every map saved under your signed-in account, draft or
   finished, with Edit/▶ Play/Delete.

Every upload slot has a **📚 Library** button next to it, pulling from
whatever the admin has added via `admin.html` (Firestore `libraryItems`
collection) - picking one is instant, no upload needed. Images you *do*
upload are compressed client-side first (resized to at most 768px,
re-encoded as WebP) - a multi-MB photo commonly comes back under 300KB,
which is most of what makes Save fast.

**Save Draft** works with anything filled in; **Finish & Save** requires
the checklist items above and marks the map playable.

## `play.html` — the actual game

Not a rewrite of the original inspiration's mechanics - a fresh,
self-contained implementation of the same *kind* of rules, driven
entirely by one map's saved data:

- Real-time mining economy (600 → 900 → 1200/hour via research tiers),
  a 7-node research tree (economy chain + generic combat/utility
  upgrades), a real build queue using every unit's actual stats.
- A 90-second turn clock (cosmetic pacing, matching the source game's
  feel) alongside the real-time economy.
- **Team A / Team B** - shown before every match, for every player, with
  up to 5 computer opponents each getting an explicit A/B toggle (you're
  always A). At least one has to stay on B or Start Match refuses -
  otherwise there's nothing to fight.
- **Real player control**: left-drag a box to select multiple units,
  click to move or attack. A unit that attacks fires exactly once, then
  locks (can't take a new move or attack order) until the next turn -
  can't repeat-fire or fire-and-reposition freely. A **✕ Deselect**
  button (also the Escape key) clears the current selection so units stop
  following the mouse.
- **Mining ships auto-travel**: built next to your own deposit, a miner
  immediately gets a move order there on its own - no manual command
  needed - and income only flows while it's actually parked within range
  of the deposit, not just for existing somewhere on the map.
- Laser beams on every attack, colored per unit type from an 8-color
  palette (colors repeat past 8 types).
- Units rotate to face their actual direction of travel.
- A pannable camera (right-drag) with scroll-wheel zoom (centered on the
  cursor) over a world sized by the map's chosen size, and a minimap that
  both jumps the camera there on click AND, if units are selected, issues
  them a move order to that point. Also: fog of war (toggle - minimap-only
  reveal radius around your own units), sound on/off, pause (freezes the
  whole simulation), Save/Load to a JSON file.
- Background art is drawn as a **tiled world-space pattern**
  (`ctx.createPattern`), so it stays sharp and always covers the full map
  regardless of chosen size - earlier cover-fit/capped-scale approaches
  either blurred or left black gaps on larger maps.
- **⬇ Download as index.html** - packages the map's data inline into a
  fully standalone copy of this page. Verified: opens and runs from
  `file://` with zero network calls.

`window.__GM_DEBUG` (factions/units/camera/etc, read-only) is left in
deliberately - real automated tests throughout this project's build used
it to verify game state directly instead of guessing at screen
coordinates.

## `admin.html`

Google-sign-in-gated to one email (`ADMIN_EMAIL` constant). Lets that
account multi-select files (a whole folder at once) into a category,
compresses them the same way `index.html` does, and writes to Firestore
`libraryItems` + Storage `library/<category>/...`. Enforced server-side
by the rules below (checked directly: an unauthorized session's write is
actually rejected, not just hidden in the UI), not just a client check.

Categories are hierarchical: **Maps**, **Characters** (with a sub-picker
for **Space Ships**, **Navy Ships**, **Jets**, **Army Men** - stored as
`characters/<type>`), **Worlds**, **Bases**, **Sounds**. The "Current
library" list renders these as real nested sections (a Characters heading
with its four sub-headings under it), and anything uploaded under an
older flat category before this structure existed still shows up under
an "Other" section instead of disappearing. `index.html`'s library picker
groups by whatever category string it finds, so it reflects this
hierarchy automatically - it also has a label map so tabs read
"Space Ships" instead of the raw `characters/space_ships` id.

`window.__ADMIN_DEBUG` (CATEGORY_TREE / renderLibraryInto / currentCategory,
read-only) is left in for the same reason as `play.html`'s `__GM_DEBUG` -
it lets the category grouping/labeling be verified against fabricated
data without needing a real Google sign-in.

## Firebase project

Project: `game-maker-ed014`.

- **Authentication** — Google sign-in is *required* on both `index.html`
  and `admin.html` (no more anonymous default). Implemented via **Google
  Identity Services** (`accounts.google.com/gsi/client`), not
  `signInWithPopup`/`signInWithRedirect` - both of those route through
  `game-maker-ed014.firebaseapp.com` as a middleman before returning to
  the real site (`titanbusinesspros.github.io`), which is a known
  Firebase Auth weak point under modern browser storage-partitioning and
  was reported broken (differently, but from the same root cause) both
  ways. GIS hands a credential straight to a page-local callback instead.
  Separately, the OAuth Client itself has its own "Authorized JavaScript
  origins" allowlist in
  [GCP Console](https://console.cloud.google.com/apis/credentials?project=game-maker-ed014)
  (different from Firebase's "Authorized domains") - console-only, no
  API/CLI path - so a new hosting origin has to be added there by hand or
  sign-in fails with `Error 400: origin_mismatch`.
- **Firestore** — `maps/{mapId}` (one doc per map) and `libraryItems/{id}`
  (the shared asset library), both public-read; writes locked to the
  owning `uid` (maps) or the admin email (library) via rules.
- **Storage** — `maps/{uid}/{mapId}/...` for map-specific uploads,
  `library/{category}/...` for the shared library. Same read-public/
  write-locked pattern.

The web config (`apiKey` etc.) is a public client identifier, not a
secret. `firestore.rules`/`storage.rules` in this repo are deployed via
`firebase deploy --only firestore:rules,storage` (Firebase CLI, logged in
as the project owner) - not something GitHub Pages hosting does for you.

## Hosting

Static site on GitHub Pages (source = `main`, path `/`). No build step.
