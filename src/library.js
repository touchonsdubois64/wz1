// ==================================================
// BIBLIOTHÈQUE DE POSITIONS : menu déroulant à plusieurs niveaux
// ==================================================
//
// Le menu s'ouvre à droite du bouton « dossier ». On y descend de niveau en
// niveau (catégorie → sous-catégories → position) ; « ‹ Retour » remonte.
// Les données viennent de positions.js (voir les explications en tête de ce fichier).
// ==================================================

import { Chess } from 'chess.js';
import { categories, positions } from './positions.js';

const makeNode = (name) => ({ name, entries: [], folders: new Map() });

/** Construit l'arbre à partir du tableau plat de positions.js. */
function buildTree() {
  const roots = new Map(categories.map((name) => [name, makeNode(name)]));

  positions.forEach((position, index) => {
    const label = '#' + (index + 1) + ' (' + (position && position.title) + ')';
    const path = position && Array.isArray(position.path) ? position.path.filter(Boolean) : [];
    if (path.length === 0 || !position.fen || !position.title) {
      console.warn('positions.js : position ' + label + ' ignorée (path, title et fen sont obligatoires).');
      return;
    }
    if (!new Chess().load(position.fen)) {
      console.warn('positions.js : position ' + label + ' ignorée (FEN invalide : ' + position.fen + ').');
      return;
    }

    let node = roots.get(path[0]);
    if (!node) {
      console.warn('positions.js : catégorie inconnue « ' + path[0] + ' » (position ' + label + '). Ajoutez-la à "categories" pour fixer sa place.');
      node = makeNode(path[0]);
      roots.set(path[0], node);
    }
    for (const name of path.slice(1)) {
      let child = node.folders.get(name);
      if (!child) {
        child = makeNode(name);
        node.folders.set(name, child);
        node.entries.push({ folder: child });
      }
      node = child;
    }
    node.entries.push({ position });
  });

  return [...roots.values()];
}

function countPositions(node) {
  return node.entries.reduce((total, entry) => total + (entry.folder ? countPositions(entry.folder) : 1), 0);
}

/**
 * Branche le bouton et le menu.
 * onSelect(position) est appelé quand l'utilisateur choisit une position.
 */
export function setupLibrary({ button, menu, onSelect }) {
  const roots = buildTree();
  let trail = []; // sous-dossiers traversés depuis la catégorie choisie

  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };

  function item(label, { count, folder = false, empty = false, onClick, title }) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'library-item' + (folder ? ' folder' : '') + (empty ? ' empty' : '');
    if (title) element.title = title;
    const text = document.createElement('span');
    text.className = 'library-text';
    text.textContent = label;
    element.appendChild(text);
    if (count !== undefined || folder) {
      const side = document.createElement('span');
      side.className = 'library-side';
      side.textContent = (count !== undefined ? count : '') + (folder && !empty ? ' ›' : '');
      element.appendChild(side);
    }
    if (empty) element.disabled = true;
    else element.addEventListener('click', onClick);
    return element;
  }

  function render() {
    menu.innerHTML = '';

    if (trail.length === 0) {
      for (const root of roots) {
        const count = countPositions(root);
        menu.appendChild(
          item(root.name, {
            folder: true,
            count: count || undefined,
            empty: count === 0,
            title: count === 0 ? 'Aucune position pour le moment' : undefined,
            onClick: () => {
              trail = [root];
              render();
            },
          }),
        );
      }
      return;
    }

    const current = trail[trail.length - 1];

    const back = item('‹ Retour', {
      onClick: () => {
        trail.pop();
        render();
      },
    });
    back.classList.add('library-back');
    menu.appendChild(back);

    const crumb = document.createElement('div');
    crumb.className = 'library-crumb';
    crumb.textContent = trail.map((node) => node.name).join(' › ');
    menu.appendChild(crumb);

    for (const entry of current.entries) {
      if (entry.folder) {
        menu.appendChild(
          item(entry.folder.name, {
            folder: true,
            count: countPositions(entry.folder),
            onClick: () => {
              trail.push(entry.folder);
              render();
            },
          }),
        );
      } else {
        const { position } = entry;
        menu.appendChild(
          item(position.title, {
            title: position.note || position.fen,
            onClick: () => {
              close();
              onSelect(position);
            },
          }),
        );
      }
    }
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (menu.hidden) {
      trail = [];
      render();
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    } else {
      close();
    }
  });
  document.addEventListener('click', (event) => {
    // composedPath : l'élément cliqué a pu être retiré du menu par render() avant d'arriver ici
    if (!menu.hidden && !event.composedPath().includes(menu)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}
