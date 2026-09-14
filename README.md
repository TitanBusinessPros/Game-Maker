# Game-Maker

A single-file, browser-based **map creator**. No build step, no server —
`index.html` is a checklist that uploads your own art/sound and saves a
finished map config to Firebase. Open it directly in a browser, or host it
on GitHub Pages.

This is step one of a larger goal: letting people re-skin a strategy-game
engine (same HP/attack/range/speed/cost combat math, same "homeworld +
nearby resource deposit + mining unit" mechanics) as anything from a space
game to a navy game just by swapping art and names. Right now this repo
only builds and saves the **map data** — it doesn't run the game itself yet.

## What the checklist covers

1. **Map basics** — name, and what to call a homeworld (Planet/Island/Base/etc).
2. **Good guys & bad guys** — faction name, color, and homeworld art for each side.
3. **Resource & mining** — the deposit every homeworld gets nearby (name, size,
   art) and the unit that drains it (name, income/hour, art).
4. **Combat units** — add as many as you want. Each one has the same stat
   fields the underlying engine uses: HP, attack, range, speed, build cost.
5. **Sounds** — background music, intro music, attack sfx, building-destroyed
   sfx, homeworld-under-attack sfx, game-over sfx. All optional, all `.mp3`.
6. **My Maps** — every map you've saved from this browser (anonymous
   Firebase Auth), as a draft or finished, with Open/Delete.

**Save Draft** saves whatever's filled in so far and gives the page a
`?map=<id>` link you can return to later. **Finish & Save** checks the
required items (both homeworld arts, resource art, mining unit art, at
least one combat unit with art) and marks the map complete — if anything's
still missing it falls back to saving as a draft and tells you what's left.

## Firebase project

Project: `game-maker-ed014`. Uses:

- **Authentication** — Anonymous sign-in only, so uploads/saves can be tied
  to a browser without requiring an account.
- **Firestore** — one `maps/{mapId}` document per map (metadata + asset
  download URLs, not the files themselves).
- **Storage** — the actual uploaded images/mp3s, under
  `maps/{uid}/{mapId}/...`.

The web config in `index.html` (`apiKey`, etc.) is a public client
identifier, not a secret — it's meant to be visible in browser JS. Actual
access control lives in the security rules below, which need to be pasted
into the Firebase console (they aren't deployed automatically by this repo):

- `firestore.rules` → Firestore Database → Rules
- `storage.rules` → Storage → Rules

## Hosting

Static site, same pattern as `The-Universe-Game`: enable GitHub Pages on
this repo (source = `main`, path `/`), no build step required.
