// How the street reacts to a racing boy (sim/traffic.ts decides when they ride: RACER_WINDOWS). Only whoever is out at
// that hour can react, each in their own way: by day the tea seller, the mechanic, the lottery seller, the scrap buyer
// and the flower seller; at night the hủ tiếu uncle (and his boy, who thinks the bike is cool) and the agents still
// around. The traffic police and the evening dance never meet one (the racing windows skip rush hour and the dance).
// Pure (no DOM).
import { tr } from '../../../../shared/i18n';

/** Who is reacting: one of the street's characters, or an agent out on the sidewalk. */
export type RacerWitness = 'tea' | 'banhmi' | 'lottery' | 'mechanic' | 'scrap' | 'flowers' | 'hutieu' | 'hutieuBoy' | 'bun' | 'trash' | 'agent';

const pick = (rng: () => number, lines: readonly string[]) => lines[Math.floor(rng() * lines.length)];

/** What they shout as the racing boy whizzes past. */
export function racerReaction(who: RacerWitness, rng: () => number): string {
  switch (who) {
    case 'tea':
      return pick(rng, [tr('Oh my, is that any way to ride?! 😱'), tr('Kids these days… 😤')]);
    case 'banhmi':
      return pick(rng, [tr('Slow down, son! 😱')]);
    case 'lottery':
      return pick(rng, [tr('Slow down and buy a ticket instead! 🎫')]);
    case 'mechanic':
      return pick(rng, [tr("Ride like that and you'll end up at my stall! 🔧"), tr("That engine's not going to last! 🔧")]);
    case 'scrap':
      return pick(rng, [tr('Good grief, he nearly hit my bike! 😱')]);
    case 'flowers':
      return pick(rng, [tr('Careful, you nearly crushed my flowers! 💐')]);
    case 'hutieu':
      return pick(rng, [tr('Watch it, you almost knocked over my broth! 😤')]);
    case 'hutieuBoy':
      return pick(rng, [tr('Whoa, cool bike! 🤩'), tr('So fast! 🤩')]);
    case 'bun':
      return pick(rng, [tr('Heavens, slow down! 😱')]);
    case 'trash':
      return pick(rng, [tr('Hey, mind the cart! 😤')]);
    case 'agent':
      return pick(rng, [tr('Whoa, slow down! 😱'), tr('Racing boy again… 😤'), tr('He nearly hit that bike! 😱'), tr("Where's the fire?! 😤")]);
  }
}
