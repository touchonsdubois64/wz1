# Winning Zone

Interface d'entraînement aux finales, dérivée de cc2.

    npm install
    npm run dev      # développement
    npm run build    # site statique dans dist/ (base "./", hébergeable partout)
    npm test         # tests unitaires des fonctions FEN

Fichiers : `src/app.js` (interface), `src/fen.js` (FEN, translation, validation),
`src/tablebase.js` (tables Lichess), `src/engine.js` (Stockfish), `src/style.css`.

## Bibliothèque de positions

Le menu « dossier » (au-dessus du champ FEN) est alimenté par `src/positions.js` :
les explications et un exemple se trouvent en tête de ce fichier.
