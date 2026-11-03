# Penrose Puzzle

A tile placement puzzle played with Penrose kite and dart tiles.

This project was seeded from the `original-game` branch of [Penrogo](https://github.com/dblevins-3dgfx/penrogo), a two-player territory game. Its code is still here as a starting point (`penrose-territory.tsx`, described in `penrose-territory-spec.md`) and will be replaced as Penrose Puzzle takes shape.

## Running

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The dev server also listens on your local network, so you can play from a phone or tablet at the network address Vite prints.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Run the TypeScript checker |

## Layout

- `penrose-territory.tsx`: the inherited Penrogo game, a single React component
- `src/main.tsx`, `src/index.css`, `index.html`: Vite entry point and Tailwind setup
