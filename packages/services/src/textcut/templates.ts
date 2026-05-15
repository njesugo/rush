/**
 * Text-cut templates — frame factories.
 *
 * Each template returns the surrounding content for a single "cut" of the
 * viral text-match-cut effect. The anchor word is rendered as a separate,
 * pixel-locked layer by the Remotion composition; templates fill the page
 * top-to-bottom with dense text, and place the anchor INLINE on the middle
 * line via `inlinePrefix` / `inlineSuffix`.
 *
 * Lines should be short (≈ 10-18 chars). Long lines bleed off the edges,
 * which is part of the intended look.
 */

import type { TextCutFrame, TextCutLanguage } from "@rush/db";

type TemplateFn = (word: string) => TextCutFrame;

/* Each cut has 6 lines above + anchor line + 6 lines below = 13 visible rows. */

const FR_TEMPLATES: TemplateFn[] = [
  // 1. Roman / chapitre
  () => ({
    layout: "novel",
    linesAbove: [
      "Elle relut la",
      "lettre une",
      "dernière fois.",
      "Le mot revenait",
      "sans cesse,",
      "comme un",
    ],
    inlinePrefix: "battement",
    inlineSuffix: "lancinant",
    linesBelow: [
      "qu'elle ne",
      "pouvait plus",
      "chasser de sa",
      "tête. Dehors,",
      "il pleuvait",
      "sur les tuiles.",
    ],
  }),

  // 2. Article / dictionnaire
  () => ({
    layout: "press",
    linesAbove: [
      "Du latin",
      "classique,",
      "premier emploi",
      "attesté en 1690",
      "dans les",
      "ouvrages de",
    ],
    inlinePrefix: "référence,",
    inlineSuffix: "désigne",
    linesBelow: [
      "depuis lors",
      "l'ensemble des",
      "phénomènes",
      "associés à la",
      "perception, la",
      "mémoire et l'",
    ],
  }),

  // 3. Manuscrit médiéval
  () => ({
    layout: "manuscript",
    linesAbove: [
      "Et estoit là",
      "escript en",
      "lettres d'or",
      "sur le vieux",
      "parchemin, le",
      "très grand et",
    ],
    inlinePrefix: "très saint",
    inlineSuffix: "que",
    linesBelow: [
      "nul homme ne",
      "pouvoit dire",
      "à voix haulte",
      "sans en frémir",
      "d'aise et de",
      "crainte aussi.",
    ],
  }),

  // 4. Édito presse
  () => ({
    layout: "press",
    linesAbove: [
      "Disons-le",
      "franchement :",
      "on a perdu",
      "depuis un",
      "moment déjà",
      "le sens du mot",
    ],
    inlinePrefix: "et du",
    inlineSuffix: "principe",
    linesBelow: [
      "qui allait avec,",
      "et c'est sans",
      "doute ce qui",
      "explique tout",
      "le reste, à y",
      "bien repenser.",
    ],
  }),

  // 5. Note marginale, tapuscrit
  () => ({
    layout: "typewriter",
    linesAbove: [
      "Note (encre",
      "bleue, en marge)",
      "demander à Marie",
      "ce qu'elle",
      "entend exactement",
      "par ce drôle de",
    ],
    inlinePrefix: "petit",
    inlineSuffix: "qu'elle",
    linesBelow: [
      "emploie sans",
      "cesse depuis",
      "quelques mois",
      "comme si nous",
      "devions tous",
      "savoir d'avance.",
    ],
  }),

  // 6. Marginalia poétique
  () => ({
    layout: "marginalia",
    linesAbove: [
      "Au commencement",
      "il y avait",
      "le silence,",
      "puis vint enfin",
      "la lumière, puis",
      "tout doucement",
    ],
    inlinePrefix: "vint le",
    inlineSuffix: "—",
    linesBelow: [
      "et tout le",
      "reste découla",
      "de cette",
      "première petite",
      "syllabe que nul",
      "n'osa répéter.",
    ],
  }),

  // 7. Mode d'emploi
  () => ({
    layout: "typewriter",
    linesAbove: [
      "ÉTAPE 3.",
      "Localisez la",
      "zone marquée",
      "d'un trait jaune",
      "et identifiez",
      "soigneusement",
    ],
    inlinePrefix: "le",
    inlineSuffix: "principal",
    linesBelow: [
      "avant de",
      "poursuivre",
      "l'assemblage",
      "selon le schéma",
      "joint à la fin",
      "du présent livret.",
    ],
  }),

  // 8. Carnet intime
  () => ({
    layout: "novel",
    linesAbove: [
      "Je n'ai jamais",
      "bien compris",
      "d'où venait,",
      "au juste, cette",
      "récente",
      "obsession pour",
    ],
    inlinePrefix: "le",
    inlineSuffix: "qui revient",
    linesBelow: [
      "tous les soirs",
      "dans mes rêves",
      "et que je",
      "n'arrive jamais",
      "tout à fait,",
      "moi, à dire.",
    ],
  }),

  // 9. Sermon
  () => ({
    layout: "press",
    linesAbove: [
      "Mes chers amis,",
      "je vous le dis",
      "ce soir avec",
      "la plus grande",
      "des fermetés :",
      "le véritable",
    ],
    inlinePrefix: "et noble",
    inlineSuffix: "n'est",
    linesBelow: [
      "pas là où vous",
      "le cherchez, ni",
      "là où vous le",
      "croyez tous,",
      "sans la moindre",
      "des exceptions.",
    ],
  }),

  // 10. Recette
  () => ({
    layout: "typewriter",
    linesAbove: [
      "Ajoutez",
      "progressivement,",
      "en remuant",
      "doucement, le",
      "fameux et très",
      "ancien petit",
    ],
    inlinePrefix: "petit",
    inlineSuffix: "que",
    linesBelow: [
      "vous aurez bien",
      "réservé. Cuisson",
      "douze minutes",
      "à feu doux puis",
      "laissez reposer",
      "cinq minutes.",
    ],
  }),
];

const EN_TEMPLATES: TemplateFn[] = [
  // 1. Novel chapter
  () => ({
    layout: "novel",
    linesAbove: [
      "She read the",
      "letter again,",
      "very slowly.",
      "The word kept",
      "coming back,",
      "a stubborn",
    ],
    inlinePrefix: "little",
    inlineSuffix: "she",
    linesBelow: [
      "could not push",
      "out of her",
      "head. Outside,",
      "it was raining",
      "softly on the",
      "old grey slates.",
    ],
  }),

  // 2. Dictionary article
  () => ({
    layout: "press",
    linesAbove: [
      "From Old French,",
      "attested since",
      "the late 14th",
      "century. Often",
      "used loosely",
      "to describe the",
    ],
    inlinePrefix: "deeper",
    inlineSuffix: "or pattern",
    linesBelow: [
      "underlying any",
      "given thing,",
      "any system, or",
      "any form of",
      "human or natural",
      "organisation.",
    ],
  }),

  // 3. Manuscript
  () => ({
    layout: "manuscript",
    linesAbove: [
      "And ther was",
      "writ in letres",
      "of gold up on",
      "the parchemyn",
      "wel and faire,",
      "the gret and",
    ],
    inlinePrefix: "holy",
    inlineSuffix: "which",
    linesBelow: [
      "no man durste",
      "speke aloude",
      "withouten gret",
      "tremblynge of",
      "soule and of",
      "his hooly herte.",
    ],
  }),

  // 4. Editorial
  () => ({
    layout: "press",
    linesAbove: [
      "Let us be",
      "honest about",
      "this for once:",
      "we have lost,",
      "somewhere along",
      "the way, the",
    ],
    inlinePrefix: "very",
    inlineSuffix: "and that",
    linesBelow: [
      "probably",
      "explains every-",
      "thing else once",
      "you start to",
      "look at it all",
      "a little closer.",
    ],
  }),

  // 5. Margin note
  () => ({
    layout: "typewriter",
    linesAbove: [
      "Note (margin,",
      "blue ink) —",
      "ask Marie what",
      "she actually",
      "means by this",
      "strange little",
    ],
    inlinePrefix: "tiny",
    inlineSuffix: "she keeps",
    linesBelow: [
      "using over and",
      "over again as",
      "if we were all",
      "supposed to",
      "know what she",
      "really means.",
    ],
  }),

  // 6. Marginalia
  () => ({
    layout: "marginalia",
    linesAbove: [
      "In the very",
      "beginning there",
      "was only the",
      "silence, then",
      "came the light,",
      "and then, last,",
    ],
    inlinePrefix: "came the",
    inlineSuffix: "—",
    linesBelow: [
      "and from this",
      "single very",
      "small first",
      "syllable, the",
      "rest of the",
      "world unfolded.",
    ],
  }),

  // 7. Instructions
  () => ({
    layout: "typewriter",
    linesAbove: [
      "STEP 3.",
      "Locate the",
      "marked area on",
      "the diagram",
      "and identify",
      "the main",
    ],
    inlinePrefix: "central",
    inlineSuffix: "before",
    linesBelow: [
      "continuing the",
      "assembly as",
      "shown on the",
      "attached fold-",
      "out diagram",
      "at the end.",
    ],
  }),

  // 8. Diary
  () => ({
    layout: "novel",
    linesAbove: [
      "I have never",
      "quite understood",
      "where it comes",
      "from, this",
      "recent silly",
      "obsession with",
    ],
    inlinePrefix: "the",
    inlineSuffix: "that comes",
    linesBelow: [
      "back every",
      "single night",
      "into my dreams",
      "and that I can",
      "never really",
      "properly say.",
    ],
  }),

  // 9. Sermon
  () => ({
    layout: "press",
    linesAbove: [
      "My dear",
      "friends, I",
      "tell you this",
      "evening with",
      "the very",
      "greatest of",
    ],
    inlinePrefix: "true",
    inlineSuffix: "is not",
    linesBelow: [
      "where you are",
      "looking for",
      "it, nor where",
      "you all so",
      "easily believe",
      "it must be.",
    ],
  }),

  // 10. Recipe
  () => ({
    layout: "typewriter",
    linesAbove: [
      "Slowly stir",
      "in, a little",
      "bit at a time,",
      "the famous and",
      "very old little",
      "secret family",
    ],
    inlinePrefix: "secret",
    inlineSuffix: "you",
    linesBelow: [
      "will have set",
      "carefully aside",
      "earlier. Bake",
      "for twelve",
      "minutes on a",
      "very low heat.",
    ],
  }),
];

/* ------------------------------------------------------------------------- */
/* Public API                                                                */
/* ------------------------------------------------------------------------- */

/** Pick `count` random distinct templates and instantiate them with `word`. */
export function buildFrames(
  word: string,
  language: TextCutLanguage,
  count = 5
): TextCutFrame[] {
  const pool = language === "en" ? EN_TEMPLATES : FR_TEMPLATES;
  const n = Math.max(4, Math.min(6, count));
  const indices = shuffle([...pool.keys()]).slice(0, n);
  return indices.map((i) => pool[i]!(word));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
