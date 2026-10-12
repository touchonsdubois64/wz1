# Winning Zone

Interface d'entraînement aux finales, dérivée de cc2.

    npm install
    npm run dev      # développement
    npm run build    # site statique dans docs/ (comme cc2), à publier avec GitHub Pages
    npm test         # tests unitaires des fonctions FEN

Fichiers : `src/app.js` (interface), `src/fen.js` (FEN, translation, validation),
`src/tablebase.js` (tables Lichess), `src/engine.js` (Stockfish), `src/style.css`.

## Bibliothèque de positions

Le menu « dossier » (au-dessus du champ FEN) est alimenté par `src/positions.js` :
les explications et un exemple se trouvent en tête de ce fichier.

## Publication (GitHub Pages)

`positions.js` est compilé *dans* le site : une modification n'apparaît en ligne
qu'après `npm run build`, puis commit + push de **tout** le dossier `docs`
(y compris les nouveaux fichiers de `docs/assets`). `npm run dev` lit au contraire
le fichier source directement, d'où la différence entre la version locale et la version en ligne.
