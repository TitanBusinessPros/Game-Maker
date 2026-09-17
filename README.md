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

The page header shows the Titan Business Pros logo (top-left, same
96&times;96px art `play.html` uses) next to a centered **"Titan Game
Maker"** title (previously just "Game Maker"), and the page ends with a
footer: "Created by Titan Business Pros LLC", the business phone number
and `www.titanbusinesspros.com` (linked), and an Oklahoma City/copyright
line. Only this page has the logo/title/footer treatment so far -
`admin.html` and `play.html` haven't been touched the same way.

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
   add 1-10 computer-controlled opponents, each with its own name, color,
   home base art, **Home Base HP** (1000-5000, per faction - not one
   fixed value shared by every home base on the map), and **AI
   Difficulty** (Easy/Medium/Hard/Super Hard, per computer player - see
   `AI_DIFFICULTY` in `play.html`). It scales three things about that
   faction's AI, all independent of its actual decision logic (which is
   identical at every difficulty): how often it gets to act at all
   (`tickSeconds`, 10s down to 2.5s), a flat bonus/penalty on all of its
   mining income (`incomeMult`, 0.65x-1.65x - the classic RTS "cheating
   AI" lever; applies to any resource a miner is parked at, Gold or an
   Additional Resource alike - see item 3's own bullet), and how often it
   takes an affordable
   building/turret/extra-miner opportunity instead of skipping it
   (`buildingChance`/`turretChance`/`minerChance`). Ignored for a
   Turn-Based hot-seat "Human"-controlled computer player.
2a. **Game style** — ⏱️ Real-Time (default, unchanged) or 🔄 Turn-Based
   (hot-seat: 2-11 people share this device, a timer of 10-60s per turn).
   Turn-Based adds a **turn timer** field and, per computer player, a
   "Controlled by: 🤖 AI / 🧑 Human (hot-seat)" toggle - a human-flagged
   one takes a real turn instead of thinking on its own. Real-Time mode
   never shows either control; every computer player there is always AI.
2b. **Fog of war** (optional, off by default) — a checkbox right below
   Game Style. When on, `play.html`'s minimap only reveals area within a
   short radius of a faction's own units and Home Base. This is a fixed
   property of the map now, decided here at map-creation time - moved
   down from a topbar button in `play.html` that let a player flip it
   on/off mid-match, which no longer exists.
3. **Resource & mining** — the deposit every home base gets nearby (name,
   size, art - a real "mine" image, separate from the vessel that works
   it) and the mining unit that drains it (name, income/hour, art).
   Below that, **Additional resources** (optional) — a **+ Add resource**
   button adds another named resource beyond Gold (e.g. Oil, Wood), each
   with its own **deposit amount** and its own **deposit art** (shown
   near every home base in `play.html` - see the "Multiple resources"
   bullet further down), same shape as Gold's own deposit above. Deposit
   amount is descriptive, same as Gold's own - neither is actually
   drained down as a finite pool. The same Mining Ship that drains Gold
   also mines any Additional Resource: park one within range of that
   resource's own deposit (its near-base marker by default, or wherever
   it was placed on the map - see item 3a) and it earns that resource at
   the same shared mining rate Gold uses (a 600/hr base, boosted by
   whatever Mining Rate is set to under the new Research Tree section,
   item 3b), same as parking one at Gold's own deposit does - it isn't
   a separate, weaker mechanic. **Free Resources Each Round** (item 5a,
   further down) still works independently on top of that, for any
   resource including Gold, as a flat bonus rather than the only way to
   earn an Additional Resource. Every unit/turret added below (see item
   4) gets a
   checkbox per resource that currently exists here, with an amount for
   each one checked - a Tank could read "50 Gold, 100 Oil" if both boxes
   are checked with those amounts. Adding, removing, or renaming a
   resource here live-updates every already-added unit/turret's
   checkboxes (existing checked amounts are preserved; the new/renamed
   resource just shows up as another row) - though adding/removing a
   resource row itself never touches any OTHER resource's own row (each
   one is its own DOM subtree with a real file upload slot), so a
   not-yet-saved file picked for one resource survives editing another.
   A resource's id is assigned once when it's added and never reused or
   derived from its name, same reasoning as `admin.html`'s category ids -
   a unit's saved cost is keyed by that id, so renaming the resource
   later must not orphan it.
3a. **Placement** — every resource (Gold's own deposit, plus each
   Additional Resource) has its own **📍 Near each base (default)** /
   **🗺️ Place on the map** toggle right under its own art upload. Near
   each base is the original behavior, completely unchanged - a copy of
   that resource's deposit/marker appears next to every faction's own
   home base. Place on the map instead shows the map's own background
   art (whatever's uploaded/picked under Map Basics) and lets the
   map-maker click **any number of points** on it, each stored as a
   fraction of that image (not a pixel position) so they scale correctly
   however big the map actually ends up being once a real match's home
   bases are laid out - click an existing point to remove just that one,
   or **Clear all** to remove every point for that resource at once (a
   live counter shows how many are currently placed). For Gold
   specifically, each point isn't a copy per faction the way "near each
   base" is - it's a real, distinct shared deposit; every faction's
   Mining Ships (including AI) auto-order toward whichever placed deposit
   is nearest when built, and a miner parked within range of *any* of
   them earns its full income share, so several Gold points genuinely
   means several places to work, not several copies of the same spot (see
   `play.html`'s own income bullet further down). For an Additional
   Resource, which was already just a visual marker with no income or
   range of its own to manage, placing it on the map with several points
   just draws one shared marker per point instead of one per faction.
3b. **Research Tree** — every research topic (`play.html`'s Research
   tab) has exactly **3 levels**, and each level's actual effect is a
   **percentage** the map-maker sets here, not a value fixed in the
   engine - the same generic pattern for all 6 topics: **Mining Rate**
   (Gold/Additional Resource mining income - Level 1 also unlocks the
   Mining Ship itself, same gate as always), **Vessel Plating** (max HP),
   **Warp Drive Calibration** (movement speed), **Extended Range**
   (formerly "Extended Sensors (Vision)," which had no in-game effect at
   all - now boosts every unit's and Gun Turret's own attack/heal range;
   internal id stayed `vision`, only its default name/what it does
   changed, so a map that already had percentages saved under it keeps
   them, just applied to range from now on), **Rapid Repair Crews** (HP
   regen - boosts how much HP a Field Hospital medic heals per turn, item
   4e below) and **Missile Range** (Missile Silo launcher range above its
   fixed 500 base). All 6 topics now drive a real effect - none are
   inert placeholders any more. Leave a level at 0 to make it a no-op.
   Defaults to 5%
   / 10% / 15% for Level 1/2/3 of every topic; nothing here is required
   to Finish & Save. Each topic also has its own **Research name** field,
   pre-filled with its plain default name (e.g. "Warp Drive Calibration")
   as an example - rename it to whatever fits your game's theme and
   `play.html`'s Research tab shows *that* name (plus " II"/" III" for
   Levels 2/3 of the same topic - one rename covers all 3 levels, not
   three separate name fields) instead. A map saved before either of
   these fields existed loads with every topic at its default name and
   percentages.
4. **Air Base** (optional) — a building for planes/jets/spaceships/etc.
   Give it a name (defaults to "Air Base"), its own **art**, **HP**
   (1000-5000, same range/field as Home Base's), and a build cost, then
   add units under it (name/art/hp/attack/range/speed/**costs**/
   **weapon**/**rotate to face movement** - costs is the per-resource
   checkbox+amount system from item 3 above, replacing what used to be a
   single flat Cost number; Weapon is a dropdown - Laser/Bullet/
   Explosion/Missile/Arrow/Melee Slash/Flamethrower/Lightning Bolt/
   Poison Spray/Ice Shard/Railgun/Grenade Toss/Shockwave/Cannonball/
   Javelin/Whip, purely cosmetic, defaults to Laser - see `play.html`'s
   weapon-effects bullet below; "Rotate to face movement direction" is a
   checkbox, on by default, that turns off a unit's sprite always
   turning to face where it's headed - see `play.html`'s own bullet on
   this further down), plus one more field each: **production time**
   (10 seconds up to 120 minutes) - `play.html` won't let anyone build
   those specific units until they've actually built this first, and each
   one then takes that long to produce instead of appearing instantly -
   shown live as a countdown on the building's own build-panel row (e.g.
   "Producing Jet… 30s left", counting down to 0), formatted as
   hours/minutes once it's over a minute so a long timer doesn't read as
   an unreadable raw seconds count. Each building's own queue holds up to
   10 units at once - see item 4e's own bullet below.
   Leave its unit list empty and the whole feature is simply absent from
   the map, same as never adding it.
4a. **War Factory** (optional) — a second building, identical in every
   way to Air Base above, for tanks/armored vehicles/etc.
4b. **Infantry Post** (optional) — a third building, identical in every
   way to Air Base/War Factory, for foot soldiers/infantry/etc.
4c. **Helicopter Facility** (optional) — a fourth building, identical in
   every way again, for helicopters.
4d. **Navy Harbor** (optional) — a fifth building, identical in every way
   again, for ships/submarines/etc.
4e. **Field Hospital** (optional) — a sixth building, same building-level
   shape as the five above (own name, art, HP, build cost, produced with
   the same queue/countdown system - see below), but a **different unit
   shape**: no Attack or Weapon field at all, since a medic never fights.
   Instead: **HP**, **heal range**, **speed**, a **heal amount** (how
   much HP it restores, once per turn, to whichever allied unit you
   click - the same one-action-per-turn rule combat already follows, not
   a separate mechanic), a **Rotate to face movement direction**
   checkbox (same field/default as every other combat unit type - a
   medic does walk to reach whoever it's healing), and **costs**.
   Boosted by **Rapid Repair Crews**
   research (item 3b above) - previously a real, researchable topic with
   no in-game effect at all; this is what it was missing.
   All six of these (Air Base/War Factory/Infantry Post/Helicopter
   Facility/Navy Harbor/Field Hospital) share the exact same *building*
   shape: own name (with its own sensible default), own art, own HP, own
   build cost, and a unit list with per-unit **production time** (now
   **10 seconds up to 120 minutes**, not capped at 100s any more - a
   build panel row showing a raw seconds count at that scale would be
   unreadable, so `play.html`'s own countdown and this stat line both
   show it as e.g. "1h 30m" instead of "5400s", falling back to plain
   seconds under a minute, unchanged from before) - fully independent of
   each other (a faction can have any combination, including none; every
   building with units queued produces in parallel, none of them compete
   for a shared timer, and each building's own queue holds **up to 10
   units** at once - once full, its remaining unit rows show "Queue full"
   and can't be queued again until the front item finishes and the queue
   shortens). Together they replaced the old standalone "Combat Units"
   checklist item entirely - a finished map now needs at least one unit
   under one of these instead (that old section still exists in
   `index.html`'s code, hidden, purely so a map made before this change
   keeps working; Field Hospital's own medics don't count toward this -
   same treatment as Gun Turrets/Missile Silo, since a medic can't fight).
   Each of the six has a **🗑 Remove this building** button in its own
   header, for a map-maker who only wants some of them rather than
   filling in a section they don't plan to use - clicking it clears that
   building's unit list (the
   only thing that actually makes a building "absent" from the game at
   all - see `checklistGaps`/`GATED_BUILDINGS`' own `unitCfgs.length`
   check, unchanged) and collapses the section to a one-line "removed -
   **+ Add it back**" note. Not persisted - it only hides the section for
   the rest of that editing session; reopening the map later shows all
   six again (an unused one just has nothing in its unit list, same as
   if it had never been touched, which was already indistinguishable
   from "removed" as far as `play.html` is concerned).
4f. **Missile Silo** (optional) — a seventh gated building, same
   name/art/HP/build-cost shape as Air Base/War Factory/Infantry Post/
   Helicopter Facility/Navy Harbor/Field Hospital above (including its
   own **🗑 Remove this building** button), but its unit list below it is
   a **missile launcher** type, not a normal combat unit: **name**,
   **launcher art**, **HP**, **Missile HP damage**, **Missile speed**,
   **missile art** (a *second*, separate upload - the projectile itself,
   drawn actually traveling to its target, not the stationary launcher's
   own sprite), a **Rotate missile to face its travel direction**
   checkbox (on by default - the launcher itself never moves and always
   turns to face whatever it's targeting regardless of this, same as a
   Gun Turret; this only controls whether the *projectile's* own sprite
   turns to face the direction it's flying), and **costs** (the usual
   per-resource checkboxes). No Range or Weapon field on this row at all
   - unlike every other
   unit/turret type, a launcher's range isn't set here; see `play.html`'s
   own bullet on this further down for why. In `play.html`, a launcher is
   placed the same way a Gun Turret is (see 4h below) - click **Place**,
   then click anywhere between 50 and 300 range of your Home Base -
   rather than produced with a timer (and so not subject to the 10-unit
   queue cap either, it isn't a queue at all) like Air Base's own units,
   but still requires the Missile Silo building itself to already be
   standing first, unlike Gun Turrets (which have no gating building at
   all). Leave its launcher list empty and the whole feature is absent
   from the map, same as the six buildings above.
4g. **Research Facility** — NOT optional, unlike the buildings
   above: every map has the same built-in research tree (the Research
   tab in `play.html`), so this is the one building every player has to
   construct before they can research anything there at all. Same
   name/art/HP/cost fields as the others, but no unit list of its own
   (it doesn't produce units, it gates research) and its art is always
   required to Finish & Save, not just when some list has entries. It's
   also the one thing every faction can always afford to build with
   nothing else built first - in `play.html`, it gates everything else on
   this list: Air Base/War Factory/Infantry Post/Helicopter Facility/
   Navy Harbor/Field Hospital/Missile Silo, every unit under them, Gun
   Turrets, and the Mining Ship are all locked (Build/Place buttons
   disabled, a "requires Research Facility first" note in their stats
   line) until a faction's own Research Facility is standing - not just
   research itself like before. AI factions follow the same rule (an
   unbuilt Research Facility is the only thing an AI will spend on until
   it's built), and destroying a faction's Research Facility re-locks
   everything else again, same as destroying any other gated building
   re-locks its own units.
4h. **Gun Turrets** (optional) — shaped differently from the buildings
   above: no gating building of its own, no production timer, and no
   Speed field (they're stationary by design - the field doesn't exist
   for these rows at all). Add as many turret types as you want, each
   with name/art/hp/attack/range/**costs**/**weapon** (same per-resource
   cost checkboxes and Weapon dropdown as every other unit type). In
   `play.html`, building one
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
5a. **Free Resources Each Round** (optional) — its own section now (moved
   down from a single "Gold per round" checkbox that used to sit at the
   top of the checklist, under item 2), sitting right before My Maps.
   One checkbox + amount row per resource that currently exists (Gold
   plus anything added under item 3's Additional Resources). Checking
   one hands every faction (you and every alive computer player) that
   much of that resource automatically at the start of each round, on
   top of Gold's normal mining income (not instead of it) - for an
   extra resource, which has no income of its own otherwise, this is
   the only way a map actually hands any of it out at all. "Round" means
   the same thing
   the top bar's "Round N" already means in Turn-Based mode (once every
   faction has taken a turn); in Real-Time mode, which has no separate
   round concept, it fires on the existing 90s cosmetic turn-clock
   instead.
6. **My Maps** — every map saved under your signed-in account, draft or
   finished, with Edit/Delete plus, for a finished map, **⬇ Download My
   Game** - the ONLY action here, at the map-maker's explicit and
   repeated instruction: no live gameplay link anywhere in this UI, for
   anyone, including the map-maker's own testing. No `play.html?map=<id>`
   link is generated or shown by this app at all any more - trying a map
   (Turn-Based human players included, via that page's own Team Select
   screen) means downloading it first, same as anyone else would.
   Download produces a standalone, fully-offline HTML file
   (`inlineUrlsAsDataUris()`, reimplemented here so it runs straight from
   the map list - fetch the map's saved data, base64-inline every
   art/sound URL it references, fetch `play.html`'s own source, inject
   the result via `window.GM_INLINE_CONFIG`) someone else can play with
   zero further Firebase cost, however many times, however many people.
   Clicking it spends one **download credit** - every account
   starts with 3, never refilled or reset (an admin-listed email starts
   with 50 instead, unaffected by this - see `admin.html`'s own section
   below), shown next to your email at the top of the page ("N download
   credits left").
   Hitting 0 blocks further downloads with a clear message instead of
   failing silently. Client-side, the enforcement against someone just
   editing their own balance in devtools lives entirely in
   `firestore.rules`' `/users/{uid}` rules: a new balance can only ever
   be *created* at exactly 3 (or exactly 50, only if that email's in the
   bonus list), and can only ever be *updated* to exactly one less than
   whatever it already was - nothing client-side is ever allowed to
   *increase* it. The admin account is fully exempt - no credits doc, no
   check, no limit at all, checked the same way every other admin-only
   action in this project is (`request.auth.token.email` against the one
   hardcoded admin address, not a client-side flag).
   Hitting 0 shows a popup instead of just an error - **"Get 10 credits
   for $5"**, a Stripe Payment Link
   (`buy.stripe.com/4gM5kE6Br7wscm6efJ7AI0Y`), with `?client_reference_id=<your
   Firebase uid>` appended so the purchase can be tied back to your
   account. That's the one thing this project's Firestore rules
   deliberately *can't* do on their own - rules have no channel to
   Stripe, so they can't tell "a real payment happened" apart from
   "someone set their own credits field" no matter how they're written.
   Actually granting the 10 credits needs something that isn't a rule at
   all: this project's first real backend, a Cloud Function (see
   `functions/`, below) that Stripe calls directly once a payment
   completes, verifies the payment is genuine, and writes the credit
   grant with the Admin SDK (which bypasses these rules entirely, since
   it's inherently trusted).

Every upload slot has a **📚 Library** button next to it, pulling from
whatever the admin has added via `admin.html` (Firestore `libraryItems`
collection) - picking one is instant, no upload needed. Images you *do*
upload are compressed client-side first (resized to at most 768px,
re-encoded as WebP) - a multi-MB photo commonly comes back under 300KB,
which is most of what makes Save fast.

Opening the picker **lands on the category that slot is actually for**
instead of always the same first-available tab - Map background art
opens straight to that size's own Maps sub-category (Tiny/Small/Medium/
Large, matching whatever's picked under Map Basics), a home base art
slot opens to Bases, an Infantry Post unit's art opens to Infantry, a
Missile Silo launcher's own sprite opens to the Missile Silo structure
category while that *same row's* separate missile-projectile art slot
opens to the dedicated Missiles category, and so on
(`defaultCategoryForSlot()`/`SLOT_CATEGORY_HINTS`/
`SLOT_PREFIX_CATEGORY_HINTS` in `index.html`). Falls back to the old
first-available-category behavior for the handful of slots with no clean
matching admin.html category (Mining Ship art) or if the hinted category
has nothing uploaded to it yet.

**Save Draft** works with anything filled in; **Finish & Save** requires
the checklist items above and marks the map playable.

## `play.html` — the actual game

Not a rewrite of the original inspiration's mechanics - a fresh,
self-contained implementation of the same *kind* of rules, driven
entirely by one map's saved data:

- Real-time mining economy (a 600/hr Gold base, boosted by research - see
  the Research Tree bullet further down), a real build queue using every
  unit's actual stats. Income and research keep running for every faction
  regardless of game style or whose turn it is - never paused by anything
  except Pause itself.
- **Multiple resources**: every faction has its own wallet per resource
  that exists on the map (`fac.resources`, `{gold: N, ...}` - Gold plus
  whatever `index.html`'s "+ Add resource" defined), shown in the top
  HUD as one chip per resource (🪙 for Gold, 🔹 for everything else) and
  spent per-unit against whatever `index.html`'s cost checkboxes set for
  that unit/turret ("Cost 50 Gold, 100 Oil" in the Build panel). Only
  combat units and Gun Turrets use this multi-resource system - Gated
  buildings' own one-time unlock cost, the Mining Ship's flat cost, and
  research costs are all still plain Gold, unchanged. The Mining Ship
  itself isn't Gold-only: parked within range of ANY deposit - Gold's or
  an Additional Resource's - it earns that resource at the same shared
  mining rate (a 600/hr base, boosted by Mining Rate research, unchanged
  by which resource it's parked at), so several resources genuinely means
  several
  places for a fleet of miners to work, not one real economy and several
  decorative ones. `u.miningResourceIds` (set once per tick in the same
  income loop, read by the live "⛏ +900/hr" label) is which resource(s)
  a specific miner is currently in range of - almost always 0 ("⛏ en
  route…") or 1, but nothing stops two deposits placed close enough to
  overlap. "Free resources each round" (item 5a) still works
  independently on top of mining, for any resource including Gold, as a
  flat bonus rather than a second income mechanism. Each extra
  resource also gets its own deposit marker
  drawn near every home base (`index.html`'s per-resource art upload) -
  visually just "this is where it comes from" the same as Gold's own
  deposit art is, but a real, minable object underneath, not purely
  decorative; a resource added with no art falls back to a plain
  circle + 💎, same graceful-fallback treatment every other optional
  image gets
  elsewhere in this file. A map saved before multiple resources existed
  still loads and plays identically (its one flat `cost` number is read
  as a Gold cost, and its old single `goldPerRound` value becomes a
  Gold grant).
- **Two game styles**, picked at map-creation time:
  - **Real-Time** (default) - a 90-second cosmetic turn clock; a unit
    that attacks fires exactly once, then locks (can't take a new move
    or attack order) until that clock's next turn. Nobody has to sit
    out the full 90s just to act again, though - the same **⏭ Skip
    Turn** button Turn-Based uses (renamed "⏭ Skip to Next Turn" here)
    ends the current clock-turn immediately on demand, via the same
    `advanceRealTimeClock()` the natural countdown itself calls when it
    runs out. Whatever ends the clock-turn - the timer or a skip -
    clears every unit's lock the same way, Gun Turrets included, since
    they share this exact mechanism now too (see the Gun Turrets bullet
    further down).
  - **Turn-Based (hot-seat)** - 2-11 people share this device. Only the
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
    turn comes back around - along with dropping any standing attack
    order it still held, so it actually sits idle-and-usable rather than
    firing again on its own the instant it unlocks (which then re-locked
    it before anyone touched anything - reported as "the user's troops
    are still locked" every time their turn came back around). A move
    order is left alone across turns, since a unit can legitimately take
    several turns to reach a far destination.
- **Team select** - shown before every match, for every player. You're
  always Team A; every other faction gets a real team-letter picker (one
  letter per faction that exists, up to 11 with 10 computer players -
  Team A through Team K), not a fixed two-side A/B toggle. Two factions
  sharing a letter fight together; any other letter is its own
  independent side - so 10 computer players can genuinely be Teams A-J,
  a real free-for-all, not always forced into exactly two sides (which
  used to mean a multi-faction Turn-Based match could only ever be
  lopsided team-vs-team, never a true free-for-all). Real-Time defaults
  everyone to Team B (the existing
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
  actually playing right there. Every computer player also gets an
  **"In match"** checkbox, checked by default - unchecking one leaves
  that computer player out of this particular playthrough entirely
  (its other controls on that row gray out and disable, since there's
  nothing to pick for a faction that isn't playing) without having to
  go back into `index.html` and delete it from the map itself. An
  excluded faction gets `hp = 0` the instant Start Match is clicked,
  which is all it takes to make it behave as already-defeated
  everywhere else in this file (never drawn, never targeted, skipped by
  turn rotation and AI, already excluded from win/loss checks) - no
  separate "excluded" concept needed anywhere else. The "needs at least
  one other faction on a different team" rule only counts factions
  that are actually still in the match - excluding everyone still
  correctly blocks Start Match with the same "nothing to fight" error,
  it just doesn't count an excluded faction's team either way.
- **Real player control**: left-drag a box to select multiple units,
  click to move or attack. Issuing an order deselects automatically -
  a unit doesn't stay glued to your next click the way it used to. A
  **✕ Deselect** button (also the Escape key) clears the current
  selection too.
- **Mining ships auto-travel**: built next to your own deposit, a miner
  immediately gets a move order there on its own - no manual command
  needed - and income only flows while it's actually parked within range
  of a deposit, not just for existing somewhere on the map. That auto-
  order always targets Gold's own deposit specifically - manually
  redirecting a miner to an Additional Resource's deposit instead (see
  the "Multiple resources" bullet above) is a deliberate action a player
  takes, not something it does on its own. Its HP is
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
  Your own miners are a real click-and-box-select-able unit too now (a
  leftover exclusion had silently kept them out of both the drag-box and
  single-click selection paths, so a player had no way to manually
  redirect one at all - only the auto-order-on-build ever moved it,
  reported once Gold's deposit could be placed somewhere other than
  right next to base, where a miner stuck on a bad path actually needed
  manual rerouting). Selecting one and giving a move/attack order works
  exactly like any other unit from here.
- **Resource placement** (index.html's Resource & Mining section, item
  3a): every resource defaults to a deposit/marker next to each faction's
  own home base, same as always. A resource placed "on the map" instead
  can have **any number of locations** for the whole match, each stored
  as a fraction of the map's background art and converted here into a
  real world position once this match's actual home-base layout (and so
  its world bounding box, same one the background art itself cover-fits)
  is known. For Gold, each placed point is a real, distinct shared
  deposit - every faction's Mining Ships, including AI, auto-order toward
  whichever one is nearest the moment they're built (`nearestDeposit()`),
  and can be manually redirected to any other one afterward; income
  actually flows for a miner parked within range of *any* placed deposit,
  not just the one it was first sent to (the income loop checks
  `deposits.some(...)` instead of a single entry once Gold is placed this
  way). An Additional Resource placed with several points just draws one
  shared marker per point instead of one per faction - it was never
  anything but a visual marker either way, so more points there are
  purely decorative.
- Every attack draws a **weapon effect** picked per unit (a **Weapon**
  dropdown on each unit/turret row in `index.html`, 26 options - defaults
  to Laser, so any map saved before this field existed keeps its
  original beam with no change). Purely cosmetic - it only changes what
  gets drawn, never damage, range, or attack timing, which all still
  happen the instant the target's in range same as before. All 26 are
  drawn entirely with canvas shapes (`drawEffects()` in `play.html`) -
  none of them need or use an uploaded image, same as the original laser
  never did; only the unit's own sprite is art you provide. Every type
  still uses the same per-unit-type color as before (an 8-color palette,
  repeating past 8 unit types) - none of these hardcode their own color
  (no "orange" flamethrower, no "green" poison) so that stays true.
  The original six: Laser (the original full beam), Bullet (a short
  tracer near the target only), Explosion (a burst at the impact point,
  no travel line), Missile (a thicker trail plus an Explosion burst on
  arrival), Arrow (a small triangle arrowhead angled toward its
  direction of travel), Melee Slash (a short arc at the target, nothing
  traveling). Ten more: Flamethrower (a flickering, re-randomized-every-
  frame spray of dots widening toward the target - the one effect that's
  deliberately noisy instead of stable), Lightning Bolt (a jagged path,
  computed once per shot - see `jaggedPoints()` - not per frame, so the
  bolt doesn't visibly reshape itself while it's on screen), Poison
  Spray (a splash blob with a few drip particles at the impact point),
  Ice Shard (a thin travel line plus a 5-point crystal-spike burst on
  arrival), Railgun (an ultra-thin line with a bright flash circle at
  both the origin and the impact point), Grenade Toss (a dashed
  quadratic-curve arc bowed upward - "thrown," not "shot" - plus a burst
  on landing), Shockwave (two concentric rings expanding from the
  impact point on a staggered delay, no travel line), Cannonball (a
  single heavy dot that travels then bursts into a small dust-puff ring
  on arrival), Javelin (like Arrow but a longer shaft and a diamond
  head, reading as a heavier thrown weapon), Whip (a quadratic curve
  bowed sideways rather than upward - a lash, not a lob; its dropdown
  icon was originally 🪢, a 2020-era emoji many fonts - Windows
  especially - have no glyph for, so it showed as a blank box; now
  〰️, one of the oldest and most universally-supported emoji there
  is). Ten more again: Meteor Strike (Grenade's arc-plus-growing-circle
  approach, but steeper and undashed - falling from the sky, not lobbed
  sideways), Tornado (stationary at the target - 3 partial rings at
  growing radius, each rotating at its own offset, unlike any
  travel-based effect), Sonic Boom (a directional blast wave at the
  target facing back toward the shooter, unlike Shockwave's
  omnidirectional rings), Chain Whip (Whip's single lash curve stretched
  into several sideways wobbles - a longer, snakier cousin), Sniper Shot
  (a hairline beam thinner than Laser's, plus a crosshair reticle on
  impact instead of a blob/burst), Plasma Ball (a traveling orb with a
  soft, dimmer outer glow under its solid core, unlike Cannonball's
  plain dot), Net Toss (an expanding ring with a few crossing chords
  through it, reading as mesh instead of Shockwave's plain rings), Void
  Blast (shrinks and pulls short radiating lines inward as it ages - the
  opposite of Explosion's outward-growing burst), Grapple Hook (a plain
  travel line like Railgun's, but a two-pronged curved hook at the tip
  instead of a flash-circle or arrowhead), Nail Gun (3 near-parallel
  tracers with a slight spread instead of Bullet's single tracer, reading
  as an automatic burst).
- Units rotate to face their actual direction of travel - per-unit now,
  via a "Rotate to face movement direction" checkbox on every combat
  unit row in `index.html` (on by default, so existing maps look
  unchanged). Turning it off for a given unit skips the rotation at
  draw time only - it still tracks a real facing angle underneath, the
  sprite just never turns to match - for art drawn facing one fixed way
  (infantry/army-men sprites) that otherwise looks like it's flying
  sideways instead of walking once rotated toward diagonal movement.
  Only combat units (the legacy list and all four gated-building unit
  lists) got this checkbox - turrets (which rotate to face whatever
  they're aiming at, not movement, since they never move) and the
  Mining Ship weren't part of what was reported and still always rotate.
  A faction's home base art itself slowly spins in place, but only when
  the map's
  `baseLabel` field (checklist item 1's "Home Base is called a...")
  contains the word "planet" - not for Island/Base/whatever else someone
  typed there.
- A pannable camera (right-drag) with scroll-wheel zoom (centered on the
  cursor) over a world sized by the map's chosen size, and a minimap that
  both jumps the camera there on click AND, if units are selected, issues
  them a move order to that point. Also: sound on/off, pause (freezes the
  whole simulation), Save/Load to a JSON file. **Fog of war** (minimap-only
  reveal radius around a faction's own units and Home Base) is set once
  on the map itself now (`index.html`'s Fog of War checkbox, Map Basics -
  off by default) instead of a topbar button a player could flip on/off
  mid-match - it's a fixed property of the map, the same as Game Style or
  Map Size, not something to toggle while playing. The camera can't pan past
  the world's own edges any more - it used to be unclamped everywhere
  (right-drag, the minimap-click jump, scroll-zoom's cursor-pivot), so
  drifting past where the background image actually covers (see below)
  showed nothing but the render loop's own solid fallback color forever -
  reported as "the map is surrounded by black and I can scroll off into
  it" on maps whose background art was already sized correctly, since the
  black had nothing to do with the image itself.
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
- **Air Base, War Factory, Infantry Post, Helicopter Facility, Navy
  Harbor, Field Hospital** (all optional, set on the map): a
  faction-owned buildable structure that has to be built before any of
  its own units can be,
  exactly like the Mining Ship's "requires Mining Operations research"
  pattern. In the Build panel each shows as a one-time purchase ("Build"
  → "Already built"); its units show as 🔒 Locked with a "requires
  <building name>" note until that faction actually builds it - even for
  AI factions, who prioritize building whichever one they still need
  about half the time they can afford it rather than picking a random
  unit. Once built, its units queue for production instead of spawning
  instantly: clicking one starts a real countdown (its own per-unit
  production time, 10 seconds up to 120 minutes, set on the map) shown
  in TWO places, both updating live every frame, not just at the moment
  you click Queue or on some other unrelated re-render - the building's
  own build-panel row ("Producing Tank… 24s left · Queue: 2/10" - always
  showing the structure's own total occupancy out of
  `MAX_QUEUE_PER_BUILDING`, even "Queue: 0/10" while it's standing but
  idle, not just while something's actively producing) AND, since
  that was reported as easy to miss ("no live countdown, queue level only
  shown once full"), the specific unit's own row right below it too
  ("Jet ✈️ · ... · producing… 24s left · 3 in production queue (2 more
  waiting)" if several of that exact unit are queued back to back, or
  "2 in production queue (next at position 3 of 4)" if something else
  is being produced first - found by that unit's own `defIndex` actually
  appearing in the queue, not just "this building happens to be busy,"
  so an unrelated unit under the same building never falsely claims to
  be queued, and the count shown is specifically how many of THAT unit
  are active in the queue, not the building's total). A long timer shows
  as "1h 30m left" -
  `formatDuration()` switches to h/m once it's a minute or more so this
  never reads as a raw, unreadable seconds count - and the unit only
  actually appears once that timer runs out. Each building's own queue
  holds **up to `MAX_QUEUE_PER_BUILDING` (10) units at once** - every
  unit under that building live-shows "queue full (10/10)" and disables
  its own Queue button once the cap is hit, for the player and AI alike,
  until the front item finishes and the queue shortens again - this too
  updates every frame now, not just whenever the panel happens to next
  fully re-render. Only the front item of each building's queue ticks -
  so a faction with several of these
  buildings produces one unit per building at the same time, none of
  them competing for a shared timer - and like research/mining income,
  queues keep progressing regardless of whose turn it is in Turn-Based
  mode. A map with no units defined
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
- **Field Hospital's medics** - the one unit type in the whole game with
  no attack at all. Select one (or several) and click one of your own
  units to order it to heal that unit instead of issuing a move/attack
  order - walks into its own heal range first if it isn't already close
  enough, then restores its set **heal amount** to the target (capped at
  that unit's own max HP), same one-action-per-turn lock every other
  attack goes through, so "heal one unit each turn" is the exact same
  rule as "attack once per turn," not a separate cooldown system. Shows
  as a distinct green pulse (not one of the 26 combat weapon effects -
  healing shouldn't read as an attack). An AI-controlled medic picks its
  own target automatically instead of waiting for a click - whichever
  living ally is both nearest and actually still missing HP - the same
  idea as a Gun Turret auto-acquiring the nearest enemy. Heal amount
  itself is boosted by **Rapid Repair Crews** research (baked in once
  when the medic is built, same as Vessel Plating/Warp Drive's own
  HP/speed bonuses - an already-built medic doesn't retroactively get
  stronger if that research finishes later, only ones built afterward
  do) - the one research topic that used to have no in-game effect at
  all now does.
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
  Factory/Infantry Post/Helicopter Facility/Navy Harbor/Field Hospital
  and their units, Gun Turrets, and the Mining Ship are all disabled with a "requires
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
  commanding any other unit. Follows the exact same rules every other
  unit does now: frozen during another faction's turn in Turn-Based mode
  (its own faction's turn only), and one attack per turn (Turn-Based) or
  per 90s clock-turn (Real-Time), then locked until the next one, same
  `isLocked()`/`lockUnit()` every other unit goes through. This used to
  be the opposite - always-on, firing continuously on its own short
  real-time cooldown regardless of whose turn it was, specifically so it
  wouldn't sit idle defending nothing outside its owner's own turn - but
  was changed to the once-per-turn rule at the map-maker's own request.
  It's a full combat entity in the normal
  `units` array (not a decorative marker like the buildings above), so
  it can be selected, destroyed, and targeted by enemies like anything
  else. AI factions place them too, picking a random valid spot in the
  same ring instead of needing a click.
- **Missile Silo** (optional, gated building - index.html's item 4f):
  placed exactly like a Gun Turret (same ring, same arm-then-click flow,
  same speed-0/never-moves shape) but additionally requires the Missile
  Silo building itself to be built first, and never auto-targets on its
  own - a player has to click the launcher, then click an enemy, same as
  giving any other owned unit a normal attack order (no special-cased
  order-issuing code needed for this at all; an AI-controlled launcher
  still auto-acquires `nearestEnemy()` like any other AI unit). Its range
  isn't a field set on the map at all: it starts at 500 and researches up
  to 1000 then 2000 through two new Research-tab entries (Extended
  Missile Range, Long-Range Missiles), the same "tiered value driven
  entirely by research" pattern Gold's own mining rate (600→900→1200)
  already uses - `missileRange()` reads it fresh every combat tick since
  it can improve mid-match. What actually makes this different from every
  other attack in the game: firing doesn't apply damage instantly. It
  spawns a real, tracked missile (`missiles` array, drawn with its own
  uploaded art via `drawMissiles()`, separate from the stationary
  launcher's own sprite) at the launcher's position, which homes in on
  its target's *live* position every frame at the launcher's own set
  speed until it's close enough to hit - at which point it applies the
  launcher's damage and vanishes. If the target dies before the missile
  arrives, the missile is simply removed with no damage dealt and no
  retargeting - "it disappears from the screen." A missile belonging to a
  faction that isn't currently active in Turn-Based mode just holds its
  current mid-flight position, same freeze every other unit's own
  movement already gets, and continues from exactly where it left off
  once that faction's turn comes back around. Destroying a Missile Silo
  re-locks its launchers from being placed again, same as destroying any
  other gated building re-locks its own units.
- **⬇ Download as index.html** - packages the map's data inline into a
  fully standalone copy of this page. This used to only bundle the map's
  *data* (unit stats, names, etc.) while every image/sound field stayed a
  live Firebase Storage URL - the downloaded file still needed internet
  to actually render or play anything, which the claim here used to get
  wrong. Now the button itself fetches every art/sound URL the map
  actually uses (`inlineUrlsAsDataUris()` - recurses through the whole
  config generically rather than a hand-written list of fields, so a
  future field never needs adding here separately) and inlines each as a
  base64 `data:` URI before packaging, so it's genuinely a zero-network-call
  file once downloaded. The same URL reused across several units/turrets
  (a shared library asset) is only ever fetched once. The button shows
  "⬇ Preparing… N/M" while this runs (can take a few seconds for a map
  with a lot of art) and disables itself meanwhile. This does depend on
  the Storage bucket allowing cross-origin reads (CORS) from wherever
  `index.html`/`play.html` are hosted - without that, the fetch for a
  given asset fails and that one asset is quietly left as a live URL
  instead (logged to the console) rather than breaking the whole
  download, so a CORS gap degrades gracefully instead of blocking
  Download entirely. One real gap this doesn't close: `play.html`'s own
  `<script type="module">` still has static top-level `import`s of the
  Firebase SDK itself from `gstatic.com` (`firebase-app.js`,
  `firebase-firestore.js`) - those run unconditionally the instant the
  module loads, before `loadConfig()` ever gets to check
  `window.GM_INLINE_CONFIG`, so the downloaded file still needs *some*
  connectivity to reach `gstatic.com` even though it never touches this
  project's own Firebase project once open. That's a free, unrelated
  Google CDN (not billed to this project, so it doesn't affect the cost
  picture at all), but it does mean "zero network calls, period" isn't
  literally true yet for someone with no internet access at all - closing
  that gap would mean bundling the Firebase SDK itself into the
  downloaded file too, not just the map's own art/sound.
- **Titan Business Pros logo + hidden page** - a clickable logo in
  the top-left corner of the topbar (96&times;96px - 3&times; its
  original 32&times;32px size), present in every game this maker
  produces (it lives directly in `play.html`'s own markup, which is
  exactly what "⬇ Download as index.html" packages, so it rides along
  into every exported standalone game with zero extra work). Clicking it
  opens a hidden overlay - reachable only from that click, linked nowhere
  else, built as an in-page overlay rather than a real second-file
  navigation so it works identically live or in a fully offline
  downloaded copy. Content: a starfield backdrop (plain canvas, ~140
  gently twinkling dots, only animates while the page is open) behind the
  logo floating/spinning in a CSS 3D scene, a rotating galaxy and 3
  rotating planets plus 2 tumbling asteroids (real art from the After
  Earth game, resized way down before embedding), and 5 ships that fly
  around and shoot each other. The ships used to be CSS `@keyframes`
  animations but that left them visibly stuck pinned in the top-left
  corner on at least some browsers/devices - the animation just never
  took hold - so they're now driven by a canvas (`#shipBattleCanvas`,
  `initShipBattle` in `play.html`) instead: each ship drifts and bounces
  off the screen edges, and on a random cooldown fires a laser beam at a
  random other ship in its own distinct color (red/blue/yellow/green/
  pink) plus the After Earth game's own Laser.mp3 sound effect
  (base64-embedded the same way every other asset here is, respecting
  the game's sound on/off setting). Then three yes/no
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

This account also manages the **50-credit download list** - its own
section at the top of the page, a simple add/remove list of emails
(Firestore `bonusEmails/{email}`, doc id is the lowercased email itself)
feeding `index.html`'s download-credit system (see that page's "My Maps"
bullet above). Adding one here only changes what a *new* sign-in starts
with - it's read once, when that account's own credits doc is first
created, not re-checked afterward, so adding or removing an email here
doesn't retroactively change a balance someone already has.

Categories are hierarchical: **Maps** (sub-picker: **Tiny**, **Small**,
**Medium**, **Large** - `maps/<size>`, so background art actually gets
filed under the map size it was meant for instead of one flat bucket;
items uploaded under the old flat `maps` category before this change
still show up, just under "Other" rather than being sorted into a size -
they were never tagged with one), **Characters** (sub-picker:
**Space Ships**, **Navy Ships**, **Planes and Jets**, **Helicopters**,
**Infantry**, **Artillery**, **Missiles**, **Tanks** - stored as
`characters/<type>` - **Army Men** removed as its own sub-category since it was redundant
with Infantry; anything already uploaded under the old
`characters/army_men` id still shows up, just under "Other" now instead
of a named sub-category), giving the Missile Silo's own launcher/missile
art uploads (index.html item 4f) a dedicated place in the shared library
alongside every other character-art type
Picking a Maps sub-category also shows a hint line with that size's
recommended-art note (same "capped at 768px, stretched ~N× to cover the
world" info as `index.html`'s own map-size hover tooltip, just phrased
per-size instead of as a comparison table), so whoever's curating the
library sees it right where they're about to upload, not only where a
map creator sets the size.
**Worlds**, **Bases**, **Resources** (flat, no sub-picker), **Structures**
(sub-picker: **War Factory**, **Airport**, **Infantry Post**,
**Helicopter Facility**, **Research Facility**, **Gun Turret**,
**Missile Silo**, **Navy Harbor**, **Field Hospital** - `structures/<type>`), **Sounds** (sub-picker: **Background
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

## `producer.html` — "The Game Producer": combine stages into one game

Turns up to 20 separate maps (each already made and downloaded from
`index.html`'s own "⬇ Download My Game" button under My Maps - a
standalone, self-contained copy of `play.html` with that one map's data
baked in) into a single complete, playable game with its own cover art
before every stage. Linked from a blurb near the top of `index.html`'s
header, explaining the two-step workflow (make and download each stage
separately here first, then combine them there).

Google-sign-in-gated exactly like `index.html` (same Firebase project,
same accounts, same Google Identity Services flow/`authGate` pattern) -
needed because compiling now **costs 1 download credit per stage** (a
10-stage game costs 10 credits), spent from the exact same `/users/{uid}`
credits balance `index.html`'s own "⬇ Download My Game" button already
uses, admin account exempt from the charge entirely (unlimited, same
"does not affect the admin" carve-out). Since a compile can now spend
more than 1 credit at once, `firestore.rules`' `/users/{uid}` update rule
changed from "the new balance must be exactly one less" to "the new
balance must be lower, and non-negative" - still can't be increased,
skipped to negative, or spent past 0, just no longer locked to exactly
minus one. Saving a draft (below) is always free - only an actual
compile spends anything, and only once the file is fully built (a
network hiccup while checking credits shouldn't cost anything for
nothing).

**💾 Save Draft / My Producer Drafts:** a whole in-progress project
(title, ending message, every stage's name/order, and every uploaded
game file + cover image) can be saved and resumed later, mirroring
`index.html`'s own Save Draft/My Maps pattern almost exactly, down to
reusing a client-generated id in the URL (`?draft=...`) instead of
Firestore's own auto-id. Firestore collection `producerDrafts` (new -
owner-only read/write, unlike public-read `maps`, since there's no
"play a draft" use case here) stores just the metadata and Storage
download URLs, never the files themselves (a single stage's own game
file can easily be several MB, way past Firestore's 1MB-per-document
cap) - the actual files live in Storage under `producer/<uid>/<draftId>/`
(new `storage.rules` block, owner-only, 50MB/file cap - higher than
`maps`' own 15MB, since what's uploaded here is a whole already-inlined
`play.html` copy, not a single sprite). Uploads run through the same "at
most 5 in flight at once" worker-pool pattern as `index.html`'s own map
save, and only changed files are re-uploaded on a later save (an
untouched stage keeps its existing URL). Loading a draft repopulates
every field and shows each stage's game file/cover art as "already
uploaded ✓" (no local `File` object exists for it - the compile step
below fetches it back down from its Storage URL instead, exactly like a
freshly-picked one).

**Building side** (this page): three sections mirroring `index.html`'s
numbered-checklist style - (1) an optional intro title/cover art for the
very beginning of the game, (2) the stage list itself (a repeatable
row per stage, same `.unit-row`-style remove button as `index.html`'s own
unit rows, plus ↑/↓ buttons that physically move the row's DOM node
instead of re-rendering from a separate array - this matters because a
`<input type=file>`'s chosen file can't be restored programmatically
after a re-render, only preserved by keeping the same element instance),
each needing that stage's own downloaded `.html` game file (required,
either a fresh local upload or an already-saved Storage URL from a loaded
draft) and an optional cover-art image, capped at 20 stages, and (3) an
optional outro message/cover art for the very end. The one **"🎬 Take all
my maps and make a complete game"** button at the bottom reads every
stage's game file as raw text (a fresh upload via `File.text()`, an
already-saved one via `fetch(url).then(r => r.text())`), UTF-8-safe
base64-encodes it (`btoa`/`atob` only handle Latin-1, so this goes through
`TextEncoder`/`TextDecoder` and a raw byte string first - a stage's own
map name or a unit name inside it can easily contain an emoji or accented
character), reads every cover image as a data URI (again from either
source - an already-saved one is fetched back down and re-embedded, so
the compiled game stays fully offline regardless of where its art came
from), spends the credits (aborting with nothing charged if the balance
is short, same "buy 10 more" popup `index.html` already has), and stitches
all of it into one new self-contained HTML document that gets downloaded as
`index.html` (so hosting the result anywhere that serves a folder's
`index.html` by default just works) - the exact same "fetch this page's
own HTML, splice in a `<script>window.GM_INLINE_CONFIG=...</script>` before
the module script, download as a Blob" shape `index.html`/`play.html`'s own
download buttons already use, just for a hand-authored runtime instead of
`play.html` itself. Any literal `</script` sequence inside the embedded
JSON (a stage name, an ending message) is escaped (`<\/script`) before
being spliced in, or it would have prematurely closed the compiled file's
own script tag - verified by feeding a stage named `Stage Two </script>`
straight through in a real headless-browser test rather than trusting the
escaping by eye.

**The compiled/downloaded game itself** is its own small, freshly-written
runtime (not reused code from `play.html`) that walks: intro screen (with
a "▶ Start Game" button) → each stage's own cover-art screen in turn,
showing a highlighted plaque-style badge in the middle reading "Stage N
of M" (deliberately high-contrast/opaque so it stays legible over
whatever cover art a map-maker picked, matching `play.html`'s own map-name
plaque badge) plus a "▶ Start Stage" button → that stage's actual game,
loaded into an `<iframe srcdoc="...">` (the decoded, embedded copy of that
stage's downloaded HTML - fully offline, no separate file to host
alongside it). Advancing past a stage doesn't require winning it or any
specific outcome: a small persistent "Next Stage ▶" button is always
available once a stage is playing, so a foreign (non-Game-Maker) `.html`
upload never leaves the player stuck. `play.html`'s own game-over screen
additionally `postMessage`s `{type:'gm-stage-complete'}` to its parent
frame the moment a match ends (win or lose) - see its game-over handling
in the `update()` loop - which the compiled game listens for to
auto-surface a "Stage complete! Continue ▶" prompt on top of the
always-available button, for any stage actually made with this project.
After the final stage, an end screen shows the ending message/cover art
and a "⟲ Play Again From Start" button. **Worth knowing:** since every
stage's entire downloaded game (art, sound, and all) gets embedded
whole, a 20-stage compiled game can end up **very large** (tens of MB) -
fine to play locally in a browser, but worth keeping in mind before
trying to host or email it anywhere with its own size limit.

## `functions/` — the Stripe webhook

The only backend code in this project (everything else is static
HTML/JS/Firebase rules) - a single Cloud Function, `stripeWebhook`, that
grants 10 download credits after a real $5 Stripe payment. Deployed via
`firebase deploy --only functions`; live at
`https://us-central1-game-maker-ed014.cloudfunctions.net/stripeWebhook`
(2nd-gen functions also get a `*.run.app` URL - both resolve to the same
function; the `cloudfunctions.net` one is what's registered in Stripe),
registered in the Stripe Dashboard as this Payment Link's webhook
endpoint, listening for **two** events: `checkout.session.completed`
*and* `checkout.session.async_payment_succeeded`. Both are needed, not
just the first - instant payment methods (cards) are already `paid` by
the time `completed` fires, but delayed-confirmation methods (bank
debits, some buy-now-pay-later options) fire `completed` first with
`payment_status: 'unpaid'`, then the actual paid confirmation arrives
later as the separate `async_payment_succeeded` event. Listening for
`completed` alone would silently never grant credits for any payment
method that doesn't confirm instantly.

What it actually does, in order: (1) verifies the request's
`stripe-signature` header against `STRIPE_WEBHOOK_SECRET` (a Firebase
Functions secret, set via `firebase functions:secrets:set
STRIPE_WEBHOOK_SECRET` and never committed to this repo - the actual
security boundary, since without it anyone could POST a fake "payment
succeeded" body at this URL) - this needs the *raw* request body, which
Firebase Functions preserves as `req.rawBody` specifically for this; (2)
ignores anything that isn't one of those two event types with
`payment_status: 'paid'`; (3)
reads `session.client_reference_id` (the Firebase uid `index.html`'s
buy-credits popup appends to the payment link) to know which account to
credit - if it's missing, the event is acknowledged but logged for
manual follow-up rather than silently dropped or endlessly retried; (4)
checks a `processedStripeSessions/{sessionId}` doc inside a transaction
before granting anything, so a Stripe retry of the same event (which
does happen) can't double-grant credits for one payment; (5) increments
`users/{uid}.credits` by exactly 10 using the Admin SDK (`FieldValue.increment`,
inside the same transaction) - this is the one piece of this whole
project that's allowed to *increase* a credits balance, because
`firestore.rules` can't (and shouldn't) trust a client to report its own
payment, and the Admin SDK bypasses those rules entirely by design.

`firebase-admin` v14 dropped the old `admin.firestore()`/`admin.initializeApp()`
namespaced API in favor of modular imports
(`require('firebase-admin/app')` / `require('firebase-admin/firestore')`)
- worth knowing since the old form doesn't error, it just silently
resolves to `undefined` and fails at runtime instead of at `require`
time, which is exactly what broke the first deploy attempt.

## Firebase project

Project: `game-maker-ed014`.

- **Authentication** — Google sign-in is *required* on `index.html`,
  `admin.html`, and `producer.html` (no more anonymous default).
  Implemented via **Google Identity Services** (`accounts.google.com/gsi/client`), not
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
  `producerDrafts/{draftId}` (The Game Producer's own saved projects) is
  owner-read/write only - no public-read case here, unlike `maps`. Two
  more collections back the download-credit system: `bonusEmails/{email}`
  (public-read, admin-only write - the 50-credit list) and `users/{uid}`
  (a signed-in user can only read/write their own doc; the actual credit
  math - correct starting value, only ever decreasing and never below 0 -
  is enforced in the rules themselves, not trusted from the client, since
  this project has no backend to enforce it any other way; the update
  rule allows decreasing by *any* amount now, not just exactly 1, since
  `producer.html` can spend several credits in one compile).
- **Storage** — `maps/{uid}/{mapId}/...` for map-specific uploads,
  `library/{category}/...` for the shared library,
  `producer/{uid}/{draftId}/...` for The Game Producer's saved drafts
  (owner-read/write only, 50MB/file cap - higher than the other two,
  since a single stage's own game file can be several MB). Same general
  read-public(-or-owner)/write-locked pattern. Its bucket also has a
  **CORS policy**
  (`cors.json` in this repo, applied via `gcloud storage buckets update
  gs://game-maker-ed014.firebasestorage.app --cors-file=cors.json` -
  Storage rules/`firebase deploy` don't cover this, it's a bucket-level
  GCS setting) allowing GET + `Content-Type` from
  `https://titanbusinesspros.github.io` - added so `play.html`'s
  "⬇ Download as index.html" button can actually `fetch()` art/sound
  bytes cross-origin to inline them as base64 (see that bullet above);
  without it every image/sound in Storage was already publicly
  viewable via `<img>`/`<audio>` (those don't need CORS), just not
  readable by JavaScript, which is what fetching-to-inline needs.
  Every upload also gets a **Cache-Control** header set explicitly
  (`public, max-age=31536000, immutable`, passed to `uploadBytes()` in
  both `index.html`'s and `admin.html`'s own `uploadOneFile()`) - Storage's
  own default for an object with no `cacheControl` metadata is `private,
  max-age=0` (checked directly against a live object's response
  headers), meaning a browser re-fetches every image/sound on every
  single play or map-edit session, from every visitor, with no reuse at
  all. A year-long cache is safe here specifically because every upload
  path already includes `Date.now()` (`maps/<uid>/<mapId>/<slot>_<ts>_
  <name>`, `library/<category>/<ts>_<name>`) - nothing is ever
  overwritten at the same URL, a re-upload just creates a new path, so a
  "never revalidate" cache can't ever go stale. The ~427 objects that
  already existed in Storage before this were backfilled the same way
  via `gcloud storage objects update gs://game-maker-ed014.firebasestorage.app/**
  --cache-control="public, max-age=31536000, immutable"` (a new
  `cacheControl` only applies to uploads made after it's set, not
  retroactively).

The web config (`apiKey` etc.) is a public client identifier, not a
secret. `firestore.rules`/`storage.rules` in this repo are deployed via
`firebase deploy --only firestore:rules,storage` (Firebase CLI, logged in
as the project owner) - not something GitHub Pages hosting does for you.

## Hosting

Static site on GitHub Pages (source = `main`, path `/`). No build step.

## License

All rights reserved by Titan Business Pros LLC - see [`LICENSE`](LICENSE).
This repo is public so the source is viewable, but that doesn't grant a
license to use it: commercial use of the code, and commercial use of any
map/game created with it (including a downloaded standalone HTML file),
both require the LICENSE file's terms - in short, personal/educational/
evaluation use only unless Titan Business Pros LLC grants a commercial
license in writing.
