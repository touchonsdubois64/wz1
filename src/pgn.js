// ==================================================
// LECTURE D'UN PGN (sans dépendance au navigateur : testable sous Node)
// ==================================================
//
// Gère : en-têtes [Tag "valeur"], [FEN], commentaires { } et ; , annotations
// $n et !?, variantes ( ), coups nuls (-- ou Z0), roques écrits avec des zéros.
// Seule la première partie du texte est lue.
// ==================================================

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

const HEADER = /\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;

/**
 * Sépare les en-têtes et le texte des coups de la première partie.
 * Fonctionne aussi quand tout le PGN tient sur une seule ligne (texte collé dans un champ).
 */
function splitGame(text) {
  let source = String(text).replace(/\r/g, '\n');

  // seconde partie : un deuxième en-tête [Event "..."] coupe le texte
  const events = [...source.matchAll(/\[\s*Event\s+"/g)];
  if (events.length > 1) source = source.slice(0, events[1].index);

  const headers = {};
  const body = source.replace(HEADER, (all, tag, value) => {
    if (!(tag in headers)) headers[tag] = value.replace(/\\(.)/g, '$1');
    return ' ';
  });

  const movetext = body
    .split('\n')
    .filter((line) => !line.trim().startsWith('%'))
    .map((line) => line.replace(/;.*$/, '')) // commentaire de fin de ligne
    .join(' ');
  return { headers, movetext };
}

const BRUSH = { R: 'red', G: 'green', B: 'blue', Y: 'yellow' };

/**
 * Contenu d'un commentaire { … } : texte à afficher + symboles dessinés.
 * Reconnaît [%cal Ga1h3,Rb2b5] (flèches) et [%csl Yd5,Re4] (cercles) ;
 * les autres commandes ([%eval], [%clk]…) sont ignorées.
 */
function parseComment(inner) {
  const shapes = [];
  const note = inner
    .replace(/\[%(cal|csl)\s+([^\]]*)\]/g, (all, kind, list) => {
      for (const item of list.split(/[\s,]+/).filter(Boolean)) {
        const match = kind === 'cal' ? /^([RGBY])([a-h][1-8])([a-h][1-8])$/.exec(item) : /^([RGBY])([a-h][1-8])$/.exec(item);
        if (!match) continue;
        const brush = BRUSH[match[1]];
        if (kind === 'cal' && match[2] !== match[3]) shapes.push({ orig: match[2], dest: match[3], brush });
        else shapes.push({ orig: match[2], brush }); // cercle
      }
      return ' ';
    })
    .replace(/\[%[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { note, shapes };
}

function tokenize(movetext) {
  return (
    movetext.match(/\{[^}]*\}|\(|\)|\$\d+|\d+\s*\.(?:\s*\.\.)?|1-0|0-1|1\/2-1\/2|\*|[^\s(){}$]+/g) || []
  );
}

function normalizeSan(token) {
  if (/^0-0-0[+#]?[?!]*$/.test(token)) return token.replace(/^0-0-0/, 'O-O-O');
  if (/^0-0[+#]?[?!]*$/.test(token)) return token.replace(/^0-0/, 'O-O');
  return token;
}

const isNullMove = (token) => /^(--|Z0|0000|@@@@)$/.test(token);

/**
 * Lit un PGN. Renvoie :
 *   { root, startFen, hasFen, endNode, moveCount, headers, title, error }
 * root est null si le texte est inutilisable ; error peut accompagner un
 * résultat partiel (les coups lus avant l'erreur sont conservés).
 */
export function parsePgn(text, Chess) {
  const { headers, movetext } = splitGame(text);

  const hasFen = typeof headers.FEN === 'string' && headers.FEN.trim() !== '';
  const startFen = hasFen ? headers.FEN.trim() : START_FEN;

  const game = new Chess();
  if (!game.load(startFen)) {
    return { root: null, error: 'FEN de l’en-tête invalide : ' + startFen, headers };
  }

  const makeNode = (parent, move) => ({
    parent,
    move,
    source: 'pgn',
    children: [],
    fen: game.fen(),
    selectedChild: null,
    comment: null,
  });

  const root = makeNode(null, null);
  let current = root; // dernière position atteinte
  let previous = null; // position précédant `current` (pour ouvrir une variante)
  const stack = [];
  let moveCount = 0;
  let error = null;

  const tokens = tokenize(movetext);

  for (const raw of tokens) {
    if (raw.startsWith('{')) {
      // commentaire : il se rattache au dernier coup joué (ou à la position de départ)
      const { note, shapes } = parseComment(raw.slice(1, -1));
      if (note) current.note = current.note ? current.note + ' ' + note : note;
      if (shapes.length > 0) current.shapes = (current.shapes || []).concat(shapes);
      continue;
    }
    if (/^\d+\s*\./.test(raw) || /^\$\d+$/.test(raw) || RESULTS.has(raw)) continue;

    if (raw === '(') {
      if (!previous) {
        error = 'Variante placée avant le premier coup : ignorée.';
        continue;
      }
      stack.push({ current, previous });
      current = previous;
      previous = current.parent;
      continue;
    }
    if (raw === ')') {
      const saved = stack.pop();
      if (saved) {
        current = saved.current;
        previous = saved.previous;
      }
      continue;
    }

    game.load(current.fen);
    let node = null;

    if (isNullMove(raw)) {
      const parts = current.fen.split(' ');
      const passing = parts[1];
      const turn = passing === 'w' ? 'b' : 'w';
      const fen = [parts[0], turn, parts[2], '-', (parseInt(parts[4], 10) || 0) + 1, (parseInt(parts[5], 10) || 1) + (passing === 'b' ? 1 : 0)].join(' ');
      if (!game.load(fen)) {
        error = 'Coup nul impossible à la position ' + current.fen;
        break;
      }
      const move = { color: passing, from: null, to: null, san: '--', promotion: null, nullMove: true };
      node = current.children.find((child) => child.move.nullMove);
      if (!node) {
        node = makeNode(current, move);
        current.children.push(node);
      }
    } else {
      const played = game.move(normalizeSan(raw), { sloppy: true });
      if (!played) {
        error = 'Coup illisible ou illégal : « ' + raw + ' » (' + (moveCount + 1) + 'ᵉ coup lu).';
        break;
      }
      const wanted = { from: played.from, to: played.to, promotion: played.promotion || null };
      node = current.children.find(
        (child) =>
          !child.move.nullMove &&
          child.move.from === wanted.from &&
          child.move.to === wanted.to &&
          (child.move.promotion || null) === wanted.promotion,
      );
      if (!node) {
        node = makeNode(current, {
          color: played.color,
          from: played.from,
          to: played.to,
          san: played.san,
          promotion: played.promotion || null,
          nullMove: false,
        });
        current.children.push(node);
        if (game.game_over()) {
          node.comment = game.in_checkmate()
            ? 'Mat'
            : game.in_stalemate()
              ? 'Pat'
              : game.insufficient_material()
                ? 'Nulle - Matériel'
                : game.in_threefold_repetition()
                  ? 'Nulle - Répétition'
                  : 'Nulle - 50 coups';
        }
      }
    }

    moveCount++;
    previous = current;
    current = node;
  }

  if (moveCount === 0 && !hasFen) {
    return { root: null, error: error || 'Aucun coup reconnu dans ce PGN.', headers };
  }

  // fin de la ligne principale
  let endNode = root;
  while (endNode.children.length > 0) endNode = endNode.children[0];

  const meaningful = (value) => value && value !== '?' && value !== 'Winning Zone';
  let title = meaningful(headers.Event) ? headers.Event : null;
  if (!title && meaningful(headers.White) && meaningful(headers.Black)) title = headers.White + ' – ' + headers.Black;

  return { root, startFen: root.fen, hasFen, endNode, moveCount, headers, title, error };
}
