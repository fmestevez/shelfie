# Contributing to Shelfie

Thanks for helping! Bug reports, ideas, new shelf models and code are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and suggesting features

Open an issue at https://github.com/fmestevez/shelfie/issues. For packing or sorting bugs, a share link (the **Share** button) reproduces your exact collection and settings and is the most useful thing you can include.

## Development setup

You need Node.js 20.9+ and a BoardGameGeek API token (register an app at https://boardgamegeek.com/applications).

```bash
git clone https://github.com/fmestevez/shelfie.git
cd shelfie
cp .env.example .env.local   # paste your BGG token
npm install
npm run dev
```

Or click **"or try a demo collection"** to work on the 3D scene without a token.

## Where things live

| Path | What it does |
|---|---|
| `src/lib/bgg.ts` | BGG XML API calls and parsing (server only) |
| `src/app/api/` | Route handlers: collection, game details, versions, search, image proxy |
| `src/lib/sorting.ts` | Areas, sort keys, colour buckets, expansions-after-base |
| `src/lib/packing.ts` | The packer: compartments, rows, gravity, no-squash rule, overflow |
| `src/lib/shelves.ts` | Shelf models (IKEA dimensions) |
| `src/lib/share.ts` | Share-link encoding |
| `src/components/three/` | three.js scene (React Three Fiber) |

### Adding a shelf model

Add an entry to `SHELF_MODELS` in `src/lib/shelves.ts`. A model's `build()` returns its panels (for rendering) and its compartments in reading order (top row first, left to right), all in centimetres, with z = 0 at the back.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep changes focused; match the style of the surrounding code.
3. Make sure these pass:
   ```bash
   npm run lint
   npm run build
   ```
4. If you change packing or sorting, include a share link (or before/after screenshots) showing the effect.
5. Open the PR with a short description of what changed and why.

## Licence

Shelfie is licensed under the [GNU General Public License v3.0](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
