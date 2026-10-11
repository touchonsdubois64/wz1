// ==================================================
// WINNING ZONE — application
// ==================================================
//
// Reprend de cc2 : Chessground + chess.js, arbre de coups avec variantes,
// Stockfish (force maximale), tables de finales Lichess, notation
// (français / figurines / international), export PGN.
//
// Nouveautés : édition de la position (FEN ou glisser-déposer), translation,
// boutons Play / Start, panneau d'évaluation avec coups des tables et
// « Winning Zone » (cases vertes / jaunes / roses).
// ==================================================

import { Chessground } from '@lichess-org/chessground';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.brown.css';
import { Chess } from 'chess.js';

import './style.css';
import {
  EMPTY_PLACEMENT,
  buildFen,
  canShift,
  gridToPlacement,
  parseFen,
  placementToGrid,
  sanitizeCastling,
  shiftGrid,
  validateStructure,
} from './fen.js';
import { Engine, depthFromInfo, evaluationFromInfo } from './engine.js';
import { annotateMoves, getMainlineMate, getTablebase, isCovered, mateText } from './tablebase.js';

// ==================================================
// OUTILS
// ==================================================

const $ = (selector) => document.querySelector(selector);
const asset = (path) => new URL(path, document.baseURI).href;
const escapeHtml = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const boardElement = $('#board');
const fenInput = $('#fen');
const messageElement = $('#message');
const statusElement = $('#status');
const movesElement = $('#moves');
const evalHead = $('#eval-head');
const evalMoves = $('#eval-moves');
const evalPill = $('#eval-pill');
const zoneButton = $('#zone');
const zoneLayer = $('#zone-layer');
const startButtons = { w: $('#start-white'), b: $('#start-black') };

const ROLE_LETTER = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };

// Les images des pièces sont injectées ici afin que leurs chemins restent
// valides quel que soit l'endroit où le site est hébergé.
(function injectPieceImages() {
  const rules = [];
  for (const color of ['white', 'black']) {
    for (const [role, letter] of Object.entries(ROLE_LETTER)) {
      const url = asset('pieces/alpha/' + color[0] + letter + '.svg');
      rules.push(`#board piece.${color}.${role} { background-image: url('${url}') !important; }`);
    }
  }
  rules.push('#board piece { background-size: contain !important; background-repeat: no-repeat !important; background-position: center !important; }');
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
})();

// ==================================================
// ÉTAT
// ==================================================

const game = new Chess();

let locked = false; // false : position éditable — true : partie en cours
let playerSide = 'white'; // 'white' | 'black' | 'analysis'
let startTurn = null; // 'w' | 'b' (camp au trait choisi avec Start)

let editMeta = { turn: 'w', castling: '-', half: 0, full: 1 };

let currentStartFen = '';
let rootNode = null;
let currentNode = null;

let thinking = false;
let pendingPromotion = null;
let moveToken = 0; // invalide les calculs de Stockfish devenus obsolètes
let evalId = 0; // invalide les évaluations devenues obsolètes

let evalOn = false;
let zoneOn = false;
let zoneSig = '';
let tbList = null; // dernière liste de coups des tables, pour réaffichage

const engine = new Engine(asset('stockfish/stockfish-18-lite-single.js'));

// ==================================================
// ÉCHIQUIER
// ==================================================

const ground = Chessground(boardElement, {
  fen: EMPTY_PLACEMENT,
  orientation: 'white',
  coordinates: false,
  animation: { duration: 150 },
  highlight: { lastMove: false, check: false },
  premovable: { enabled: false },
  // Mode édition : pièces librement déplaçables, suppression hors de l'échiquier
  movable: { free: true, color: 'both', showDests: false, events: { after: onAfterMove } },
  draggable: { enabled: true, deleteOnDropOff: true },
  selectable: { enabled: false },
  events: { change: onBoardChange },
});

const refreshGeometry = () => ground.redrawAll();
new ResizeObserver(refreshGeometry).observe(boardElement);
window.addEventListener('resize', refreshGeometry);
window.addEventListener('load', refreshGeometry);

function onAfterMove(orig, dest) {
  if (!locked) {
    onBoardChange();
    return;
  }
  playerMove(orig, dest);
}

function onBoardChange() {
  if (locked) return;
  syncEditorFen();
  updateShiftButtons();
}

// ==================================================
// MESSAGES
// ==================================================

let messageTimer = null;

function showMessage(text, kind = 'error') {
  messageElement.textContent = text;
  messageElement.className = 'message' + (kind === 'info' ? ' info' : '');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(hideMessage, 6000);
}

function hideMessage() {
  messageElement.textContent = '';
}

function setStatus(text) {
  statusElement.textContent = text;
}

// ==================================================
// COORDONNÉES ET INDICATEURS DU TRAIT
// ==================================================

function updateCoordinates() {
  const white = ground.state.orientation === 'white';
  const ranks = white ? '87654321' : '12345678';
  const files = white ? 'abcdefgh' : 'hgfedcba';
  $('.rank-labels').innerHTML = [...ranks].map((c) => `<span>${c}</span>`).join('');
  $('.file-labels').innerHTML = [...files].map((c) => `<span>${c}</span>`).join('');
}

function updateTurnIndicators() {
  const whiteCircle = $('#turn-white');
  const blackCircle = $('#turn-black');
  const flipped = ground.state.orientation === 'black';

  whiteCircle.className = 'turn-circle white-circle ' + (flipped ? 'at-top' : 'at-bottom');
  blackCircle.className = 'turn-circle black-circle ' + (flipped ? 'at-bottom' : 'at-top');

  if (!locked) return;
  (game.turn() === 'w' ? whiteCircle : blackCircle).classList.add('active');
}

// ==================================================
// ÉDITION : PALETTE DE FIGURINES
// ==================================================

const PALETTE = ['white', 'black'].flatMap((color) =>
  ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].map((role) => ({ color, role })),
);

const ROLE_NAME = { king: 'Roi', queen: 'Dame', rook: 'Tour', bishop: 'Fou', knight: 'Cavalier', pawn: 'Pion' };

function buildPalette() {
  const palette = $('#palette');
  for (const entry of PALETTE) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'piece';
    const image = document.createElement('img');
    image.src = asset('pieces/alpha/' + entry.color[0] + ROLE_LETTER[entry.role] + '.svg');
    image.alt = '';
    image.draggable = false;
    button.appendChild(image);
    button.title = ROLE_NAME[entry.role] + (entry.color === 'white' ? ' blanc' : ' noir') + ' — glisser sur l’échiquier';
    button.setAttribute('aria-label', button.title);

    const piece = { color: entry.color, role: entry.role };
    button.addEventListener('pointerdown', (event) => {
      palettePress = { button, piece, x: event.clientX, y: event.clientY };
    });
    button.addEventListener('mousedown', (event) => {
      if (locked || event.button !== 0) return;
      event.preventDefault();
      ground.dragNewPiece(piece, event, true);
    });
    button.addEventListener(
      'touchstart',
      (event) => {
        if (locked) return;
        event.preventDefault();
        ground.dragNewPiece(piece, event, true);
      },
      { passive: false },
    );
    palette.appendChild(button);
  }
}

// ==================================================
// ÉDITION : CLICS (sélection d'une figurine, cycle blanc → noir → vide)
// ==================================================
//
// • Clic sur une figurine de la palette, puis clic sur une case : dépôt.
// • Ensuite, chaque clic sur la case fait passer la pièce de blanche à noire,
//   puis à « rien », puis de nouveau à blanche, etc. (même type de pièce).
// Un simple clic se distingue d'un glisser-déposer par la distance parcourue.
// ==================================================

let pressed = null; // appui en cours sur l'échiquier
let palettePress = null; // appui en cours sur la palette
let armed = null; // figurine sélectionnée dans la palette : { button, piece }
let cycleMemory = null; // dernière case du cycle : { key, role }

function keyAtPoint(x, y) {
  const rect = boardElement.getBoundingClientRect();
  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return null;
  let file = Math.floor((8 * (x - rect.left)) / rect.width);
  let rank = 7 - Math.floor((8 * (y - rect.top)) / rect.height);
  if (ground.state.orientation === 'black') {
    file = 7 - file;
    rank = 7 - rank;
  }
  return 'abcdefgh'[file] + (rank + 1);
}

function disarm() {
  if (armed) armed.button.classList.remove('armed');
  armed = null;
  document.body.classList.remove('armed');
}

function arm(button, piece) {
  const same = armed && armed.button === button;
  disarm();
  if (same) return; // un second clic sur la même figurine l'abandonne
  armed = { button, piece };
  button.classList.add('armed');
  document.body.classList.add('armed');
}

boardElement.addEventListener(
  'pointerdown',
  (event) => {
    pressed = null;
    if (locked || event.button > 0) return;
    const key = keyAtPoint(event.clientX, event.clientY);
    if (!key) return;
    const piece = ground.state.pieces.get(key);
    pressed = { key, piece: piece ? { color: piece.color, role: piece.role } : null, x: event.clientX, y: event.clientY };
  },
  true,
);

document.addEventListener('pointerup', (event) => {
  const board = pressed;
  const palette = palettePress;
  pressed = null;
  palettePress = null;
  if (locked) return;

  if (palette) {
    const there = document.elementFromPoint(event.clientX, event.clientY);
    const moved = Math.hypot(event.clientX - palette.x, event.clientY - palette.y) > 6;
    if (!moved && there && palette.button.contains(there)) arm(palette.button, palette.piece);
    return;
  }

  if (!board) return;
  if (Math.hypot(event.clientX - board.x, event.clientY - board.y) > 6) return;
  if (keyAtPoint(event.clientX, event.clientY) !== board.key) return;
  // on laisse Chessground terminer son propre traitement du clic
  setTimeout(() => boardClick(board), 0);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') disarm();
});

function boardClick({ key, piece }) {
  const current = ground.state.pieces.get(key);

  if (armed) {
    const { color, role } = armed.piece;
    ground.setPieces(new Map([[key, { color, role }]]));
    cycleMemory = { key, role };
    disarm();
    onBoardChange();
    return;
  }

  if (current) {
    // la pièce a-t-elle été déplacée entre l'appui et le relâchement ?
    if (!piece || current.color !== piece.color || current.role !== piece.role) return;
    cycleMemory = { key, role: current.role };
    ground.setPieces(
      new Map([[key, current.color === 'white' ? { color: 'black', role: current.role } : undefined]]),
    );
    onBoardChange();
    return;
  }

  // case vide : si elle vient d'être vidée par le cycle, on y remet la pièce blanche
  if (!piece && cycleMemory && cycleMemory.key === key) {
    ground.setPieces(new Map([[key, { color: 'white', role: cycleMemory.role }]]));
    onBoardChange();
  }
}

// ==================================================
// ÉDITION : TRANSLATION DE LA POSITION
// ==================================================

const SHIFT_VECTORS = {
  // (dx, dy) en cases : dy > 0 = vers la rangée 8. Les flèches suivent l'écran,
  // donc le sens s'inverse quand l'échiquier est retourné.
  up: (o) => [0, o],
  down: (o) => [0, -o],
  left: (o) => [-o, 0],
  right: (o) => [o, 0],
};

function shiftVector(direction) {
  const orientation = ground.state.orientation === 'white' ? 1 : -1;
  return SHIFT_VECTORS[direction](orientation);
}

function updateShiftButtons() {
  const grid = placementToGrid(ground.getFen());
  document.querySelectorAll('.shift-btn').forEach((button) => {
    const [dx, dy] = shiftVector(button.dataset.dir);
    button.disabled = locked || !grid || !canShift(grid, dx, dy);
  });
}

function shiftPosition(direction) {
  if (locked) return;
  const grid = placementToGrid(ground.getFen());
  const [dx, dy] = shiftVector(direction);
  const shifted = grid && shiftGrid(grid, dx, dy);
  if (!shifted) return;
  ground.set({ fen: gridToPlacement(shifted) });
  cycleMemory = null;
  onBoardChange();
}

// ==================================================
// ÉDITION : CHAMP FEN
// ==================================================

function syncEditorFen() {
  const placement = ground.getFen();
  const grid = placementToGrid(placement);
  const castling = grid ? sanitizeCastling(grid, editMeta.castling) : '-';
  fenInput.value = buildFen(placement, editMeta.turn, castling, editMeta.half, editMeta.full);
  fenInput.classList.remove('invalid');
}

function applyFenField() {
  const text = fenInput.value.trim();
  if (!text) {
    fenInput.classList.remove('invalid');
    return;
  }

  if (locked && text === game.fen()) return; // rien n'a changé : on reste en partie

  const parsed = parseFen(text);
  if (!parsed) {
    fenInput.classList.add('invalid');
    showMessage('Ce code FEN n’est pas reconnu.');
    return;
  }

  hideMessage();
  if (locked) leaveGame();

  const grid = placementToGrid(parsed.placement);
  editMeta = {
    turn: parsed.turn,
    castling: sanitizeCastling(grid, parsed.castling),
    half: parsed.half,
    full: parsed.full,
  };

  ground.set({ fen: parsed.placement });
  cycleMemory = null;
  syncEditorFen();
  updateShiftButtons();
}

fenInput.addEventListener('change', applyFenField);
fenInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') applyFenField();
});
fenInput.addEventListener('paste', () => setTimeout(applyFenField, 0));

// ==================================================
// START : FIGER LA POSITION / REVENIR À L'ÉDITION
// ==================================================

/** Contrôle de légalité : le camp qui n'a pas le trait ne doit pas être en échec. */
function legalityError(placement, turn) {
  const other = turn === 'w' ? 'b' : 'w';
  const probe = new Chess();
  if (!probe.load(buildFen(placement, other))) return 'Cette position n’est pas valide.';
  if (probe.in_check()) {
    return 'Position illégale : le camp qui n’a pas le trait est en échec.';
  }
  return null;
}

function updateStartButtons() {
  for (const turn of ['w', 'b']) {
    const active = locked && startTurn === turn;
    const name = turn === 'w' ? 'Les Blancs' : 'Les Noirs';
    startButtons[turn].classList.toggle('active', active);
    startButtons[turn].setAttribute('aria-pressed', active ? 'true' : 'false');
    startButtons[turn].title = !locked
      ? name + ' ont le trait : figer la position et commencer'
      : active
        ? 'Revenir à l’édition de la position'
        : name + ' ont le trait : nouveau départ à partir de la position affichée';
  }
}

/** Nouveau Start depuis la position affichée, avec le trait imposé (un camp peut jouer deux fois de suite). */
function restartWithTurn(turn) {
  cancelPromotion();
  const parts = game.fen().split(' ');
  const grid = placementToGrid(parts[0]);
  const error = legalityError(parts[0], turn);
  if (error) {
    showMessage(error);
    return;
  }
  const castling = sanitizeCastling(grid, parts[2]);
  const fen = buildFen(parts[0], turn, castling, 0, parseInt(parts[5] || '1', 10) || 1);
  if (!game.load(fen)) {
    showMessage('Cette position n’est pas valide.');
    return;
  }
  hideMessage();
  startTurn = turn;
  enterGame(game.fen());
}

function onStartClick(turn) {
  if (locked) {
    // bouton actif : retour à l'édition ; autre bouton : on change le trait
    if (startTurn === turn) leaveGame();
    else restartWithTurn(turn);
    return;
  }

  const placement = ground.getFen();
  const grid = placementToGrid(placement);
  const error = (grid && validateStructure(grid)) || legalityError(placement, turn);
  if (error) {
    showMessage(error);
    return;
  }

  hideMessage();
  const castling = sanitizeCastling(grid, editMeta.castling);
  const fen = buildFen(placement, turn, castling, editMeta.half, editMeta.full);
  if (!game.load(fen)) {
    showMessage('Cette position n’est pas valide.');
    return;
  }

  startTurn = turn;
  enterGame(game.fen());
}

/** Passe en mode partie à partir d'un FEN (nouvelle racine, variantes effacées). */
function enterGame(fen) {
  game.load(fen);
  currentStartFen = game.fen();
  rootNode = createRoot();
  currentNode = rootNode;
  locked = true;
  document.body.classList.add('locked');
  disarm();
  cycleMemory = null;

  ground.set({
    highlight: { lastMove: true, check: true },
    draggable: { enabled: true, deleteOnDropOff: false },
    selectable: { enabled: true },
    movable: { free: false, showDests: true },
  });

  fenInput.classList.remove('invalid');
  updateStartButtons();
  afterPosition();
}

/** Retour au mode édition, sur la position de départ de la partie. */
function leaveGame() {
  invalidate();
  const placement = rootNode ? rootNode.fen.split(' ')[0] : ground.getFen();
  if (startTurn) editMeta.turn = startTurn;

  locked = false;
  document.body.classList.remove('locked');
  startTurn = null;
  rootNode = null;
  currentNode = null;
  pendingPromotion = null;
  hidePromotion();

  ground.set({
    fen: placement,
    lastMove: null,
    check: false,
    turnColor: 'white',
    highlight: { lastMove: false, check: false },
    draggable: { enabled: true, deleteOnDropOff: true },
    selectable: { enabled: false },
    movable: { free: true, color: 'both', showDests: false, dests: new Map() },
  });
  ground.cancelMove();

  updateStartButtons();
  updateMoves();
  updateNavigation();
  updateTurnIndicators();
  updateZoneAvailability();
  clearZone();
  clearEvaluation();
  syncEditorFen();
  updateShiftButtons();
  setStatus('Position éditable');
}

// ==================================================
// ARBRE DES COUPS (repris de cc2)
// ==================================================

function createRoot() {
  return { parent: null, move: null, source: 'root', children: [], fen: game.fen(), selectedChild: null, comment: null };
}

function createNode(parent, move, source) {
  return {
    parent,
    move: { color: move.color, from: move.from, to: move.to, san: move.san, promotion: move.promotion || null },
    source,
    children: [],
    fen: game.fen(),
    selectedChild: null,
    comment: null,
  };
}

function findChild(node, move) {
  return node.children.find(
    (child) =>
      child.move.from === move.from && child.move.to === move.to && (child.move.promotion || null) === (move.promotion || null),
  );
}

function getPath(node) {
  const path = [];
  for (let current = node; current && current.parent; current = current.parent) path.unshift(current);
  return path;
}

function getMainChild(node) {
  return node && node.children.length > 0 ? node.children[0] : null;
}

function rebuildGameToNode(node) {
  if (!game.load(currentStartFen)) return false;
  for (const child of getPath(node)) {
    const move = game.move({ from: child.move.from, to: child.move.to, promotion: child.move.promotion || 'q' });
    if (!move) return false;
  }
  return true;
}

function getLastMoveSquares() {
  return currentNode && currentNode.move ? [currentNode.move.from, currentNode.move.to] : [];
}

function terminationComment() {
  if (game.in_checkmate()) return 'Mat';
  if (game.in_stalemate()) return 'Pat';
  if (game.insufficient_material()) return 'Nulle - Matériel';
  if (game.in_threefold_repetition()) return 'Nulle - Répétition';
  if (parseInt(game.fen().split(' ')[4] || '0', 10) >= 100) return 'Nulle - 50 coups';
  return 'Partie terminée';
}

function commitMove(move, source) {
  let child = findChild(currentNode, move);
  if (!child) {
    child = createNode(currentNode, move, source);
    currentNode.children.push(child);
  }
  currentNode.selectedChild = child;
  currentNode = child;
  child.fen = game.fen();
  if (game.game_over()) child.comment = terminationComment();
  afterPosition();
}

function showNode(node) {
  cancelPromotion();
  if (!rebuildGameToNode(node)) return;
  currentNode = node;
  afterPosition();
}

// ==================================================
// RÈGLES DE JEU
// ==================================================

const isAnalysisMode = () => playerSide === 'analysis';
const playerColor = () => (isAnalysisMode() ? 'both' : playerSide);

function isPlayerTurn() {
  if (isAnalysisMode()) return true;
  return playerSide === 'white' ? game.turn() === 'w' : game.turn() === 'b';
}

function canUserMove() {
  return locked && !thinking && !pendingPromotion && !game.game_over() && isPlayerTurn();
}

function getDests() {
  const dests = new Map();
  for (const move of game.moves({ verbose: true })) {
    if (!dests.has(move.from)) dests.set(move.from, []);
    dests.get(move.from).push(move.to);
  }
  return dests;
}

/** Annule tout calcul en cours : à appeler à chaque changement de position. */
function invalidate() {
  moveToken++;
  evalId++;
  thinking = false;
  engine.cancel();
}

/** Aligne l'échiquier sur la position de chess.js. */
function syncBoard() {
  const turn = game.turn() === 'w' ? 'white' : 'black';
  ground.set({
    fen: game.fen(),
    turnColor: turn,
    lastMove: getLastMoveSquares(),
    check: game.in_check() ? turn : false,
    movable: { free: false, color: playerColor(), showDests: true, dests: canUserMove() ? getDests() : new Map() },
  });
}

/** Tout ce qui doit être rafraîchi après un changement de position. */
function afterPosition() {
  invalidate();
  syncBoard();
  updateMoves();
  updateNavigation();
  updateTurnIndicators();
  updateZoneAvailability();
  clearZone();
  fenInput.value = game.fen();
  fenInput.classList.remove('invalid');

  const engineToMove = !game.game_over() && !isAnalysisMode() && !isPlayerTurn();

  if (game.game_over()) {
    setStatus((currentNode && currentNode.comment) || terminationComment());
  } else if (isAnalysisMode()) {
    setStatus('Mode analyse');
  } else {
    setStatus(engineToMove ? 'Stockfish va jouer' : 'À vous de jouer');
  }

  requestEvaluation({ tablebaseOnly: engineToMove });
  if (engineToMove) askStockfish();
}

// ==================================================
// COUP DU JOUEUR ET PROMOTION
// ==================================================

function isPromotionMove(from, to) {
  const piece = game.get(from);
  return Boolean(piece && piece.type === 'p' && (to[1] === '8' || to[1] === '1'));
}

function playerMove(orig, dest) {
  if (thinking || pendingPromotion || !isPlayerTurn()) {
    syncBoard();
    return;
  }
  if (isPromotionMove(orig, dest)) {
    showPromotionChoice(orig, dest);
    return;
  }
  const move = game.move({ from: orig, to: dest });
  if (!move) {
    syncBoard();
    return;
  }
  commitMove(move, isAnalysisMode() ? 'analysis' : 'player');
}

function showPromotionChoice(from, to) {
  pendingPromotion = { from, to, color: game.turn() };
  ground.set({ movable: { dests: new Map() } });

  const choices = $('#promotion-choices');
  choices.innerHTML = '';
  for (const [type, title] of [['q', 'Dame'], ['r', 'Tour'], ['b', 'Fou'], ['n', 'Cavalier']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'promotion-piece';
    button.title = title;
    button.setAttribute('aria-label', title);
    const image = document.createElement('img');
    image.src = asset('pieces/alpha/' + pendingPromotion.color + type.toUpperCase() + '.svg');
    image.alt = title;
    button.appendChild(image);
    button.addEventListener('click', () => completePromotion(type));
    choices.appendChild(button);
  }
  const modal = $('#promotion-modal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function hidePromotion() {
  const modal = $('#promotion-modal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  $('#promotion-choices').innerHTML = '';
}

function cancelPromotion() {
  pendingPromotion = null;
  hidePromotion();
}

function completePromotion(promotion) {
  if (!pendingPromotion) return;
  const { from, to } = pendingPromotion;
  cancelPromotion();
  const move = game.move({ from, to, promotion });
  if (!move) {
    syncBoard();
    return;
  }
  commitMove(move, isAnalysisMode() ? 'analysis' : 'player');
}

$('#promotion-cancel').addEventListener('click', () => {
  cancelPromotion();
  if (locked) syncBoard();
});

// ==================================================
// STOCKFISH JOUE (tables de finales en premier, comme dans cc2)
// ==================================================

function findImmediateCheckmate() {
  for (const candidate of game.moves({ verbose: true })) {
    const replay = new Chess();
    replay.load(game.fen());
    const move = replay.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion });
    if (move && replay.in_checkmate()) return candidate.from + candidate.to + (candidate.promotion || '');
  }
  return null;
}

async function bestTablebaseMove(fen) {
  if (!isCovered(fen)) return null;
  try {
    const data = await getTablebase(fen);
    const first = data.moves.find((move) => move && move.uci);
    return first ? first.uci : null;
  } catch (error) {
    return null; // hors ligne ou position non couverte : Stockfish prend le relais
  }
}

async function askStockfish() {
  if (isAnalysisMode() || game.game_over()) return;

  thinking = true;
  const token = ++moveToken;
  const fen = game.fen();
  const sideToMove = game.turn();
  updateMoves();
  syncBoard();
  setStatus('Stockfish réfléchit…');

  const mate = findImmediateCheckmate();
  if (mate) {
    playEngineMove(mate, token);
    return;
  }

  const tablebaseMove = await bestTablebaseMove(fen);
  if (token !== moveToken) return;
  if (tablebaseMove) {
    playEngineMove(tablebaseMove, token);
    return;
  }

  engine.search({
    fen,
    depth: 20,
    movetime: 20000,
    onInfo: (line) => showEngineEvaluation(line, sideToMove, token),
    onBest: (uci) => playEngineMove(uci, token),
  });
}

function playEngineMove(uci, token) {
  if (token !== moveToken || !thinking || isAnalysisMode()) return;
  const move = game.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
  });
  thinking = false;
  if (!move) {
    syncBoard();
    updateMoves();
    return;
  }
  commitMove(move, 'stockfish');
}

// ==================================================
// ÉVALUATION (gélule) : Stockfish + tables de finales
// ==================================================

function setHead(text, sub) {
  evalHead.innerHTML = text ? escapeHtml(text) + (sub ? `<span class="sub">${escapeHtml(sub)}</span>` : '') : '';
}

function clearEvaluation() {
  evalId++;
  tbList = null;
  evalHead.innerHTML = '';
  evalMoves.innerHTML = '';
}

function showEngineEvaluation(line, sideToMove, token) {
  if (!evalOn || token !== moveToken) return;
  const text = evaluationFromInfo(line, sideToMove);
  if (!text) return;
  const depth = depthFromInfo(line);
  setHead(text, 'Stockfish' + (depth ? ' · depth ' + depth : ''));
}

function describeTablebase(tb, fen) {
  const side = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  const other = side === 'white' ? 'black' : 'white';

  if (tb.checkmate) return { text: side === 'white' ? '0-1' : '1-0', sub: 'Checkmate' };
  if (tb.stalemate) return { text: '0.00', sub: 'Stalemate · Draw' };

  switch (tb.category) {
    case 'draw':
      return { text: '0.00', sub: 'Draw · tablebase' };
    case 'cursed-win':
    case 'blessed-loss':
      return { text: '0.00', sub: 'Draw · 50-move rule' };
    case 'win':
    case 'loss': {
      const winner = tb.category === 'win' ? side : other;
      const label = winner === 'white' ? 'White wins' : 'Black wins';
      if (Number.isFinite(tb.dtm) && tb.dtm !== 0) {
        return { text: mateText(winner, tb.dtm), sub: label + ' · tablebase' };
      }
      return { text: label, sub: 'Tablebase', winner, label };
    }
    default:
      return null; // résultat inconnu : Stockfish reste l'évaluation de secours
  }
}

async function requestEvaluation({ tablebaseOnly = false } = {}) {
  const id = ++evalId;
  tbList = null;
  evalHead.innerHTML = '';
  evalMoves.innerHTML = '';

  if (!evalOn || !locked) return;

  const fen = game.fen();
  const sideToMove = game.turn();

  if (game.game_over()) {
    if (game.in_checkmate()) setHead(sideToMove === 'w' ? '0-1' : '1-0', 'Checkmate');
    else setHead('0.00', 'Draw');
    return;
  }

  let tb = null;
  if (isCovered(fen)) {
    try {
      tb = await getTablebase(fen);
    } catch (error) {
      tb = null;
    }
    if (id !== evalId) return;
  }

  const described = tb && describeTablebase(tb, fen);

  if (described) {
    setHead(described.text, described.sub);
    tbList = annotateMoves(game, tb);
    renderTablebaseMoves();

    if (described.winner) {
      // pas de DTM dans les tables : on suit la ligne principale jusqu'au mat
      const mate = await getMainlineMate(fen, described.winner);
      if (id === evalId && mate) setHead(mate, described.label + ' · tablebase');
    }
    return;
  }

  if (tb) {
    tbList = annotateMoves(game, tb);
    renderTablebaseMoves();
  }

  if (!tablebaseOnly) {
    engine.search({
      fen,
      depth: 20,
      onInfo: (line) => {
        if (id !== evalId) return;
        const text = evaluationFromInfo(line, sideToMove);
        const depth = depthFromInfo(line);
        if (text) setHead(text, 'Stockfish' + (depth ? ' · depth ' + depth : ''));
      },
    });
  }
}

function verdictText(move) {
  if (move.outcome === null) return '<small>unknown</small>';
  if (move.outcome === 'draw') return move.fifty ? 'Draw <small>(50-move)</small>' : 'Draw';

  // « White wins » / « White loses » : le sujet est le camp qui joue le coup
  const side = move.color === 'w' ? 'White' : 'Black';
  let text = side + (move.outcome === 'win' ? ' wins' : ' loses');
  if (move.dtm !== null && move.dtm !== 0) {
    // dtm : demi-coups mesurés après le coup, du point de vue de l'adversaire
    text += ` <small>#${Math.ceil((Math.abs(move.dtm) + 1) / 2)}</small>`;
  }
  return text;
}

function renderTablebaseMoves() {
  if (!tbList || tbList.length === 0) {
    evalMoves.innerHTML = '';
    return;
  }

  const playable = canUserMove();
  const table = document.createElement('table');
  table.className = 'tb-list';

  for (const move of tbList) {
    const row = document.createElement('tr');
    row.className = 'tb-row ' + (move.outcome || 'unknown') + (playable ? ' playable' : '');
    row.title = 'Theoretical result after this move (tablebase)';

    const sanCell = document.createElement('td');
    const converted = convertSan(move.san, move.color === 'w' ? 'white' : 'black');
    if (notationMode() === 'figurines') sanCell.innerHTML = converted;
    else sanCell.textContent = converted;

    const verdictCell = document.createElement('td');
    verdictCell.className = 'verdict';
    verdictCell.innerHTML = verdictText(move);

    row.append(sanCell, verdictCell);
    if (playable) {
      row.addEventListener('click', () => {
        if (!canUserMove()) return;
        const played = game.move({ from: move.from, to: move.to, promotion: move.promotion || undefined });
        if (played) commitMove(played, isAnalysisMode() ? 'analysis' : 'player');
      });
    }
    table.appendChild(row);
  }

  evalMoves.innerHTML = '';
  evalMoves.appendChild(table);
}

evalPill.addEventListener('click', () => {
  evalOn = !evalOn;
  evalPill.classList.toggle('active', evalOn);
  evalPill.setAttribute('aria-expanded', evalOn ? 'true' : 'false');
  evalPill.title = evalOn ? 'Masquer l’évaluation' : 'Afficher l’évaluation';

  if (!evalOn) {
    if (!thinking) engine.cancel();
    clearEvaluation();
    return;
  }
  if (!locked) {
    showMessage('Choisissez le camp au trait (Start) pour évaluer la position.', 'info');
    return;
  }
  // pendant que Stockfish joue, son calcul alimente déjà l'évaluation
  requestEvaluation({ tablebaseOnly: thinking });
});

// ==================================================
// WINNING ZONE
// ==================================================

function zoneAvailable() {
  return locked && isAnalysisMode() && !game.game_over() && isCovered(game.fen());
}

function updateZoneAvailability() {
  zoneButton.classList.toggle('active', zoneOn);
  zoneButton.setAttribute('aria-pressed', zoneOn ? 'true' : 'false');
  zoneButton.classList.toggle('unavailable', !zoneAvailable());
}

function clearZone() {
  zoneSig = '';
  zoneLayer.innerHTML = '';
}

/**
 * Cases que la pièce choisie pourrait occuper « si on pouvait la poser » :
 * toutes les cases de l'échiquier, sauf pour le Fou (cases de sa couleur)
 * et le Pion (sa colonne, rangées 2 à 7).
 */
function candidateSquares(selected, piece) {
  const squares = [];
  const selFile = selected.charCodeAt(0) - 97;
  const selRank = parseInt(selected[1], 10) - 1;
  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      if (file === selFile && rank === selRank) continue;
      if (piece.type === 'b' && (file + rank) % 2 !== (selFile + selRank) % 2) continue;
      if (piece.type === 'p' && (file !== selFile || rank === 0 || rank === 7)) continue;
      squares.push('abcdefgh'[file] + (rank + 1));
    }
  }
  return squares;
}

/**
 * Position obtenue en posant la pièce sur `target`, trait à l'adversaire.
 * Renvoie null si cette position est impossible (case occupée par une pièce
 * du même camp ou par le Roi adverse, Roi du joueur en échec, etc.).
 */
function hypotheticalFen(selected, target) {
  const mover = game.turn();
  const opponent = mover === 'w' ? 'b' : 'w';
  const grid = placementToGrid(game.fen().split(' ')[0]);
  const at = (square) => [8 - parseInt(square[1], 10), square.charCodeAt(0) - 97];

  const [sr, sf] = at(selected);
  const letter = grid[sr][sf];
  grid[sr][sf] = '';

  const [tr, tf] = at(target);
  const occupant = grid[tr][tf];
  if (occupant) {
    const occupantIsWhite = occupant === occupant.toUpperCase();
    if (occupantIsWhite === (mover === 'w')) return null; // pièce du même camp
    if (occupant.toLowerCase() === 'k') return null; // Roi adverse
  }
  grid[tr][tf] = letter;

  const placement = gridToPlacement(grid);
  // le joueur ne doit pas être en échec une fois la pièce posée
  const probe = new Chess();
  if (!probe.load(buildFen(placement, mover)) || probe.in_check()) return null;

  return buildFen(placement, opponent);
}

/** Résultat pour le joueur : 'win' | 'draw' | 'loss' | null. */
async function hypotheticalOutcome(fen) {
  const probe = new Chess();
  if (!probe.load(fen)) return null;
  if (probe.in_checkmate()) return 'win';
  if (probe.in_stalemate() || probe.insufficient_material()) return 'draw';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await getTablebase(fen);
      return moveOutcomeOf(data); // la catégorie de la position vaut pour l'adversaire
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  return null;
}

function addZoneCell(square, outcome) {
  const white = ground.state.orientation === 'white';
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10) - 1;
  const cell = document.createElement('div');
  cell.className = 'zone-cell ' + outcome;
  cell.style.left = (white ? file : 7 - file) * 12.5 + '%';
  cell.style.top = (white ? 7 - rank : rank) * 12.5 + '%';
  zoneLayer.appendChild(cell);
}

const ZONE_CONCURRENCY = 4;

async function refreshZone() {
  const selected = ground.state.selected;
  if (!zoneOn || !zoneAvailable() || !selected) {
    clearZone();
    return;
  }
  const piece = game.get(selected);
  if (!piece || piece.color !== game.turn()) {
    clearZone();
    return;
  }

  const signature = selected + '|' + game.fen() + '|' + ground.state.orientation;
  if (signature === zoneSig) return;
  clearZone();
  zoneSig = signature;

  const jobs = candidateSquares(selected, piece)
    .map((square) => ({ square, fen: hypotheticalFen(selected, square) }))
    .filter((job) => job.fen);

  let failures = 0;
  let next = 0;
  async function worker() {
    while (zoneSig === signature && next < jobs.length) {
      const job = jobs[next++];
      const outcome = await hypotheticalOutcome(job.fen);
      if (zoneSig !== signature) return;
      if (outcome) addZoneCell(job.square, outcome);
      else failures++;
    }
  }
  await Promise.all(Array.from({ length: ZONE_CONCURRENCY }, worker));

  if (zoneSig === signature && failures > 0) {
    showMessage('Tables de finales : ' + failures + ' case(s) non évaluée(s) (service indisponible ou saturé).');
  }
}

function moveOutcomeOf(entry) {
  // la catégorie est donnée du point de vue du camp qui a le trait après le coup
  switch (entry.category) {
    case 'loss':
      return 'win'; // l'adversaire est perdant : zone de gain (vert)
    case 'draw':
    case 'cursed-win':
    case 'blessed-loss':
      return 'draw'; // nulle (jaune)
    case 'win':
      return 'loss'; // l'adversaire gagne : zone de défaite (rose)
    default:
      return null;
  }
}

zoneButton.addEventListener('click', () => {
  zoneOn = !zoneOn;
  updateZoneAvailability();
  clearZone();
  if (zoneOn && !zoneAvailable()) {
    showMessage('Winning Zone : mode analyse (Roi bicolore), position figée par Start, 7 pièces au plus.', 'info');
  }
  refreshZone();
});

// La sélection d'une pièce se fait au clavier/souris/doigt : on la relit après chaque geste.
boardElement.addEventListener('pointerdown', () => setTimeout(refreshZone, 0));
document.addEventListener('pointerup', () => setTimeout(refreshZone, 0));

// ==================================================
// NOTATION (français / figurines / international)
// ==================================================

const notationMode = () => $('#notation').value;

function convertSan(san, color) {
  const mode = notationMode();
  if (mode === 'international') return san;

  if (mode === 'french') {
    const conversion = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };
    let result = san;
    if (conversion[result.charAt(0)]) result = conversion[result.charAt(0)] + result.substring(1);
    return result.replace(/=([QRBN])/g, (match, piece) => '=' + conversion[piece]);
  }

  // figurines : mêmes SVG « alpha » que l'échiquier
  const prefix = color === 'white' ? 'w' : 'b';
  const makePiece = (piece) =>
    `<img class="notation-piece" src="${asset('pieces/alpha/' + prefix + piece + '.svg')}" alt="${piece}">`;
  let result = String(san);
  if (/^[KQRBN]/.test(result)) result = makePiece(result.charAt(0)) + result.substring(1);
  return result.replace(/=([QRBN])/g, (match, piece) => '=' + makePiece(piece));
}

// ==================================================
// LISTE DES COUPS (repris de cc2)
// ==================================================

function getStartMoveInfo() {
  const parts = currentStartFen.trim().split(/\s+/);
  return { turn: parts[1] || 'w', fullmove: parseInt(parts[5] || '1', 10) || 1 };
}

function getMoveNumber(node) {
  const index = getPath(node).length - 1;
  const start = getStartMoveInfo();
  return start.turn === 'w' ? start.fullmove + Math.floor(index / 2) : start.fullmove + Math.floor((index + 1) / 2);
}

function createMoveButton(node, mainLine) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'move-text ' + (mainLine ? 'main-move' : 'variation-move');
  if (node === currentNode) button.classList.add('current-move');

  const converted = convertSan(node.move.san, node.move.color === 'w' ? 'white' : 'black');
  if (notationMode() === 'figurines') {
    button.classList.add('figurine-notation');
    button.innerHTML = converted;
  } else {
    button.textContent = converted;
  }
  button.addEventListener('click', () => showNode(node));
  return button;
}

function addSpace(container) {
  container.appendChild(document.createTextNode(' '));
}

function appendMoveNumber(container, node, forceBlackNumber) {
  const number = getMoveNumber(node);
  if (node.move.color === 'w' || forceBlackNumber) {
    const span = document.createElement('span');
    span.className = 'move-number';
    span.textContent = number + (node.move.color === 'w' ? '. ' : '... ');
    container.appendChild(span);
  }
}

const variationDepthClass = (depth) => 'variation-depth-' + (((depth - 1) % 5) + 1);

function promoteVariation(node) {
  if (!node || !node.parent) return;
  const siblings = node.parent.children;
  const index = siblings.indexOf(node);
  if (index <= 0) return;
  [siblings[index - 1], siblings[index]] = [siblings[index], siblings[index - 1]];
  updateMoves();
}

function createPromoteButton(node) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'promote-variation';
  button.title = 'Remonter cette variante';
  button.setAttribute('aria-label', 'Remonter cette variante');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    promoteVariation(node);
  });
  return button;
}

function renderAlternativeGroup(mainNode, container, depth) {
  if (!mainNode || !mainNode.parent) return false;
  const alternatives = mainNode.parent.children.filter((child) => child !== mainNode);
  if (alternatives.length === 0) return false;

  if (depth === 1) container.appendChild(document.createElement('br'));

  const variation = document.createElement('span');
  variation.classList.add('variation', variationDepthClass(depth));
  alternatives.forEach((alternative, index) => {
    if (index > 0) variation.appendChild(document.createTextNode('; '));
    variation.appendChild(document.createTextNode('( '));
    variation.appendChild(createPromoteButton(alternative));
    renderSequence(alternative, variation, { mainLine: false, variationDepth: depth, suppressAlternativesOnFirst: true });
    variation.appendChild(document.createTextNode(')'));
  });
  container.appendChild(variation);

  if (depth === 1) container.appendChild(document.createElement('br'));
  else addSpace(container);
  return true;
}

function renderSequence(startNode, container, options = {}) {
  const mainLine = options.mainLine === true;
  const variationDepth = options.variationDepth || 0;
  const suppressFirst = options.suppressAlternativesOnFirst === true;

  let node = startNode;
  let firstNode = true;
  let forceBlackNumber = false;

  while (node) {
    appendMoveNumber(container, node, node.move.color === 'b' && (firstNode || forceBlackNumber));
    container.appendChild(createMoveButton(node, mainLine));

    if (node.comment) {
      const comment = document.createElement('span');
      comment.className = 'game-comment';
      comment.textContent = ' (' + node.comment + ')';
      container.appendChild(comment);
    }
    addSpace(container);

    let alternativesDisplayed = false;
    if (!(firstNode && suppressFirst)) {
      alternativesDisplayed = renderAlternativeGroup(node, container, variationDepth + 1);
    }

    const next = getMainChild(node);
    if (!next) break;
    forceBlackNumber = alternativesDisplayed && next.move.color === 'b';
    node = next;
    firstNode = false;
  }
}

function updateMoves() {
  movesElement.innerHTML = '';
  if (rootNode && rootNode.children.length > 0) {
    renderSequence(getMainChild(rootNode), movesElement, { mainLine: true, variationDepth: 0 });
  }
  if (thinking) {
    const note = document.createElement('span');
    note.className = 'thinking';
    note.textContent = ' Stockfish réfléchit…';
    movesElement.appendChild(note);
  }
}

function updateNavigation() {
  const atRoot = !currentNode || currentNode === rootNode;
  const atEnd = !currentNode || currentNode.children.length === 0;
  $('#first').disabled = atRoot;
  $('#previous').disabled = atRoot;
  $('#next').disabled = atEnd;
  $('#last').disabled = atEnd;
  $('#restart').disabled = !locked;
}

$('#first').addEventListener('click', () => rootNode && showNode(rootNode));
$('#previous').addEventListener('click', () => currentNode && currentNode.parent && showNode(currentNode.parent));
$('#next').addEventListener('click', () => {
  const child = getMainChild(currentNode);
  if (child) showNode(child);
});
$('#last').addEventListener('click', () => {
  let node = currentNode;
  while (node && getMainChild(node)) node = getMainChild(node);
  if (node) showNode(node);
});
$('#restart').addEventListener('click', () => {
  if (locked) enterGame(currentStartFen);
});
$('#flip').addEventListener('click', () => {
  ground.toggleOrientation();
  updateCoordinates();
  updateTurnIndicators();
  updateShiftButtons();
  clearZone();
  refreshZone();
});

// ==================================================
// PGN (repris de cc2)
// ==================================================

const escapePgnValue = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function getPgnMoveText(node, ply) {
  const start = getStartMoveInfo();
  const number = start.fullmove + Math.floor((ply + (start.turn === 'w' ? 0 : 1)) / 2);
  if (node.move.color === 'w') return number + '. ' + node.move.san;
  return ply === 0 ? number + '... ' + node.move.san : node.move.san;
}

function exportPgnLine(node, ply) {
  if (!node) return '';
  let text = getPgnMoveText(node, ply);
  const main = getMainChild(node);
  for (const alternative of node.children.filter((child) => child !== main)) {
    const variation = exportPgnLine(alternative, ply + 1);
    if (variation) text += ' (' + variation + ')';
  }
  if (main) text += ' ' + exportPgnLine(main, ply + 1);
  return text;
}

function buildPgn() {
  let pgn = '[Event "Winning Zone"]\n[Site "Winning Zone"]\n';
  if (currentStartFen) pgn += '[FEN "' + escapePgnValue(currentStartFen) + '"]\n[SetUp "1"]\n';
  pgn += '[Result "*"]\n\n';
  if (rootNode && rootNode.children.length > 0) pgn += exportPgnLine(getMainChild(rootNode), 0) + ' ';
  return pgn + '*\n';
}

function downloadPgn() {
  const blob = new Blob([buildPgn()], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'winning-zone.pgn';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setupPgnButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'export-pgn-button';
  button.title = 'Télécharger toutes les variantes en PGN';
  button.setAttribute('aria-label', 'Télécharger toutes les variantes en PGN');
  const icon = document.createElement('img');
  icon.src = asset('images/download-pgn.png');
  icon.alt = '';
  icon.className = 'export-pgn-icon';
  const label = document.createElement('span');
  label.textContent = 'PGN';
  button.append(icon, label);
  button.addEventListener('click', downloadPgn);
  $('.notation-control').appendChild(button);
}

// ==================================================
// MENU DE NOTATION (repris de cc2)
// ==================================================

function setupNotationMenu() {
  const select = $('#notation');
  select.classList.add('notation-native-select');

  const menu = document.createElement('div');
  menu.className = 'notation-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'notation-menu-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'Choisir la notation';

  const preview = document.createElement('span');
  preview.className = 'notation-menu-preview';
  const arrow = document.createElement('span');
  arrow.className = 'notation-menu-arrow';
  arrow.textContent = '▾';
  button.append(preview, arrow);

  const list = document.createElement('div');
  list.className = 'notation-menu-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  const choices = [
    { value: 'french', text: 'R D T F C' },
    { value: 'figurines', pieces: ['wK', 'wQ', 'wR', 'wB', 'wN'] },
    { value: 'international', text: 'K Q R B N' },
  ];

  function fill(container, choice) {
    container.innerHTML = '';
    if (choice.pieces) {
      for (const piece of choice.pieces) {
        const image = document.createElement('img');
        image.src = asset('pieces/alpha/' + piece + '.svg');
        image.alt = '';
        image.className = 'notation-menu-piece';
        container.appendChild(image);
      }
    } else {
      container.textContent = choice.text;
    }
  }

  const closeMenu = () => {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  const update = () => {
    fill(preview, choices.find((c) => c.value === select.value) || choices[0]);
    list.querySelectorAll('.notation-menu-option').forEach((item) => {
      const selected = item.dataset.value === select.value;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
  };

  for (const choice of choices) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'notation-menu-option';
    item.dataset.value = choice.value;
    item.setAttribute('role', 'option');
    fill(item, choice);
    item.addEventListener('click', () => {
      select.value = choice.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu();
    });
    list.appendChild(item);
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    list.hidden = !list.hidden;
    button.setAttribute('aria-expanded', list.hidden ? 'false' : 'true');
  });
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
  select.addEventListener('change', update);

  menu.append(button, list);
  select.insertAdjacentElement('afterend', menu);
  update();
}

$('#notation').addEventListener('change', () => {
  updateMoves();
  renderTablebaseMoves();
});

// ==================================================
// BOUTONS PLAY (camp du joueur) ET START
// ==================================================

document.querySelectorAll('.mode-btn').forEach((button) => {
  button.addEventListener('click', () => {
    playerSide = button.dataset.mode;
    document.querySelectorAll('.mode-btn').forEach((other) => {
      const selected = other === button;
      other.classList.toggle('selected', selected);
      other.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    updateZoneAvailability();
    clearZone();
    // en partie : Stockfish reprend la main si c'est à lui de jouer
    if (locked) afterPosition();
  });
});

startButtons.w.addEventListener('click', () => onStartClick('w'));
startButtons.b.addEventListener('click', () => onStartClick('b'));

document.querySelectorAll('.shift-btn').forEach((button) => {
  button.addEventListener('click', () => shiftPosition(button.dataset.dir));
});

// ==================================================
// INITIALISATION
// ==================================================

buildPalette();
setupNotationMenu();
setupPgnButton();
updateCoordinates();
updateTurnIndicators();
updateNavigation();
updateShiftButtons();
updateStartButtons();
updateZoneAvailability();
setStatus('Position éditable');
