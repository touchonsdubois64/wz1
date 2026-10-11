// ==================================================
// STOCKFISH (worker WASM) — une recherche à la fois
// ==================================================
//
// Même moteur que cc2 (stockfish-18-lite-single), à sa force maximale
// (aucune limitation de niveau). Une nouvelle recherche annule la précédente
// proprement : le bestmove de la recherche annulée est ignoré.
// ==================================================

export class Engine {
  constructor(url) {
    this.worker = new Worker(url);
    this.current = null;
    this.queued = null;

    this.worker.onmessage = (event) => this.onMessage(String(event.data));
    this.worker.postMessage('uci');
  }

  /**
   * job = { fen, depth, movetime?, onInfo?(line), onBest?(uci) }
   * Remplace toute recherche en cours ou en attente.
   */
  search(job) {
    this.queued = job;
    if (this.current) {
      this.current.cancelled = true;
      this.worker.postMessage('stop');
    } else {
      this.startQueued();
    }
  }

  /** Annule la recherche en cours et celle en attente. */
  cancel() {
    this.queued = null;
    if (this.current) {
      this.current.cancelled = true;
      this.worker.postMessage('stop');
    }
  }

  startQueued() {
    if (this.current || !this.queued) return;
    this.current = this.queued;
    this.queued = null;

    const job = this.current;
    this.worker.postMessage('position fen ' + job.fen);
    let go = 'go depth ' + (job.depth || 20);
    if (job.movetime) go += ' movetime ' + job.movetime;
    this.worker.postMessage(go);
  }

  onMessage(line) {
    const job = this.current;

    if (line.startsWith('info')) {
      if (job && !job.cancelled && job.onInfo) job.onInfo(line);
      return;
    }

    if (line.startsWith('bestmove')) {
      this.current = null;
      if (job && !job.cancelled && job.onBest) {
        const best = line.trim().split(/\s+/)[1];
        if (best && best !== '(none)') job.onBest(best);
      }
      this.startQueued();
    }
  }
}

/**
 * Convertit une ligne « info … score … » en texte d'évaluation du point de
 * vue des Blancs (« +1.25 », « -0.40 », « #3 », « #-2 »), ou null.
 */
export function evaluationFromInfo(line, sideToMove) {
  const sign = sideToMove === 'w' ? 1 : -1;

  const mate = line.match(/\bscore\s+mate\s+(-?\d+)/);
  if (mate) {
    const distance = sign * parseInt(mate[1], 10);
    return distance < 0 ? '#-' + Math.abs(distance) : '#' + Math.abs(distance);
  }

  const cp = line.match(/\bscore\s+cp\s+(-?\d+)/);
  if (!cp) return null;

  const pawns = (sign * parseInt(cp[1], 10)) / 100;
  if (pawns === 0) return '0.00';
  return (pawns > 0 ? '+' : '') + pawns.toFixed(2);
}

export function depthFromInfo(line) {
  const match = line.match(/\bdepth\s+(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
