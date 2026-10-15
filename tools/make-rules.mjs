// Generates src/shared/rules.generated.json from content/content.json:
// the STRUCTURE of the game (ids, decks, effects) with ALL game text stripped.
// This file contains no copyrighted text and is bundled into both client and server.
import fs from 'node:fs';
if (!fs.existsSync('content/content.json') && fs.existsSync('src/shared/rules.generated.json')) {
  console.log('content/content.json not present: keeping the committed rules.generated.json (it contains no game text).');
  process.exit(0);
}
const src = JSON.parse(fs.readFileSync('content/content.json', 'utf8'));

const isText = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.keys(o).length === 2 && 'it' in o && 'en' in o;
function strip(o) {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (isText(v) || k === 'note' && typeof v === 'string') continue;
      out[k] = strip(v);
    }
    return out;
  }
  return o;
}

const rules = {
  settings: {
    gameLengthMinutes: src.settings.gameLengthMinutes,
    clueSchedule: src.settings.clueSchedule,
    dealtClueTimestamps: src.settings.dealtClueTimestamps,
    swapRuleMinutes: src.settings.swapRuleMinutes,
    videoId: src.settings.videoTimer.youtubeId
  },
  characters: src.characters.map((c) => ({ id: c.id, facilitator: !!c.facilitator })),
  drives: src.drives.map((d) => ({ id: d.id })),
  locations: src.locations.map((l) => ({ id: l.id, copies: l.copies })),
  suspects: src.suspects.map((s) => ({ id: s.id, copies: s.copies })),
  searchCards: src.searchCards.map((s) => ({ id: s.id })),
  posterCount: src.posters.items.length,
  clueCards: src.clueCards.map((c) => ({
    id: c.id, timestamp: c.timestamp, variant: c.variant,
    sensitive: !!c.sensitive, removableByFacilitator: !!c.removableByFacilitator,
    effects: strip(c.effects)
  }))
};
fs.writeFileSync('src/shared/rules.generated.json', JSON.stringify(rules, null, 1));
console.log('rules.generated.json written:', rules.clueCards.length, 'clue cards');
