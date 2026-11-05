# Shelfie

See your [BoardGameGeek](https://boardgamegeek.com) collection packed onto real shelves, in 3D.

Enter a BGG username and Shelfie fetches the games you own, works out each box's size, and packs them onto IKEA Kallax and Billy shelves as tightly or as neatly as you like.

**Production URL:** https://shelfie.theboardgamesfamily.com (once deployed, see [Deploying to Vercel](#deploying-to-vercel))

## Features

- **Your real collection:** owned games from BGG, with box art used as textures.
- **Box sizes:**
  - the version you selected on BGG, otherwise the earliest-released version, otherwise any version that lists a size, otherwise 30 × 21 × 7 cm;
  - you can pick another version or type a custom size for any game.
- **Shelves:** Kallax 5×5, 4×4, 2×4 and 1×4; Billy and Billy deep (with adjustable compartments). Any mix and count, in white, black-brown or oak.
- **Custom shelves:** enter your own outer size, a grid of columns × rows, board thickness, plinth height and back panel; Shelfie shows the compartment size as you type.
- **Sorting in two levels:**
  - **Areas** (e.g. BGG game type: Wargames, Strategy, Family…), optionally starting each area in a new compartment;
  - **then** theme, mechanic, designer, publisher, series, colour, box size, year, complexity, rating or name;
  - either level can be reversed;
  - expansions sit right after their base game.
- **Packing:**
  - **Orientation:** upright, stacked flat, or mixed;
  - **covers:** upright covers can face left or right;
  - **small boxes:** they can stand or lie on top of bigger ones, but a box never rests on a smaller box;
  - **depth:** optional rows behind rows;
  - **front edge:** a slider from "may stick out" to "pushed to the back";
  - **order vs. space:** a slider for how many games may jump ahead to fill gaps.
- **Modes:**
  - **Auto:** Shelfie packs everything;
  - **Physics:** the packed shelves become rigid bodies (Rapier) that you can grab, move and throw;
  - **Manual:** every game starts in piles on the floor and you drag each box onto the shelves. A box slides into the compartment under the pointer until it meets the back or another box; R / T (or the card's buttons) turn it or stand it up. Positions are saved in the browser.
- **Overflow:** stacked on top of the shelves, piled on the floor beside them, or both.
- **Your edits:** remove games, or add games that aren't in your collection (BGG search).
- **Rooms:** living room, brick loft, game café, white gallery, garden.
- **Box faces:** switch box art and titles on or off independently.
- **Camera:** drag to orbit and scroll to zoom, or use the on-screen pad (orbit, tilt, zoom, pan, fit), which works on phones too.
- **Image export:** the current view at 2× resolution, or the whole collection framed front-on (up to 4096 px).
- **Share links:** one link carries the collection, every setting and your edits.

## Running locally

Requires Node.js 20.9+ and a BGG API token. BGG's XML API needs one: register an application at https://boardgamegeek.com/applications.

```bash
cp .env.example .env.local   # paste your token into BGG_API_KEY
npm install
npm run dev
```

The token never reaches the browser; the client only talks to the app's own `/api/*` routes. Without a token, the demo collection still works.

## Deploying to Vercel

The repo is ready for Vercel (`vercel.ts` holds the project config).

1. **Create the project:**
   - **Dashboard:** go to [vercel.com/new](https://vercel.com/new) and import `fmestevez/shelfie`;
   - **CLI:** run `npm i -g vercel@latest`, then `vercel link`.
2. **Add the BGG token** for Production and Preview:
   ```bash
   vercel env add BGG_API_KEY production
   vercel env add BGG_API_KEY preview
   ```
3. **Deploy:** push to `main` (with the Git integration) or run `vercel --prod`.
4. **Add the domain:**
   ```bash
   vercel domains add shelfie.theboardgamesfamily.com
   ```
   At your DNS provider for `theboardgamesfamily.com`, create a `CNAME` record pointing `shelfie` to `cname.vercel-dns.com`. Vercel issues the HTTPS certificate once DNS resolves. The dashboard (Project → Settings → Domains) shows the exact record it expects.

`NEXT_PUBLIC_SITE_URL` is optional. It sets the URL used in link previews and defaults to the production domain.

## How it works

- `src/lib/bgg.ts` with `src/app/api/bgg/*` fetch:
  - the collection (`own=1&version=1`, retried while BGG answers 202);
  - game details (domains, categories, mechanics, base games for expansions);
  - versions, ordered by release year;
  - search results.

  Game details, versions and search results are cached with `use cache`.
- `src/app/api/img` proxies `cf.geekdo-images.com` so box art can be used in WebGL and analysed for colour.
- `src/lib/sorting.ts` builds the order: areas, then groups, with expansions after their base game.
- `src/lib/packing.ts` fills each compartment greedily, in reading order:
  - each row of boxes is packed as a 2D free-space layout with gravity, and a box must rest at least 60% on boxes no smaller than itself;
  - several strategies are tried per compartment and the one that fits the most wins;
  - games that don't fit go to the overflow areas.
- `src/components/three/PhysicsWorld.tsx` runs physics and manual modes with `@react-three/rapier`, loaded only when one of them is switched on.
- `src/components/three/` renders the scene with React Three Fiber:
  - spines are generated from the title over a band of box art;
  - colours come from the most prominent hue of each cover.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence

[GNU General Public License v3.0](LICENSE).

Board game data and images come from [BoardGameGeek](https://boardgamegeek.com) and belong to their respective owners. Shelfie isn't affiliated with BGG or IKEA; "Kallax" and "Billy" are IKEA product names, used only to describe the shelf dimensions.
