// A new family key: four plain words and a number, easy to type with a remote.
// About 38 bits: plenty for a door that only opens one family's screen.
//   pnpm key
import { randomInt } from "node:crypto";

const WORDS = `acorn amber anchor apple apron arrow aspen attic autumn badger bagel bakery
balloon bamboo banjo barley barn basket beacon beagle beaver berry birch biscuit blanket
blossom bluebird bonfire bramble bread breeze brick bridge brook bubble bucket buckle
bumble bunny butter button cabin cactus candle canoe canyon caramel cardinal carrot castle
cedar cello chalk cherry chestnut chimney cider clover cobble cocoa comet compass cookie
copper coral cotton cottage cozy crayon creek cricket crocus crumpet cupcake daisy dandelion
dewdrop dolphin dove dragon drum dune eagle easel echo elm ember falcon fawn feather fern
fiddle fig finch firefly flannel flute forest fossil fox frost garden garnet gazelle gecko
ginger glacier glove goose granite grape gravel harbor harvest hazel heron hickory hill
honey hoop horizon iris ivy jam jasmine jelly juniper kayak kettle kite kitten koala ladder
lagoon lantern larch lark lemon lilac linen lion lobster locket lupine magpie mango maple
marble meadow melon meteor mint mitten moose moss muffin nectar nest nutmeg oak oatmeal
ocean olive orchard otter owl paddle pancake panda pansy parsley peach peanut pebble pecan
pepper pickle pigeon pine plum pocket pony poppy porch pretzel puffin pumpkin quail quill
quilt rabbit radish rain raven reed ribbon river robin rocket rose saddle sage salmon
sandal satchel sequoia shell sierra slipper snow sparrow spruce squash star stone strawberry
sugar summit sunrise swallow swan teacup thistle thunder tiger timber toast tulip tundra
turtle valley velvet violet wagon walnut walrus whale wheat whistle willow window winter
wren yarrow zebra zinnia`.split(/\s+/);

const pick = () => WORDS[randomInt(WORDS.length)];
console.log(`${pick()}-${pick()}-${pick()}-${pick()}-${randomInt(10, 100)}`);
