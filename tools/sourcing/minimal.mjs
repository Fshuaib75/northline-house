// Northline's minimal look, as a sourcing rule. Owner decision, 24 Oct 2026: "more minimal sourcing".
// A candidate is kept only if its colour is calm and nothing in its supplier title, model or colour names a loud
// detail. Small gold-tone hardware, simple buckles, plain leather, suede and nubuck are fine.
// Hijabs and other head coverings keep any solid colour (a burgundy hijab is a staple), but still no prints.

const low = s => String(s || '').toLocaleLowerCase('tr');

// Colour families from tools/extension/guess.js that read as quiet.
const CALM_FAMILIES = new Set(['Black', 'Brown', 'Tan & camel', 'Beige & nude', 'White', 'Grey']);
// Inside louder families, these named colours are still classic neutrals.
const CALM_COLOURS = new Set(['navy', 'khaki', 'olive']);

// English and Turkish words for details the brand doesn't carry. Matched as whole words or word starts.
const LOUD = [
  ['print', 'printed', 'pattern', 'baskı', 'baskılı', 'desen', 'desenli', 'monogram', 'logo', 'logolu'],
  ['leopard', 'leopar', 'zebra', 'snake', 'yılan', 'croc', 'croco', 'kroko', 'python', 'piton'],
  ['crystal', 'kristal', 'rhinestone', 'taşlı', 'jewel', 'mücevher', 'embellished', 'süslü'],
  ['stud', 'studded', 'zımba', 'zımbalı', 'trok', 'troklu', 'bow', 'fiyonk', 'fiyonklu', 'pearl', 'inci', 'incili'],
  ['glitter', 'sim', 'simli', 'sequin', 'pul', 'pullu', 'satin', 'saten', 'neon', 'holographic', 'hologram'],
  ['mesh', 'file', 'fileli', 'platform', 'metallic', 'metalik'],
].flat();
const LOUD_RE = new RegExp(`(^|[^\\p{L}])(${LOUD.join('|')})(?=[^\\p{L}]|$)`, 'u');
const HEAD_COVERING = /hijab|eşarp|şal|başörtü|türban|bone/u;

export function minimalCheck(item, title = '') {
  const text = low([title, item?.model, item?.colour].join(' '));
  const loud = text.match(LOUD_RE);
  if (loud) return {ok: false, reason: `Not minimal: "${loud[2]}"`};
  if (item?.cat === 'clothing' && HEAD_COVERING.test(text)) return {ok: true, reason: ''};
  const colour = low(item?.colour);
  if (CALM_FAMILIES.has(item?.fam) || CALM_COLOURS.has(colour)) return {ok: true, reason: ''};
  return {ok: false, reason: `Not minimal: ${item?.colour || 'unknown'} colour`};
}
