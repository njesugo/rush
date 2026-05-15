/**
 * Text-cut templates — frame factories.
 *
 * Each template returns the surrounding content for a single "cut" of the
 * viral text-match-cut effect. The anchor word is rendered as a separate,
 * pixel-locked layer by the Remotion composition; templates only fill the
 * variable space ABOVE and BELOW the anchor.
 *
 * Variety is the goal: titles, paragraph styles, lists, quotes, columns —
 * the eye should feel it's flipping through different documents while the
 * single highlighted word stays nailed in place.
 */

import type { TextCutFrame, TextCutLanguage } from "@rush/db";

type TemplateFn = (word: string) => TextCutFrame;

/* ------------------------------------------------------------------------- */
/* FR templates                                                              */
/* ------------------------------------------------------------------------- */

const FR_TEMPLATES: TemplateFn[] = [
  // 1. Article de dictionnaire
  (w) => ({
    title: `${w}, n.m.`,
    before: "Du latin classique. Premier emploi attesté en 1690 dans les",
    after: `dictionnaires de l'époque. Synonymes proches : forme, idée, principe.`,
    layout: "paragraph",
  }),
  // 2. Extrait roman
  (w) => ({
    title: "Chapitre VII",
    before: `Elle relut la lettre une dernière fois. Le mot revenait sans cesse, comme un`,
    after: `lancinant qu'elle ne pouvait plus chasser. Il pleuvait sur les tuiles.`,
    layout: "paragraph",
  }),
  // 3. Article Wikipédia-like
  (w) => ({
    title: "Article",
    before: "Selon plusieurs sources, le concept est documenté dès l'Antiquité tardive et concerne",
    after: "l'ensemble des phénomènes liés à la perception, la mémoire et l'attention.",
    layout: "paragraph",
  }),
  // 4. Liste à puces
  (w) => ({
    title: "Trois choses à retenir",
    before: "• Toujours commencer par l'essentiel\n• Ne jamais oublier le",
    after: "• Et savoir reconnaître quand s'arrêter",
    layout: "list",
  }),
  // 5. Citation
  (w) => ({
    title: null,
    before: `« Au commencement était le`,
    after: `», disait-il en souriant. Personne ne sut jamais s'il plaisantait.`,
    layout: "quote",
  }),
  // 6. Mode d'emploi
  (w) => ({
    title: "Mode d'emploi",
    before: "Étape 3. Localisez la zone marquée et identifiez le",
    after: "principal avant de poursuivre l'assemblage selon le schéma joint.",
    layout: "paragraph",
  }),
  // 7. Colonne presse
  (w) => ({
    title: "Édito du jour",
    before: "Disons-le franchement : on a perdu le sens du",
    after: "et c'est probablement ce qui explique tout le reste, à y regarder de près.",
    layout: "columns",
  }),
  // 8. Manuscrit ancien
  (w) => ({
    title: "Manuscrit, fol. 12r",
    before: "Et estoit là escript en lettres d'or le mot",
    after: "que nul homme ne pouvoit prononcer sans en frémir d'aise et de crainte.",
    layout: "paragraph",
  }),
  // 9. Recette
  (w) => ({
    title: "Recette familiale",
    before: "Ajoutez progressivement, en remuant doucement, le",
    after: "que vous aurez préalablement réservé. Cuisson : 12 minutes à feu doux.",
    layout: "list",
  }),
  // 10. Note marginale
  (w) => ({
    title: null,
    before: "Note (en marge, encre bleue) — penser à demander à Marie ce qu'elle entend exactement par",
    after: ". Elle ne l'a jamais vraiment expliqué et c'est étrange.",
    layout: "paragraph",
  }),
];

/* ------------------------------------------------------------------------- */
/* EN templates                                                              */
/* ------------------------------------------------------------------------- */

const EN_TEMPLATES: TemplateFn[] = [
  (w) => ({
    title: `${w}, noun`,
    before: "From Old French, attested since the late 14th century. Often used to describe",
    after: "the underlying form, pattern, or guiding principle of something larger.",
    layout: "paragraph",
  }),
  (w) => ({
    title: "Chapter VII",
    before: "She read the letter again. The word kept coming back, a stubborn little",
    after: "she could not push out of her head. Outside, it was raining on the slates.",
    layout: "paragraph",
  }),
  (w) => ({
    title: "Article",
    before: "According to several sources, the concept has been documented since late antiquity, encompassing",
    after: "all phenomena tied to perception, memory and attention in the broader sense.",
    layout: "paragraph",
  }),
  (w) => ({
    title: "Three things to remember",
    before: "• Always lead with what matters\n• Never forget the",
    after: "• And know when to stop talking",
    layout: "list",
  }),
  (w) => ({
    title: null,
    before: `"In the beginning was the`,
    after: `," he would say, smiling. No one ever quite knew whether he was joking.`,
    layout: "quote",
  }),
  (w) => ({
    title: "Instructions",
    before: "Step 3. Locate the marked area and identify the main",
    after: "before continuing the assembly as shown in the attached diagram.",
    layout: "paragraph",
  }),
  (w) => ({
    title: "Today's editorial",
    before: "Let's be honest about it: we have lost any real sense of the",
    after: "and that probably explains everything else once you start to look closely.",
    layout: "columns",
  }),
  (w) => ({
    title: "Manuscript, fol. 12r",
    before: "And ther was writ in letres of gold the word",
    after: "which no man durste speke aloude withouten gret tremblynge.",
    layout: "paragraph",
  }),
  (w) => ({
    title: "Family recipe",
    before: "Slowly stir in, a little at a time, the",
    after: "you set aside earlier. Bake for 12 minutes on low heat.",
    layout: "list",
  }),
  (w) => ({
    title: null,
    before: "Note (margin, blue ink) — ask Marie what she actually means by",
    after: ". She has never really explained it and that is strange.",
    layout: "paragraph",
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
