#!/usr/bin/env node
/**
 * Writes prompts-batch3-success.json (100 success only) for generate-reward-images.mjs
 * Run: node scripts/reward-images/emit-batch3-success-prompts.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CORE =
  "Exact same cartoon German teacher from reference: black ponytail, huge googly eyes, teal cardigan over bright yellow turtleneck, green lanyard with white ID badge, dark blue pants, black shoes, stocky proportions. ";

/** @type {Array<[string, string]>} scene, bubble */
const SUCCESS_DATA = [
  ["Rides blue Vespa no helmet through giant soap bubble storm, rainbow trails.", "Seifen"],
  ["Vespa hits ramp flies over shark pool cartoon rubber sharks snapping harmless.", "Hai"],
  ["Giant magnet lifts Vespa vertically, she grips handlebars hair up, silly.", "Hoch"],
  ["Parade of rubber ducks blocking street, honking Vespa horn, ducks scatter.", "Enten"],
  ["Inflatable castle bounces her off seat onto soft wall, giggling.", "Hüpfen"],
  ["Giant pizza frisbee slices spin around her head like halo.", "Pizza"],
  ["Vespa towing giant foam finger sports fan, wobbling.", "Fan"],
  ["Snowball machine gun cartoon snow piles on Vespa, carrot nose stuck.", "Schnee"],
  ["Lightning bolt cartoon zigzag hair standing, scorched soot smile.", "Blitz"],
  ["Giant gum bubble from mouth lifts Vespa floating up, pop.", "Kaugummi"],
  ["Marching band tuba stuck on Vespa horn stuck sound waves visible.", "Musik"],
  ["Giant feather tickles nose while riding sneeze launches Vespa skid.", "Hatschi"],
  ["Vespa inside giant hamster ball rolling downhill.", "Kugel"],
  ["Alien tractor beam swaps her helmet for bowl of spaghetti silly.", "Alien"],
  ["Giant stapler tries to staple clouds, misses staples her lanyard comically.", "Heft"],
  ["Vespa rodeo bucking bronco style cartoon dust.", "Yeehaw"],
  ["Hundred birthday candles on Vespa seat melt wax puddle slip.", "Kerzen"],
  ["Giant fly swatter misses fly hits Vespa seat spring bounce.", "Fliege"],
  ["Vespa stuck in giant sticky tape roll mummy wrap.", "Klebe"],
  ["Giant pencil draws road lines under wheels moving.", "Stift"],
  ["Vespa in washing machine drum spinning suds foam beard.", "Waschen"],
  ["Giant cuckoo clock bird pecks her hat off.", "Kuckuck"],
  ["Vespa pulls wagon of squeaky toys avalanche.", "Quietschen"],
  ["Giant pepper shaker sneeze explosion red cloud.", "Pfeffer"],
  ["Vespa on tightrope circus net below.", "Seil"],
  ["Giant snail racing beside her winning slowly.", "Schnecke"],
  ["Lightning McQueen style boost strips cartoon flames harmless.", "Schnell"],
  ["Giant glue bottle cap stuck on wheel sticky circles.", "Kleber"],
  ["Vespa through car wash brushes spinning silly hair.", "Wäsche"],
  ["Giant egg cracks on head sunny side up on cardigan.", "Ei"],
  ["Vespa jumps ramp through ring of fire cartoon hoop cold.", "Feuer"],
  ["Giant spider web across path she breaks through string cheese.", "Spinne"],
  ["Vespa with rocket strapped cartoon loop de loop.", "Rakete"],
  ["Giant whoopee cushion city hall steps launch.", "Plopp"],
  ["Vespa in bumper car arena other cars plush.", "Autoscooter"],
  ["Giant hair dryer wind tunnel hair vertical.", "Föhn"],
  ["Vespa stuck in giant jelly dessert wobble.", "Wackel"],
  ["Giant stamp THUMP leaves imprint on ground beside her.", "Stempel"],
  ["Vespa pulls giant roll of toilet paper trail city.", "Papier"],
  ["Giant fly paper stuck to face peel.", "Fliegen"],
  ["Vespa on ice skates frozen pond penguin chase.", "Eis"],
  ["Giant cork pops champagne spray celebration.", "Kork"],
  ["Vespa in tornado cartoon cow flying not scary.", "Wind"],
  ["Giant tape measure wraps around like mummy.", "Mass"],
  ["Vespa through paint tunnel rainbow stripes on face.", "Farben"],
  ["Giant boxing glove on spring from mailbox.", "Boxen"],
  ["Vespa with sidecar full of puppies licking.", "Welpen"],
  ["Giant sandcastle collapses on Vespa bury.", "Sand"],
  ["Vespa on pogo stick hybrid bouncing.", "Hüpf"],
  ["Giant mirror reflects infinite Vespas dizzy.", "Spiegel"],
  ["Vespa through giant keyhole frame silly.", "Schlüssel"],
  ["Giant rubber band slingshot launches Vespa arc.", "Gummi"],
  ["Vespa in cereal bowl splash milk mustache.", "Milch"],
  ["Giant clock hands spin her around.", "Uhr"],
  ["Vespa with giant foam cowboy hat tips.", "Cowboy"],
  ["Giant pin cushion seat ouch jump.", "Nadel"],
  ["Vespa in hamster tube transparent curves.", "Röhre"],
  ["Giant bubble wrap popping trail.", "Plop"],
  ["Vespa pulls giant carrot from ground rabbit chase.", "Möhre"],
  ["Giant feather boa strangles handlebars tickle.", "Feder"],
  ["Vespa on ski jump lands in foam pit.", "Ski"],
  ["Giant stampede of plush sheep.", "Schaf"],
  ["Vespa in cereal box prize toy giant.", "Überrasch"],
  ["Giant magnet attracts her dentures joke false teeth flying.", "Zähne"],
  ["Vespa through carwash giant sponge eyes.", "Schwamm"],
  ["Giant paper airplane stuck on back.", "Flieger"],
  ["Vespa in giant shoe stomping shadow.", "Schuh"],
  ["Giant yo-yo string wraps Vespa.", "JoJo"],
  ["Vespa with giant novelty glasses nose mustache.", "Brille"],
  ["Giant pinata spills candy avalanche.", "Süß"],
  ["Vespa on rollercoaster track tiny loop.", "Achter"],
  ["Giant hedgehog on seat ouch cartoon.", "Igel"],
  ["Vespa through fog machine rainbow laser.", "Nebel"],
  ["Giant stapler stack domino fall.", "Büro"],
  ["Vespa with giant party blower unfurling.", "Tröte"],
  ["Giant marshmallow peeps army hopping.", "Peeps"],
  ["Vespa in giant cereal maze.", "Labyrinth"],
  ["Giant scissors cutting ribbon across path snip.", "Schere"],
  ["Vespa pulls giant wagon of rubber ducks.", "Quietschen"],
  ["Giant snow globe engulfs Vespa shake.", "Kugel"],
  ["Vespa on rocket sled cartoon sparks.", "Rutsch"],
  ["Giant tape dispenser wraps her.", "Klebeband"],
  ["Vespa through glitter cannon sparkle beard.", "Glitzer"],
  ["Giant pillow fight feathers everywhere.", "Kissen"],
  ["Vespa in giant teacup splash.", "Tee"],
  ["Giant wind-up key on back spinning.", "Aufziehen"],
  ["Vespa with giant propeller beanie lift.", "Propeller"],
  ["Giant stapler race office chairs.", "Stuhl"],
  ["Vespa through spaghetti western tumbleweed.", "Western"],
  ["Giant bubble gum sidewalk stretch strands.", "Zäh"],
  ["Vespa in giant shopping cart.", "Einkauf"],
  ["Giant pencil sharpener shaves tire cartoon.", "Spitzer"],
  ["Vespa pulls giant slinky down stairs.", "Slinky"],
  ["Giant rubber chicken chorus line.", "Chor"],
  ["Vespa in piñata horse costume.", "Pferd"],
  ["Giant fog horn blast hair back.", "Nebelhorn"],
  ["Vespa through finish line tape confetti.", "Ziel"],
  ["Giant moon bounce castle Vespa on wall.", "Mond"],
  ["Vespa with giant snorkel in puddle.", "Schnorchel"],
  ["Giant stamp collection falls album slap.", "Sammlung"],
];

function rows() {
  const out = [];
  let i = 0;
  for (const [scene, bubble] of SUCCESS_DATA) {
    out.push({
      kind: "success",
      title: `batch3-S${61 + i}`,
      prompt: `${CORE}${scene} German speech bubble '${bubble}!'. Vibrant silly kid cartoon chaos, no blood no real violence, white background`,
    });
    i++;
  }
  return out;
}

const data = rows();
if (data.length !== 100) {
  console.error("Expected 100 prompts, got", data.length);
  process.exit(1);
}

const outPath = join(__dirname, "prompts-batch3-success.json");
writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Wrote", outPath, data.length, "entries");
