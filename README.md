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

1. **Map basics** — name, what to call a home base (Home Base/Planet/
   Island/etc, defaults to "Home Base"), and a **map size** (Tiny /
   Small = 3× Tiny / Medium = 2× Small / Large = 2× Medium — actually
   scales home base spacing in `play.html`, not just a label). A
   "ⓘ recommended sizes" hover link next to the size picker explains what
   this means for background art specifically: every image is compressed
   to 768px max regardless of what's uploaded (see item 5's upload
   compression), then stretched to cover the whole map, so the same image
   looks sharp on Tiny (~2× stretch) and progressively softer on Small
   (~4×), Medium (~8×), and Large (~14×) - simpler, lower-detail
   background art holds up better on bigger maps. Character/unit/building
   art isn't affected by map size at all, since those always render at a
   fixed pixel size regardless of world scale.
2. **Your faction & computer players** — you're always the human player;
   add 1-5 computer-controlled opponents, each with its own name, color,
   home base art, and **Home Base HP** (1000-5000, per faction - not one
   fixed value shared by every home base on the map).
2a. **Game style** — ⏱️ Real-Time (default, unchanged) or 🔄 Turn-Based
   (hot-seat: 2-5 people share this device, a timer of 10-60s per turn).
   Turn-Based adds a **turn timer** field and, per computer player, a
   "Controlled by: 🤖 AI / 🧑 Human (hot-seat)" toggle - a human-flagged
   one takes a real turn instead of thinking on its own. Real-Time mode
   never shows either control; every computer player there is always AI.
2b. **Gold per round** (optional, off by default) — a checkbox ("Give
   everyone free gold each round") plus an amount. When on, every
   faction (you and every computer player, alive ones only) gets handed
   that much gold automatically at the start of each round - on top of
   normal mining income, not instead of it. "Round" means the same
   thing the top bar's "Round N" already means in Turn-Based mode
   (once every faction has taken a turn); in Real-Time mode, which has
   no separate round concept, it fires on the existing 90s cosmetic
   turn-clock instead.
3. **Resource & mining** — the deposit every home base gets nearby (name,
   size, art - a real "mine" image, separate from the vessel that works
   it) and the mining unit that drains it (name, income/hour, art).
4. **Air Base** (optional) — a building for planes/jets/spaceships/etc.
   Give it a name (defaults to "Air Base"), its own **art**, **HP**
   (1000-5000, same range/field as Home Base's), and a build cost, then
   add units under it (name/art/hp/attack/range/speed/cost, same fields
   the engine always used), plus one more field each: **production time**
   (10-100s) - `play.html` won't let anyone build those specific units
   until they've actually built this first, and each one then takes
   that many real seconds to produce instead of appearing instantly.
   Leave its unit list empty and the whole feature is simply absent from
   the map, same as never adding it.
4a. **War Factory** (optional) — a second building, identical in every
   way to Air Base above, for tanks/armored vehicles/etc.
4b. **Infantry Post** (optional) — a third building, identical in every
   way to Air Base/War Factory, for foot soldiers/infantry/etc.
4c. **Helicopter Facility** (optional) — a fourth building, identical in
   every way again, for helicopters.
   All four of these (Air Base/War Factory/Infantry Post/Helicopter
   Facility) share the exact same shape: own name (with its own
   sensible default), own art, own HP, own build cost, and a unit list
   with per-unit production time - fully independent of each other (a
   faction can have any combination, including none; every building
   with units queued produces in parallel, none of them compete for a
   shared timer). Together they replaced the old standalone "Combat
   Units" checklist item entirely - a finished map now needs at least
   one unit under one of these four instead (that old section still
   exists in `index.html`'s code, hidden, purely so a map made before
   this change keeps working).
4d. **Research Facility** — NOT optional, unlike the four buildings
   above: every map has the same built-in research tree (the Research
   tab in `play.html`), so this is the one building every player has to
   construct before they can research anything there at all. Same
   name/art/HP/cost fields as the others, but no unit list of its own
   (it doesn't produce units, it gates research) and its art is always
   required to Finish & Save, not just when some list has entries. It's
   also the one thing every faction can always afford to build with
   nothing else built first - in `play.html`, it gates everything else on
   this list: Air Base/War Factory/Infantry Post/Helicopter Facility,
   every unit under them, Gun Turrets, and the Mining Ship are all locked
   (Build/Place buttons disabled, a "requires Research Facility first"
   note in their stats line) until a faction's own Research Facility is
   standing - not just research itself like before. AI factions follow
   the same rule (an unbuilt Research Facility is the only thing an AI
   will spend on until it's built), and destroying a faction's Research
   Facility re-locks everything else again, same as destroying any other
   gated building re-locks its own units.
4e. **Gun Turrets** (optional) — shaped differently from the buildings
   above: no gating building of its own, no production timer, and no
   Speed field (they're stationary by design - the field doesn't exist
   for these rows at all). Add as many turret types as you want, each
   with name/art/hp/attack/range/cost. In `play.html`, building one
   doesn't spawn it next to your Home Base like every other unit -
   instead it arms a placement mode, and you click anywhere between 50
   and 300 range of your own Home Base (shown as a dashed ring while
   placing) to put it there; cost is only actually deducted on a
   successful placement, and Esc (or clicking the button again) cancels
   for free. Once placed a turret never moves and auto-fires at
   whatever enemy comes into its range on its own - no order needed,
   though you can still click it and manually retarget it like a normal
   unit if you want to override that. AI factions place turrets the
   same way, just picking a random valid spot instead of needing a
   click.
5. **Sounds** — background music, intro music, attack/building-destroyed/
   home-base-under-attack/game-over sfx. All optional, all `.mp3`.
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
  upgrades), a real build queue using every unit's actual stats. Income
  and research keep running for every faction regardless of game style
  or whose turn it is - never paused by anything except Pause itself.
- **Two game styles**, picked at map-creation time:
  - **Real-Time** (default) - a 90-second cosmetic turn clock; a unit
    that attacks fires exactly once, then locks (can't take a new move
    or attack order) until that clock's next turn.
  - **Turn-Based (hot-seat)** - 2-5 people share this device. Only the
    active faction's units can act at all (move/attack/build/research
    via the panel) - everyone else, AI factions included, is completely
    frozen until their own turn comes back around. A per-faction timer
    (10-60s, set on the map) counts down and then passes control to the
    next faction automatically - "no continued [global] timer," just
    each faction's own window - or a **⏭ Skip Turn** button next to the
    timer ends it early on purpose, same effect as the timer running out
    on its own. The top bar shows whose turn it is and
    the seconds left; the camera snaps to their home base when it
    becomes their turn. A unit that attacks here locks for the rest of
    that faction's turn (one attack per turn, not per 90s clock-turn -
    this mode has no such clock at all) and clears again the moment its
    turn comes back around.
- **Team select** - shown before every match, for every player. You're
  always Team A; every other faction gets a real team-letter picker (one
  letter per faction that exists, up to 6 - Team A through Team F), not
  a fixed two-side A/B toggle. Two factions sharing a letter fight
  together; any other letter is its own independent side - so 5
  factions can genuinely be Teams A-E, a real free-for-all, not always
  forced into exactly two sides (which used to mean a 5-faction
  Turn-Based match could only ever be lopsided team-vs-team, never
  1v1v1v1v1). Real-Time defaults everyone to Team B (the existing
  "you vs the horde" setup, unchanged); Turn-Based defaults every
  faction to its own letter (free-for-all by default, since multiple
  people sharing a device usually means independent competitors). Start
  Match only requires at least one other faction differ from your team -
  otherwise there's nothing to fight. In Turn-Based mode this same
  screen also has a live 🧑 Human / 🤖 AI toggle per faction - this is
  the real, final decision (seeded from, but overriding, whatever
  index.html set as a default), made every time the map is launched.
  Without it, a Turn-Based map could only ever have one human in it (you)
  unless someone had gone back into the editor beforehand - there was no
  way for a group of people to just sit down and divide up the factions
  themselves at play time. Now anyone launching the map picks who's
  actually playing right there.
- **Real player control**: left-drag a box to select multiple units,
  click to move or attack. Issuing an order deselects automatically -
  a unit doesn't stay glued to your next click the way it used to. A
  **✕ Deselect** button (also the Escape key) clears the current
  selection too.
- **Mining ships auto-travel**: built next to your own deposit, a miner
  immediately gets a move order there on its own - no manual command
  needed - and income only flows while it's actually parked within range
  of the deposit, not just for existing somewhere on the map. Its HP is
  a real per-map setting now (index.html's "Mining unit HP" field,
  defaults to 40, gets the same HP-research bonus every other unit
  does) shown right in the Build panel row, not a number only baked
  into the engine - it's a real, killable unit the whole time. It also
  shows its own live income right above it on the map itself, not just
  in the top HUD ("⛏ +900/hr" / "⛏ en route…" on a solid chip so it
  reads clearly over any background), same idea as the source game's
  own display. No cap on how many you can build any more (the Build
  panel row shows a running count instead of ever disabling to
  "Already built") - each one parked in range adds its own full income
  share, so more miners genuinely means more income, not wasted gold.
  A faction's AI always gets its first miner as soon as it can, then
  only occasionally builds more (10%/tick, capped at 3) so it doesn't
  neglect its army. And an enemy's miner is a real click-to-attack
  target now too - it always had real HP and could always be killed by
  an AI, a player just had no way to actually order an attack on one.
- Laser beams on every attack, colored per unit type from an 8-color
  palette (colors repeat past 8 types).
- Units rotate to face their actual direction of travel. A faction's
  home base art itself slowly spins in place, but only when the map's
  `baseLabel` field (checklist item 1's "Home Base is called a...")
  contains the word "planet" - not for Island/Base/whatever else someone
  typed there.
- A pannable camera (right-drag) with scroll-wheel zoom (centered on the
  cursor) over a world sized by the map's chosen size, and a minimap that
  both jumps the camera there on click AND, if units are selected, issues
  them a move order to that point. Also: fog of war (toggle - minimap-only
  reveal radius around your own units), sound on/off, pause (freezes the
  whole simulation), Save/Load to a JSON file.
- Background art is a **single image, cover-fit once** over the whole
  world's bounding box (scale = the larger of width/height ratio,
  uncapped, so it always fully covers with no gaps) - not tiled. A tiled
  repeating pattern was tried first but reads as an obvious grid of
  identical squares rather than one map; a cover-fit single image trades
  some softness on a big map for actually looking like one accurate
  picture.
- The home base's HP is also a real bar at the top of the Build panel
  (updated live every frame), not just the small one floating over its
  canvas sprite - and the resource counter up top is explicitly labeled
  "🪙 ... Gold" instead of a bare, unlabeled number. Clicking directly on
  any home base (your own or an enemy's) now shows its HP in the same
  info box a clicked unit uses - home bases live in their own `factions`
  array rather than the `units` array everything else is clickable
  through, so this never worked before; the click still issues an attack
  order too if you have units selected and it's an enemy's.
- **Air Base, War Factory, Infantry Post, Helicopter Facility** (all
  optional, set on the map): a faction-owned buildable structure that
  has to be built before any of its own units can be, exactly like the
  Mining Ship's "requires Mining Operations research" pattern. In the
  Build panel each shows as a one-time purchase ("Build" → "Already
  built"); its units show as 🔒 Locked with a "requires <building
  name>" note until that faction actually builds it - even for AI
  factions, who prioritize building whichever one they still need about
  half the time they can afford it rather than picking a random unit.
  Once built, its units queue for production instead of spawning
  instantly: clicking one starts a real countdown (its own per-unit
  production time, 10-100s, set on the map) shown right on the
  building's own build-panel row ("Producing Tank… 24s left · 2
  queued"), and the unit only actually appears once that timer runs
  out. Only the front item of each building's queue ticks - so a
  faction with several of these buildings produces one unit per
  building at the same time, none of them competing for a shared timer
  - and like research/mining income, queues keep progressing regardless
  of whose turn it is in Turn-Based mode. A map with no units defined
  under a given building never shows any of it at all for that
  building. Once built, the building spawns as a **real, attackable
  entity** at a fixed offset near its faction's homeworld (each building
  its own offset, so none of them ever overlap each other or the
  resource deposit) - not decoration, an actual target with the HP set
  on the map (same 1000-5000 field/range as Home Base's), a visible HP
  bar, targetable by `nearestEnemy()` (AI) and by a player's own click
  to attack, same as any unit. Destroying one actually revokes what it
  unlocked: `fac.built[key]` flips back to false, its production queue
  is cleared (whatever was mid-build there is gone with it), and no
  more of its units can be built - or, for Research Facility, no more
  research - until it's built again from scratch. It never fights back
  or moves on its own (0 attack/range/speed - it's a pure HP target,
  not a defender; that's what Gun Turrets are for). If no art was
  uploaded for it, it falls back to a faction-colored circle with the
  building's own emoji icon instead of drawing nothing at all, same as
  every other entity in the game already does when its image is
  missing. The production countdown shown in the
  build panel updates live every frame (it used to only update when
  something else happened to redraw the panel, so it looked frozen -
  reported as "no timer for troop production" even though production
  itself was always progressing correctly in the background).
- **Research Facility** (mandatory, set on the map): same one-time-
  purchase build-panel row, same real attackable/destroyable entity, as
  the buildings above, but it gates the Research tab itself rather than
  a unit list - `startResearch()` refuses outright (and every row in the
  Research tab shows 🔒 Locked, with a banner explaining why) until that
  faction has actually built it, and destroying one re-locks research
  the same way destroying a War Factory re-locks its units. No unit
  list, so it always shows in the Build panel regardless - there's
  nothing that would make it optional the way an empty unit list does
  for the other buildings. Beyond gating research, it's now also the
  prerequisite for everything else buildable in the game: Air Base/War
  Factory/Infantry Post/Helicopter Facility and their units, Gun
  Turrets, and the Mining Ship are all disabled with a "requires
  Research Facility first" note until a faction's own Research Facility
  is standing - previously any of those could be built with nothing
  else in place. It's exempt from its own rule (always buildable
  immediately, or nothing could ever get built), and AI factions treat
  an unbuilt Research Facility as the only thing worth spending on until
  it exists.
- **Gun Turrets** (optional, set on the map): stationary defenses,
  structured differently from the buildings above entirely - no gating
  building, no production queue, no Speed stat. Clicking "Place" in the
  Build panel doesn't spawn one immediately; it arms placement mode
  (cursor becomes a crosshair, a dashed range ring appears around your
  Home Base) and the next click on the map - if it lands between 50 and
  300 world units from your Home Base - spends the cost and places it
  exactly there; a click outside that ring is just ignored (stays in
  placement mode), and Esc or clicking the button again cancels for
  free before you've spent anything. A placed turret has speed 0 (so
  combatTick's own chase-toward-target math always computes zero
  movement - it just can't fire until something wanders into range) and
  auto-acquires the nearest enemy on its own every frame regardless of
  who owns it or whether it's AI- or human-controlled, rather than
  waiting for a click the way a normal unit does - though clicking it
  and giving it an explicit target still overrides that, same as
  commanding any other unit. Exempt from both of the rules that apply to
  every other unit: it's never frozen by Turn-Based mode even during
  another faction's turn (a defense that only worked on its owner's own
  turn wouldn't defend anything), and it uses its own short real-time
  cooldown instead of "one attack per turn" (that rule is a
  player-command balance thing, not meant for something firing on its
  own). It's a full combat entity in the normal
  `units` array (not a decorative marker like the buildings above), so
  it can be selected, destroyed, and targeted by enemies like anything
  else. AI factions place them too, picking a random valid spot in the
  same ring instead of needing a click.
- **⬇ Download as index.html** - packages the map's data inline into a
  fully standalone copy of this page. Verified: opens and runs from
  `file://` with zero network calls.
- **Titan Business Pros logo + hidden page** - a small clickable logo in
  the top-left corner of the topbar, present in every game this maker
  produces (it lives directly in `play.html`'s own markup, which is
  exactly what "⬇ Download as index.html" packages, so it rides along
  into every exported standalone game with zero extra work). Clicking it
  opens a hidden overlay - reachable only from that click, linked nowhere
  else, built as an in-page overlay rather than a real second-file
  navigation so it works identically live or in a fully offline
  downloaded copy. Content: a starfield backdrop (plain canvas, ~140
  gently twinkling dots, only animates while the page is open) behind the
  logo floating/spinning in a CSS 3D scene, a rotating galaxy and 3
  rotating planets plus 2 tumbling asteroids and 5 flying ships (real art
  from the After Earth game, see [[game-maker-references]] for the
  source folder, resized way down before embedding), then three yes/no
  pitch questions (a $25 website, Google Play/Steam publishing, turning
  the game into a full RTS - "Yes" reveals a `mailto:` line to
  `titanbusinesspros@gmail.com`), and the business's own site/phone as a
  real link. Opening it pauses the match underneath.
- The shared library's **📚 Library picker** (in `index.html`, not this
  page) shows browsed items without their names now - bare thumbnails
  for images, "Sound 1"/"Sound 2"/... for audio (which has no thumbnail
  to browse by, so a fully blank row per item wouldn't be
  distinguishable at all) - the real name still appears afterward in the
  upload slot once something's actually been picked for your map.
- `index.html` reminds map-makers that character/unit art should have a
  **transparent background** for best results - a tip line in the page
  header plus on every unit/turret art upload slot's own status text,
  right at the point of upload.

`window.__GM_DEBUG` (factions/units/camera/turnMode/activeFaction/etc,
read-only) is left in deliberately - real automated tests throughout
this project's build used it to verify game state directly instead of
guessing at screen coordinates.

## `admin.html`

Google-sign-in-gated to one email (`ADMIN_EMAIL` constant - duplicated
as a separate `ADMIN_EMAIL` in `index.html` too, since that page never
linked to this one anywhere except a buried mention inside an empty-
library placeholder message; signing into `index.html` as that account
now shows a real "⚙️ Admin: manage the shared library" link right in the
header, otherwise there was no visible way to discover this page at
all beyond typing its URL by hand). Lets that
account multi-select files (a whole folder at once) into a category,
compresses them the same way `index.html` does, and writes to Firestore
`libraryItems` + Storage `library/<category>/...`. Enforced server-side
by the rules below (checked directly: an unauthorized session's write is
actually rejected, not just hidden in the UI), not just a client check.

Categories are hierarchical: **Maps** (sub-picker: **Tiny**, **Small**,
**Medium**, **Large** - `maps/<size>`, so background art actually gets
filed under the map size it was meant for instead of one flat bucket;
items uploaded under the old flat `maps` category before this change
still show up, just under "Other" rather than being sorted into a size -
they were never tagged with one), **Characters** (sub-picker:
**Space Ships**, **Navy Ships**, **Planes and Jets**, **Helicopters**,
**Army Men**, **Infantry**, **Artillery** - stored as `characters/<type>`),
Picking a Maps sub-category also shows a hint line with that size's
recommended-art note (same "capped at 768px, stretched ~N× to cover the
world" info as `index.html`'s own map-size hover tooltip, just phrased
per-size instead of as a comparison table), so whoever's curating the
library sees it right where they're about to upload, not only where a
map creator sets the size.
**Worlds**, **Bases**, **Resources** (flat, no sub-picker), **Structures**
(sub-picker: **War Factory**, **Airport**, **Infantry Post**,
**Helicopter Facility**, **Research Facility**, **Gun Turret** -
`structures/<type>`), **Sounds** (sub-picker: **Background
Music**, **Intro Music**, **Attack**, **Building Destroyed**, **Home Base
Under Attack**, **Game Over** - `sounds/<type>`). Any top-level category
with `children` in `CATEGORY_TREE` gets this same sub-picker UI - it used
to be hardcoded to just Characters, generalized once Structures and
Sounds needed one too, so adding another sub-picker later only means
editing `CATEGORY_TREE`, not the picker UI itself. Sub-category **ids**
are never renamed once items can exist under them, even when a label
changes (Jets' id is still `characters/jets` even though its label is now
"Planes and Jets") - otherwise already-uploaded art under the old id
would silently fall into "Other" instead of staying findable. The
"Current library" list renders these as real nested sections, and
anything uploaded under an older/removed category still shows up under
an "Other" section instead of disappearing. `index.html`'s library picker
groups by whatever category string it finds (same picker for every
upload slot, not filtered per-slot - all image categories show as tabs
for any image slot, all sound sub-categories for any sound slot), so it
reflects this hierarchy automatically - it also has a matching label map
so tabs read "Space Ships" instead of the raw `characters/space_ships`
id. `index.html`'s own Sounds section (map-basics checklist item 5, not
the library) also got subsection headings (Music / Combat SFX / Event &
Warning SFX) grouping its 6 upload slots, separate from - but named to
match - the library's own sound sub-categories.

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
