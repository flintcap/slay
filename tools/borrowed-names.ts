/**
 * Names from the game SLAY draws on. None may show up in a name a player
 * reads.
 *
 * `BORROWED` holds made-up names (people, places, coined item names): one of
 * these anywhere in our name, word for word, is a copy. `BORROWED_TITLES`
 * holds names that are plain words too ("Oath", "Leviathan", "Steel"): only
 * a name that is exactly one of these, "The" aside, is a copy. `BORROWED_RUNES`
 * are rune names, a copy as "<name>" or "<name> Rune".
 */
export const BORROWED: readonly string[] = [
  'Windforce', 'Buriza-Do Kyanon', 'Buriza', 'Shako', 'Harlequin Crest', 'Stone of Jordan', 'Mara\'s Kaleidoscope', 'Mara',
  'Arachnid Mesh', 'Tyrael\'s Might', 'Tyrael', 'Griffon\'s Eye', 'Death\'s Fathom', 'Eschuta\'s Temper', 'Eschuta', 'Zakarum',
  'Titan\'s Revenge', 'Arreat\'s Face', 'Arreat', 'Skin of the Vipermagi', 'Vipermagi', 'Dracul\'s Grasp', 'Dracul',
  'Verdungo\'s Hearty Cord', 'Verdungo', 'Highlord\'s Wrath', 'Highlord', 'Death\'s Web', 'Nagelring', 'Manald Heal', 'Manald',
  'Bul-Kathos', 'Bul Kathos', 'Rixot\'s Keen', 'Rixot', 'Jade Tan Do', 'Civerb', 'Cleglaw', 'Griswold', 'Andariel\'s Visage',
  'Kira\'s Guardian', 'Vampire Gaze', 'Wisp Projector', 'Hellfire Torch', 'Annihilus', 'Gheed', 'Gheed\'s Fortune', 'Nosferatu\'s Coil',
  'Thundergod\'s Vigor', 'War Traveler', 'Sandstorm Trek', 'Occulus', 'Lycander', 'Titan\'s Grip', 'Ondal\'s Wisdom', 'Ondal',
  'Spectral Shard', 'Blackhorn\'s Face', 'Templar\'s Might', 'Que-Hegan', 'Ormus', 'Ormus\' Robes', 'Mang Song', 'Tal Rasha', 'Natalya',
  'Trang-Oul', 'Immortal King', 'Aldur', 'Griswold\'s Legacy', 'Sigon', 'Tancred', 'Cathan', 'Angelic Raiment', 'Arctic Gear',
  'Berserker\'s Arsenal', 'Death\'s Disguise', 'Isenhart', 'Iratha', 'Milabrega', 'Vidala', 'Hwanin', 'M\'avina', 'Sazabi', 'Cow King',
  'Heaven\'s Brethren', 'Call to Arms', 'Heart of the Oak', 'Breath of the Dying', 'Chains of Honor', 'Ancient\'s Pledge', 'Diablo',
  'Baal', 'Mephisto', 'Andariel', 'Duriel', 'Izual', 'Hephasto', 'Nihlathak', 'Bishibosh', 'Blood Raven', 'Corpsefire', 'Rakanishu',
  'Treehead Woodfist', 'Coldcrow', 'Radament', 'Horadric', 'Horadrim', 'Kashya', 'Akara', 'Charsi', 'Deckard Cain', 'Lut Gholein',
  'Kurast', 'Harrogath', 'Tristram', 'Worldstone', 'Lilith', 'Inarius', 'Malthael', 'Imperius', 'Auriel', 'Itherael', 'Leoric', 'Bartuc',
  'Mendeln', 'Rathma', 'Zoltun Kulle', 'Kulle', 'Azmodan', 'Belial',
];

export const BORROWED_TITLES: readonly string[] = [
  'Adria', 'Azurewrath', 'Beast', 'Bloodfist', 'Bloodrise', 'Botd', 'Butcher', 'Cain', 'Carrion Wind', 'Chance Guards', 'Crown of Ages',
  'Destruction', 'Doom', 'Doombringer', 'Dream', 'Duskdeep', 'Eaglehorn', 'Enigma', 'Exile', 'Faith', 'Felloak', 'Fortitude', 'Frostburn',
  'Frostwind', 'Gaze of Hell', 'Gnasher', 'Goldstrike', 'Goldwrap', 'Gore Rider', 'Gorefoot', 'Grandfather', 'Gravepalm', 'Greyform',
  'Grief', 'Guardian Angel', 'Hellslayer', 'Herald of Zakarum', 'Hexfire', 'Homunculus', 'Hotspur', 'Infinity', 'Insight', 'Kingslayer',
  'Last Wish', 'Lawbringer', 'Leaf', 'Leah', 'Leviathan', 'Lidless Wall', 'Lightsabre', 'Lister', 'Lore', 'Magefist', 'Malice',
  'Marrowwalk', 'Metalgrid', 'Nadir', 'Naj', 'Nightsmoke', 'Oath', 'Oculus', 'Phoenix', 'Pluckeye', 'Pride', 'Raven Frost', 'Ravenfrost',
  'Rhyme', 'Rockstopper', 'Sanctuary', 'Shadow Dancer', 'Shaftstop', 'Silence', 'Silkweave', 'Skystrike', 'Smoke', 'Soul Drainer',
  'Spirit', 'Stealth', 'Steel', 'Steelclash', 'Steelrend', 'Stormchaser', 'Stormshield', 'String of Ears', 'Summoner', 'The Grandfather',
  'The Smith', 'Thunderstroke', 'Treachery', 'Uber', 'Valkyrie Wing', 'Venom Ward', 'Waterwalk', 'Widowmaker', 'Witherstring',
  'Wizardspike', 'Wormskull', 'Zephyr',
];

export const BORROWED_RUNES: readonly string[] = [
  'Zod', 'Jah', 'Ber', 'Cham', 'Lo', 'Sur', 'Ohm', 'Vex', 'Gul', 'Ist', 'Mal', 'Um', 'Pul', 'Lem', 'Fal', 'Ko', 'Lum', 'Io', 'Hel', 'Dol',
  'Shael', 'Sol', 'Amn', 'Thul', 'Ort', 'Ral', 'Tal', 'Ith', 'Eth', 'Nef', 'Tir', 'Eld', 'El',
];
