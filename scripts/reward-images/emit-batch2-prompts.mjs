#!/usr/bin/env node
/**
 * Writes prompts-batch2.json (50 success + 50 fail) for generate-reward-images.mjs
 * Run: node scripts/reward-images/emit-batch2-prompts.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const CORE =
  "Exact same cartoon German teacher from reference: black ponytail, huge googly eyes, teal cardigan over bright yellow turtleneck, green lanyard with white ID badge, dark blue pants, black shoes, stocky proportions. ";

/** @type {Array<[string, string]>} scene, bubble */
const SUCCESS_DATA = [
  ["Rides small blue Vespa no helmet. Giant cartoon ACME anvil falls from sky, squashes her flat like pancake, she pops back rubbery with boing, stars orbit head.", "Autsch"],
  ["On blue Vespa. Massive tiered wedding cake topples onto her face, frosting explosion everywhere, eyes crossed, silly grin through cream.", "Kuchen"],
  [
    "Minecraft Steve digging square hole in road ahead, her Vespa tips in comically, blocks and dirt poof, Steve waves, she looks shocked silly.",
    "Loch",
  ],
  [
    "Green Minecraft creeper sitting on Vespa behind her, flashing then cartoon confetti explosion instead of damage, both silly faces.",
    "Bumm",
  ],
  ["Lit red Minecraft TNT block strapped to scooter rack, huge puff of smoke and soot marks, hair frizzy, no injury.", "Feuer"],
  ["Giant spring under Vespa launches her spinning, googly eyes stretch out on springs cartoon physics.", "Boing"],
  ["Spinning tornado blur like Tasmanian devil on Vespa, dust spiral, dizzy spiral eyes after stop.", "Wirbel"],
  ["Huge horseshoe magnet pulls metal forks knives spoons flying at her, stuck to cardigan comically.", "Magnet"],
  ["Toy rocket taped to Vespa backfires, she hangs upside down from handlebars, tongue out.", "Hilfe"],
  ["Bucket of green Minecraft slime dumps from above, dripping goo hat, one eye peeking.", "Schleim"],
  ["Giant cartoon porcupine on seat, she jumps mid-ride legs in air, ouch stars.", "Stachel"],
  ["Grand piano silhouette on ground, piano smashes behind her Wile E Coyote style, she speeds away unscathed looking back.", "Ton"],
  ["Giant safe falls, crushes scooter flat, she walks out flattened paper-thin then inflates.", "Safe"],
  ["Vespa hits huge trampoline, triple flip in air, landing wobbly.", "Sprung"],
  ["Giant rubber mallet bonks head, stars and birds circle, helmet still absent.", "Sterne"],
  [
    "Minecraft Alex building cobble wall suddenly in front, soft block crash, blocks scatter like toys.",
    "Block",
  ],
  ["Slow silly Minecraft zombie chasing, she pedals Vespa barely faster, funny gaping faces.", "Zombie"],
  ["Minecraft pig riding pillion oinking, both wearing party hats, confetti.", "Schwein"],
  ["Minecraft water bucket splash from above, soaked hair flat, dripping smile.", "Nass"],
  ["Tall purple Minecraft Enderman stole front wheel, she chases holding donut bribe.", "Rad"],
  ["Giant round boulder rolls behind Indiana Jones style, gaining, she leans forward silly panic.", "Stein"],
  ["Cartoon bee swarm with silly faces chasing, she swats with map, puff clouds.", "Bienen"],
  ["Giant hot sauce bottle squirts face, red steam from ears, fanning mouth.", "Scharf"],
  ["Inflatable tube men wacky waving surround her at intersection, slapping gently.", "Luft"],
  ["Massive oil slick, Vespa does loop-de-loop slide, banana peel pile at end.", "Öl"],
  ["Jack-in-the-box on seat springs out boxing glove on spring, surprised o-face.", "Überraschung"],
  ["Giant donut rolls downhill chasing her, sprinkles trail, almost caught.", "Donut"],
  ["Office ceiling tile falls on head, dust puff, she blinks.", "Deckel"],
  ["Stack of paint cans wobbles from shelf, rainbow splatter explosion.", "Farbe"],
  ["Wardrobe bursts open, avalanche of clothes buries Vespa, sock on nose.", "Kleider"],
  ["Bowling ball rolls strike, pins explode like fireworks around her.", "Strike"],
  ["Giant soap bubble engulfs scooter floating up, pop leaves sparkles.", "Blubb"],
  ["Army of rubber chickens pecking tires, silly squeak lines.", "Huhn"],
  ["Fire hydrant blast lifts Vespa straight up like rocket, hair vertical.", "Fontäne"],
  ["Parachute opens wrong way covering face, still riding blind.", "Fallschirm"],
  ["Cartoon giant fish swallows Vespa then spits out, wet slick hair.", "Fisch"],
  ["UFO tractor beam light lifts scooter, she waves legs, silly not scary.", "Beam"],
  ["Cartoon octopus on Vespa squirts ink cloud, pirate hat askew.", "Tinte"],
  ["Santa sack rips toys avalanche, teddy bear on head.", "Geschenk"],
  ["Knight on hobby horse jousts with foam lance tickling her, Vespa spins.", "Lanze"],
  ["Tiny cute dragon sneezes puff of campfire smoke on her nose.", "Drache"],
  ["Wizard hat on Vespa, spell puff turns into rabbits multiplying everywhere.", "Zauber"],
  ["Disco robots dance lasers harmless pink beams, she dances awkward.", "Roboter"],
  ["Green aliens with antennas probe with feather tickle floating.", "Alien"],
  ["Giant marshmallow lands sticky on scooter, stretching strings.", "Marshmallow"],
  ["Popcorn machine explodes butter wave, kernels in hair.", "Popcorn"],
  ["Cartoon lawnmower chases on tiny legs, blades harmless silver blur.", "Rasen"],
  ["Vacuum cleaner hose sucks pant leg baggy balloon, funny walk.", "Staub"],
  ["Giant Christmas tree strapped to Vespa, ornaments tangle in ponytail, star on nose.", "Tannenbaum"],
  [
    "Giant cartoon accordion squishes her between bellows comically, musical notes flying, Vespa honks, cheeks puffed.",
    "Musik",
  ],
];

/** @type {Array<[string, string]>} */
const FAIL_DATA = [
  ["Stands bored leaning on blue Vespa handlebars, blank stare at viewer.", "Langweilig"],
  ["Sits on Vespa no helmet, slow roll eyes half closed almost asleep.", "Müde"],
  ["Stands hands deep in pockets beside Vespa, slightly annoyed flat mouth.", "Nein"],
  ["Leans on Vespa one eyebrow raised slightly cheeky but dull energy.", "Vielleicht"],
  ["Stands still mouth tiny oh bored, hands limp at sides.", "Ach so"],
  ["Sits sideways on Vespa arms crossed smug but tired eyes.", "Pfff"],
  ["One hand on hip other dangling, bored side-eye.", "Egal"],
  ["Rides Vespa very slowly blank neutral face, no wind in hair.", "Naja"],
  ["Stands in front of Vespa picking nose casually tiny bored expression.", "Popel"],
  ["Leans on Vespa tiny green stink line bored fart-face low energy.", "Stinkt"],
  ["Checks wristwatch impatient sigh, Vespa parked.", "Zeit"],
  ["Slumped sitting on curb feet flat, Vespa beside, exhausted pose.", "Pause"],
  ["Stares at phone screen deadpan, thumb scrolling nothing.", "Handy"],
  ["Picks invisible fuzz off yellow turtleneck, dead bored.", "Fussel"],
  ["Thousand-yard stare into empty white void.", "Leer"],
  ["Drags one foot while walking scooter beside, too lazy to ride.", "Langsam"],
  ["Small stack of papers tucked under arm, slightly overwhelmed meh.", "Papier"],
  ["Pinches bridge of nose eyes closed headache bored.", "Kopf"],
  ["Shrugs both palms up whatever gesture, flat face.", "Weiß nicht"],
  ["Yawning huge hand over mouth sitting on seat.", "Gähn"],
  ["Chews gum tiny bubble pop unimpressed.", "Kaugummi"],
  ["Holds pencil to lips staring at blank notepad.", "Stift"],
  ["Stands at imaginary bus stop forever, Vespa off.", "Warte"],
  ["Socks slightly mismatched visible, slouching.", "Socken"],
  ["Holds plain coffee cup bland sip eyes dead.", "Kaffee"],
  ["Leans on lamppost not Vespa, arms crossed.", "Laterne"],
  ["Sits on Vespa backwards facing wrong way tired.", "Falsch"],
  ["Eyes rolled up only whites slightly.", "Augen"],
  ["Stares at own shoelaces untied, too lazy to tie.", "Schnürsenkel"],
  ["Holds wilting daisy, sigh.", "Blume"],
  ["Cat on Vespa seat ignores her she ignores cat.", "Katze"],
  ["Looks at puddle reflection bored.", "Pfütze"],
  ["Eats dry toast no jam, chewing slow.", "Toast"],
  ["Watches paint brush stroke dry on easel, dead inside.", "Trocken"],
  ["Adjusts lanyard for tenth time, sigh.", "Band"],
  ["Tiny sneeze boring achoo straight face after.", "Hatschi"],
  ["Scratches elbow staring nowhere.", "Ellbogen"],
  ["Deep breath in slow exhale eyes half mast.", "Atem"],
  ["Motor off feet on ground sitting on Vespa staring ahead.", "Aus"],
  ["Holds umbrella closed on sunny white void pointless.", "Trocken"],
  ["Mirror compact open checking bags under eyes tired.", "Spiegel"],
  ["Peels sticker off water bottle slowly.", "Etikett"],
  ["Queue rope imaginary bored shuffle.", "Schlange"],
  ["Sandals with socks slight fashion crime bored.", "Mode"],
  ["Weak half wave greeting no smile.", "Hallo"],
  ["Holds heavy textbook open wrong page.", "Buch"],
  ["Puddle splash on shoe barely reacts.", "Nass"],
  ["Lint roller on cardigan obsessive bored.", "Rolle"],
  ["Sits on Vespa eating apple core emotionless.", "Apfel"],
  ["Looks at speedometer showing walking speed.", "Langsam"],
];

function rows() {
  const out = [];
  let i = 0;
  for (const [scene, bubble] of SUCCESS_DATA) {
    out.push({
      kind: "success",
      title: `batch2-S${11 + i}`,
      prompt: `${CORE}${scene} German speech bubble '${bubble}!'. Vibrant silly kid cartoon chaos, no blood no real violence, white background`,
    });
    i++;
  }
  i = 0;
  for (const [scene, bubble] of FAIL_DATA) {
    out.push({
      kind: "fail",
      title: `batch2-F${11 + i}`,
      prompt: `${CORE}${scene} German speech bubble '${bubble}...' Low energy boring lazy has-to-work-more mood, white background`,
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

const outPath = join(__dirname, "prompts-batch2.json");
writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("Wrote", outPath, data.length, "entries");
