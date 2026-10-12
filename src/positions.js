// ==================================================
// BIBLIOTHÈQUE DE POSITIONS — Winning Zone
// ==================================================
//
// Ce fichier est le seul à modifier pour alimenter le menu « bibliothèque »
// (bouton en forme de dossier, au-dessus du champ FEN).
//
// Chaque position est un objet :
//
//    path  = chemin dans le menu, du plus général au plus précis.
//            Le premier élément doit être l'une des 7 catégories ci-dessous ;
//            les suivants (autant que vous voulez) sont des sous-catégories
//            créées automatiquement la première fois qu'elles apparaissent.
//
//            Dans un nom (de sous-catégorie ou de position), tout groupe de lettres
//            placé entre accolades est remplacé par des figurines :
//               lettres françaises : R Roi, D Dame, T Tour, F Fou, C Cavalier, P Pion
//               MAJUSCULE = figurine blanche, minuscule = figurine noire
//
//               '{P}-Tour en 7ème'      →  [Pion blanc]-Tour en 7ème
//               '{p}-Tour en 7ème'      →  [Pion noir]-Tour en 7ème
//               '{RTP} vs {rt}'         →  Roi, Tour, Pion blancs  vs  Roi, Tour noirs
//               '{P}-{t} en 7ème'       →  [Pion blanc]-[Tour noire] en 7ème
//
//            Raccourci : 'fig: RTP vs RT' équivaut à '{RTP} vs {rt}'.
//
//    title = nom affiché dans le menu (et dans l'en-tête [Event] du PGN)
//
//    fen   = position de départ (le trait est choisi ensuite avec les
//            boutons Trait, comme pour un FEN saisi à la main)
//
//    note  = (facultatif) texte d'info affiché au survol dans le menu
//
// Exemple :
//
//    {
//        path: ['Finales de Tours', 'fig: RTP vs RT', 'Pion-Tour', 'Pion en 7ème rangée'],
//        title: 'Position de Lucena',
//        fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1'
//    },
//
// Dans chaque menu, les sous-catégories et les positions apparaissent dans
// l'ordre où elles sont écrites ci-dessous : il suffit donc de déplacer un
// bloc pour changer son rang. Un chemin ou un FEN invalide est signalé dans
// la console du navigateur (F12) et la position est ignorée.
// ==================================================

// Les 7 catégories (et leur ordre d'affichage)
export const categories = [
    'Mats Élémentaires',
    'Finales de Pions',
    'Finales de Cavaliers',
    'Finales de Fous',
    'Finales de Tours',
    'Finales de Dames',
    'Finales de Pièces'
];

export const positions = [

    // ---------- Mats Élémentaires ----------

    {
        path: ['Mats Élémentaires', 'fig: RD vs R'],
        title: 'Roi et Dame contre Roi',
        fen: '8/8/8/4k3/8/8/8/K2Q4 w - - 0 1'
    },

    {
        path: ['Mats Élémentaires', 'fig: RT vs R'],
        title: 'Roi et Tour contre Roi',
        fen: '8/8/8/4k3/8/8/8/K6R w - - 0 1'
    },

    {
        path: ['Mats Élémentaires', 'fig: RFC vs R'],
        title: 'Roi Fou et Cavalier contre Roi',
        fen: '8/8/8/4k3/8/8/8/N3K2B w - - 0 1'
    },

    // ---------- Finales de Pions ----------

    {
        path: ['Finales de Pions', 'fig: RP vs R'],
        title: 'Roi et Pion contre Roi — opposition',
        fen: '8/8/8/3k4/8/3K4/3P4/8 w - - 0 1'
    },

    {
        path: ['Finales de Pions', 'Positions célèbres'],
        title: 'Lasker–Reichhelm',
        fen: '8/k7/3p4/p2P1p2/P2P1P2/8/8/K7 w - - 0 1',
        note: 'Seul coup gagnant : 1.Rb1 (1.Ra2 et 1.Rb2 annulent)'
    },

    // Positions reprises de l'ancienne interface cc2 (à déplacer ou supprimer à votre guise)

    {
        path: ['Finales de Pions', 'Pions bloqués (cc2)'],
        title: 'Ebersz (Magyar Sakkvilag, 1930)',
        fen: '8/1p5k/1P1p4/3p4/3Pp2p/2K1P2p/7P/8 w - - 0 1'
    },

    {
        path: ['Finales de Pions', 'Pions bloqués (cc2)'],
        title: 'Ebersz (Magyar Sakkvilag, 1930)',
        fen: '7k/p7/P2p4/P2Pp3/4P3/4P1p1/6P1/K7 w - - 0 1'
    },

    {
        path: ['Finales de Pions', 'Pions bloqués (cc2)'],
        title: 'Zinar (Shakhmatnye Okonchaniya: Peshechnye, 1983)',
        fen: '5k2/1p6/pP2p3/Pp2P3/1P2P1p1/1K4P1/8/8 w - - 0 1'
    },

    {
        path: ['Finales de Pions', 'Pions bloqués (cc2)'],
        title: 'Bähr (Opposition und Kritische Felder im Bauernendspiel, 1936)',
        fen: '8/1p5k/1P2p3/1P2P3/4P1p1/5pP1/5P2/1K6 w - - 0 1'
    },

    {
        path: ['Finales de Pions', 'Pions bloqués (cc2)'],
        title: 'Zinar (Shakhmatnye Okonchaniya: Peshechnye, 1983)',
        fen: '8/1p5k/1P2p3/1P2P3/4P1p1/5pP1/K4P2/8 w - - 0 1'
    },

    {
        path: ['Finales de Pions', 'Pions bloqués (cc2)'],
        title: 'Bianchetti (L\'Italia Scacchistica, 1925)',
        fen: '7k/1p6/1P2p3/1P2P3/4P1p1/6P1/8/K7 w - - 0 1'
    },

    // ---------- Finales de Tours ----------

    {
        path: ['Finales de Tours', 'fig: RTP vs RT', '{P}-Tour', '{P} en 7ème rangée'],
        title: 'Position de Lucena',
        fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1'
    },

    // ---------- Finales de Dames ----------

    {
        path: ['Finales de Dames', 'fig: RD vs RP', '{p}-Tour en 7ème', 'Attaque verticale'],
        title: 'Attaque verticale',
        fen: 'Q7/8/8/8/1K6/8/pk6/8 w - - 0 1'
    }

    // ---------- Finales de Cavaliers, de Fous, de Dames, de Pièces : à compléter ----------

];
