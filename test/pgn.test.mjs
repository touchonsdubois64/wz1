import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { parsePgn } from '../src/pgn.js';

const line = (node) => { const out = []; for (let n = node; n.children.length; n = n.children[0]) out.push(n.children[0].move.san); return out; };

test('partie simple avec en-têtes, commentaires et NAG', () => {
  const r = parsePgn(`[Event "Test"]
[White "A"]
[Black "B"]

1. e4 {bon coup} e5 $1 2. Nf3 Nc6 3. Bb5 a6 ; fin de ligne
4. Ba4 Nf6 5. O-O Be7 1-0`, Chess);
  assert.equal(r.error, null);
  assert.equal(r.moveCount, 10);
  assert.deepEqual(line(r.root), ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O','Be7']);
  assert.equal(r.title, 'Test');
  assert.equal(r.hasFen, false);
  assert.equal(r.endNode.parent.parent !== null, true);
});

test('variantes imbriquées', () => {
  const r = parsePgn('1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3 *', Chess);
  assert.equal(r.error, null);
  const e4 = r.root.children[0];
  assert.equal(e4.children.length, 2);               // e5 et c5
  assert.equal(e4.children[0].move.san, 'e5');
  assert.equal(e4.children[1].move.san, 'c5');
  const c5 = e4.children[1];
  assert.equal(c5.children.length, 2);               // Nf3 et c3
  assert.equal(c5.children[1].move.san, 'c3');
  assert.deepEqual(line(r.root), ['e4', 'e5', 'Nf3']);
});

test('en-tête FEN, roques en zéros, coup nul', () => {
  const r = parsePgn(`[SetUp "1"]
[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]

1. 0-0 0-0-0 2. -- Kb8 3. Rfe1`, Chess);
  assert.equal(r.error, null);
  assert.equal(r.hasFen, true);
  assert.equal(r.moveCount, 5);
  const nul = r.root.children[0].children[0].children[0];
  assert.equal(nul.move.nullMove, true);
  assert.match(nul.fen, / b /);
});

test('coup illégal : résultat partiel et message', () => {
  const r = parsePgn('1. e4 e5 2. Ke4 Nc6', Chess);
  assert.match(r.error, /Ke4/);
  assert.equal(r.moveCount, 2);
  assert.ok(r.root);
});

test('texte inutilisable', () => {
  assert.equal(parsePgn('bonjour tout le monde', Chess).root, null);
  assert.equal(parsePgn('[FEN "n importe quoi"]\n\n1. e4', Chess).root, null);
});

test('seulement un FEN dans les en-têtes', () => {
  const r = parsePgn('[FEN "8/8/8/4k3/8/8/8/K2Q4 w - - 0 1"]', Chess);
  assert.ok(r.root);
  assert.equal(r.moveCount, 0);
  assert.equal(r.hasFen, true);
});

test('première partie seulement', () => {
  const r = parsePgn(`[Event "Un"]

1. e4 e5 *

[Event "Deux"]

1. d4 d5 *`, Chess);
  assert.equal(r.moveCount, 2);
  assert.equal(r.title, 'Un');
});

test('mat détecté dans le commentaire', () => {
  const r = parsePgn('1. f3 e5 2. g4 Qh4#', Chess);
  assert.equal(r.endNode.comment, 'Mat');
});

test('PGN sur une seule ligne, en-têtes compris', () => {
  const r = parsePgn('[Event "Une ligne"] [FEN "8/8/8/4k3/8/8/8/K2Q4 w - - 0 1"] 1. Qd5+ Kf4 2. Qd2+ *', Chess);
  assert.equal(r.error, null);
  assert.equal(r.hasFen, true);
  assert.equal(r.moveCount, 3);
  assert.equal(r.title, 'Une ligne');
});

test('deux parties sur une seule ligne : la première seulement', () => {
  const r = parsePgn('[Event "A"] 1. e4 e5 * [Event "B"] 1. d4 d5 *', Chess);
  assert.equal(r.moveCount, 2);
  assert.equal(r.title, 'A');
});

test('commentaires, flèches et cercles', () => {
  const r = parsePgn('{Introduction} 1. e4 {Bon coup [%cal Ge2e4,Rd1h5] [%csl Yd5] [%clk 0:10:00]} e5 {Réponse} 2. Nf3 *', Chess);
  assert.equal(r.error, null);
  assert.equal(r.root.note, 'Introduction');
  const e4 = r.root.children[0];
  assert.equal(e4.note, 'Bon coup');
  assert.deepEqual(e4.shapes, [
    { orig: 'e2', dest: 'e4', brush: 'green' },
    { orig: 'd1', dest: 'h5', brush: 'red' },
    { orig: 'd5', brush: 'yellow' },
  ]);
  assert.equal(e4.children[0].note, 'Réponse');
  assert.equal(r.moveCount, 3);
});

test('commentaire dans une variante', () => {
  const r = parsePgn('1. e4 e5 (1... c5 {Sicilienne [%csl Rc5]}) 2. Nf3', Chess);
  const c5 = r.root.children[0].children[1];
  assert.equal(c5.note, 'Sicilienne');
  assert.deepEqual(c5.shapes, [{ orig: 'c5', brush: 'red' }]);
});
