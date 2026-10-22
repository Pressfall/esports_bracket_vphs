/* Fighters in Super Smash Bros. Ultimate, in roster order (DLC included), with the file name of
   each fighter's stock icon in assets/characters/ (the game's own codename for the fighter).
   Pokémon Trainer and Pyra / Mythra are one pick each, like on the character select screen. */
const Characters = (() => {
  const list = [
    ['Mario', 'mario'], ['Donkey Kong', 'donkey'], ['Link', 'link'], ['Samus', 'samus'],
    ['Dark Samus', 'samusd'], ['Yoshi', 'yoshi'], ['Kirby', 'kirby'], ['Fox', 'fox'],
    ['Pikachu', 'pikachu'], ['Luigi', 'luigi'], ['Ness', 'ness'], ['Captain Falcon', 'captain'],
    ['Jigglypuff', 'purin'], ['Peach', 'peach'], ['Daisy', 'daisy'], ['Bowser', 'koopa'],
    ['Ice Climbers', 'ice_climber'], ['Sheik', 'sheik'], ['Zelda', 'zelda'], ['Dr. Mario', 'mariod'],
    ['Pichu', 'pichu'], ['Falco', 'falco'], ['Marth', 'marth'], ['Lucina', 'lucina'],
    ['Young Link', 'younglink'], ['Ganondorf', 'ganon'], ['Mewtwo', 'mewtwo'], ['Roy', 'roy'],
    ['Chrom', 'chrom'], ['Mr. Game & Watch', 'gamewatch'], ['Meta Knight', 'metaknight'], ['Pit', 'pit'],
    ['Dark Pit', 'pitb'], ['Zero Suit Samus', 'szerosuit'], ['Wario', 'wario'], ['Snake', 'snake'],
    ['Ike', 'ike'], ['Pokémon Trainer', 'ptrainer'], ['Diddy Kong', 'diddy'], ['Lucas', 'lucas'],
    ['Sonic', 'sonic'], ['King Dedede', 'dedede'], ['Olimar', 'pikmin'], ['Lucario', 'lucario'],
    ['R.O.B.', 'robot'], ['Toon Link', 'toonlink'], ['Wolf', 'wolf'], ['Villager', 'murabito'],
    ['Mega Man', 'rockman'], ['Wii Fit Trainer', 'wiifit'], ['Rosalina & Luma', 'rosetta'],
    ['Little Mac', 'littlemac'], ['Greninja', 'gekkouga'], ['Mii Brawler', 'miifighter'],
    ['Mii Swordfighter', 'miiswordsman'], ['Mii Gunner', 'miigunner'], ['Palutena', 'palutena'],
    ['Pac-Man', 'pacman'], ['Robin', 'reflet'], ['Shulk', 'shulk'], ['Bowser Jr.', 'koopajr'],
    ['Duck Hunt', 'duckhunt'], ['Ryu', 'ryu'], ['Ken', 'ken'], ['Cloud', 'cloud'], ['Corrin', 'kamui'],
    ['Bayonetta', 'bayonetta'], ['Inkling', 'inkling'], ['Ridley', 'ridley'], ['Simon', 'simon'],
    ['Richter', 'richter'], ['King K. Rool', 'krool'], ['Isabelle', 'shizue'], ['Incineroar', 'gaogaen'],
    ['Piranha Plant', 'packun'], ['Joker', 'jack'], ['Hero', 'brave'], ['Banjo & Kazooie', 'buddy'],
    ['Terry', 'dolly'], ['Byleth', 'master'], ['Min Min', 'tantan'], ['Steve', 'pickel'],
    ['Sephiroth', 'edge'], ['Pyra / Mythra', 'eflame'], ['Kazuya', 'demon'], ['Sora', 'trail']
  ];
  const files = new Map(list);
  const roster = Object.freeze(list.map(([name]) => name));

  // Pickers list fighters A–Z.
  const sorted = Object.freeze(roster.slice().sort((a, b) => a.localeCompare(b)));

  // Path to a fighter's stock icon, or '' for an unknown name.
  function icon(name) {
    const file = files.get(name);
    return file ? `assets/characters/${file}.png` : '';
  }

  // Lowercase without accents, so "pokemon" finds "Pokémon Trainer".
  function searchKey(name) {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  return { roster, sorted, icon, searchKey };
})();
