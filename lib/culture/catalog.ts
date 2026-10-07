// The brand catalog: the culture brain's universe, in code. A brand is what younger consumers
// drink, eat, wear, use, play and watch; its owner is the listed company whose shares the picker
// may hold, or null for a private brand that is tracked for context and never traded. The model
// may only SUGGEST names that are not here (lib/culture/store recordSuggestions); a person adds
// one by editing this file. An id is an entity key and a series key and is never renamed.
//
// Chosen in 2026 and applied to earlier years by the backtest, so the simulated record carries
// survivorship bias — the /culture legend says so. lib/culture/__tests__/catalog.test.ts holds
// the entries to their rules (unique ids, aliases and titles; valid tickers; no generic alias
// without a cased form). Wikipedia titles are the pageviews API's exact article titles; a title
// that answers 404 shows up in the daily job's `missing` count, never as an error.

import {CULTURE_CATEGORIES, type BrandAlias, type BrandOwner, type CultureBrand, type Listing} from "@/lib/culture/types";

const cased = (term: string): BrandAlias => ({term, cased: true});

const pub = (company: string, ticker: string, listing: Listing = 'us', since?: string): BrandOwner =>
    ({company, ticker, listing, ...(since ? {since} : {})});

// Listed owners that several brands share.
const PEPSICO = pub('PepsiCo', 'PEP');
const COCA_COLA = pub('Coca-Cola', 'KO');
const KDP = pub('Keurig Dr Pepper', 'KDP');
const CELSIUS = pub('Celsius Holdings', 'CELH');
const MONSTER = pub('Monster Beverage', 'MNST');
const MONDELEZ = pub('Mondelez', 'MDLZ');
const HERSHEY = pub('Hershey', 'HSY');
const ANF = pub('Abercrombie & Fitch', 'ANF');
const AEO = pub('American Eagle Outfitters', 'AEO');
const GAP = pub('Gap Inc.', 'GAP');
const URBN = pub('Urban Outfitters', 'URBN');
const VFC = pub('VF Corporation', 'VFC');
const NIKE = pub('Nike', 'NKE');
const DECKERS = pub('Deckers Brands', 'DECK');
const AMER = pub('Amer Sports', 'AS');
const ELF = pub('e.l.f. Beauty', 'ELF');
const LOREAL = pub("L'Oréal", 'LRLCY', 'otc');
const LVMH = pub('LVMH', 'LVMUY', 'otc');
const ESTEE = pub('Estée Lauder', 'EL');
const APPLE = pub('Apple', 'AAPL');
const META = pub('Meta Platforms', 'META');
const ALPHABET = pub('Alphabet', 'GOOGL');
const MICROSOFT = pub('Microsoft', 'MSFT');
const SONY = pub('Sony', 'SONY', 'adr');
const NINTENDO = pub('Nintendo', 'NTDOY', 'otc');
const AMAZON = pub('Amazon', 'AMZN');
const DISNEY = pub('Disney', 'DIS');
const TAKE_TWO = pub('Take-Two Interactive', 'TTWO');
const TENCENT = pub('Tencent', 'TCEHY', 'otc');
const MATCH = pub('Match Group', 'MTCH');
const BLOCK = pub('Block', 'XYZ');
const MATTEL = pub('Mattel', 'MAT');
const HASBRO = pub('Hasbro', 'HAS');
const ETSY = pub('Etsy', 'ETSY');
const DICKS = pub("Dick's Sporting Goods", 'DKS');
const YUM = pub('Yum! Brands', 'YUM');

export const CULTURE_BRANDS: readonly CultureBrand[] = [
    // ---- drinks ----
    {id: 'celsius', name: 'Celsius', category: 'drinks', aliases: [cased('Celsius'), cased('CELSIUS'), 'Celsius energy'], owner: CELSIUS, wikipedia: ['Celsius_Holdings']},
    {id: 'alani-nu', name: 'Alani Nu', category: 'drinks', aliases: ['Alani Nu', 'Alani'], owner: pub('Celsius Holdings', 'CELH', 'us', '2025-04-01'), wikipedia: ['Alani_Nu']},
    {id: 'monster-energy', name: 'Monster Energy', category: 'drinks', aliases: ['Monster Energy', 'Monster Ultra'], owner: MONSTER, wikipedia: ['Monster_Energy']},
    {id: 'bang-energy', name: 'Bang Energy', category: 'drinks', aliases: ['Bang Energy'], owner: pub('Monster Beverage', 'MNST', 'us', '2023-07-31'), wikipedia: ['Bang_Energy']},
    {id: 'red-bull', name: 'Red Bull', category: 'drinks', aliases: ['Red Bull'], owner: null, parent: 'Red Bull GmbH', wikipedia: ['Red_Bull']},
    {id: 'prime-hydration', name: 'Prime', category: 'drinks', aliases: ['Prime Hydration', 'Prime Energy', 'Prime drink', cased('PRIME')], owner: null, parent: 'Congo Brands', wikipedia: ['Prime_(drink)']},
    {id: 'poppi', name: 'Poppi', category: 'drinks', aliases: ['Poppi'], owner: pub('PepsiCo', 'PEP', 'us', '2025-05-19'), wikipedia: ['Poppi_(drink)']},
    {id: 'olipop', name: 'Olipop', category: 'drinks', aliases: ['Olipop'], owner: null, wikipedia: ['Olipop']},
    {id: 'liquid-death', name: 'Liquid Death', category: 'drinks', aliases: ['Liquid Death'], owner: null, wikipedia: ['Liquid_Death']},
    {id: 'gatorade', name: 'Gatorade', category: 'drinks', aliases: ['Gatorade'], owner: PEPSICO, wikipedia: ['Gatorade']},
    {id: 'bodyarmor', name: 'BodyArmor', category: 'drinks', aliases: ['BodyArmor', 'Body Armor drink'], owner: pub('Coca-Cola', 'KO', 'us', '2021-11-01'), wikipedia: ['BodyArmor']},
    {id: 'dr-pepper', name: 'Dr Pepper', category: 'drinks', aliases: ['Dr Pepper', 'Dr. Pepper'], owner: KDP, wikipedia: ['Dr_Pepper']},
    {id: 'ghost-energy', name: 'Ghost Energy', category: 'drinks', aliases: ['Ghost Energy'], owner: pub('Keurig Dr Pepper', 'KDP', 'us', '2024-10-24'), wikipedia: ['Ghost_Energy']},
    {id: 'coca-cola', name: 'Coca-Cola', category: 'drinks', aliases: ['Coca-Cola', 'Coca Cola', cased('Coke')], owner: COCA_COLA, wikipedia: ['Coca-Cola']},
    {id: 'sprite', name: 'Sprite', category: 'drinks', aliases: [cased('Sprite')], owner: COCA_COLA, wikipedia: ['Sprite_(drink)']},
    {id: 'pepsi', name: 'Pepsi', category: 'drinks', aliases: ['Pepsi'], owner: PEPSICO, wikipedia: ['Pepsi']},
    {id: 'mountain-dew', name: 'Mountain Dew', category: 'drinks', aliases: ['Mountain Dew', 'Baja Blast'], owner: PEPSICO, wikipedia: ['Mountain_Dew']},
    {id: 'zevia', name: 'Zevia', category: 'drinks', aliases: ['Zevia'], owner: pub('Zevia', 'ZVIA'), wikipedia: ['Zevia']},
    {id: 'lacroix', name: 'LaCroix', category: 'drinks', aliases: ['LaCroix', 'La Croix'], owner: pub('National Beverage', 'FIZZ'), wikipedia: ['La_Croix_Sparkling_Water']},
    {id: 'bubly', name: 'Bubly', category: 'drinks', aliases: ['Bubly'], owner: PEPSICO, wikipedia: ['Bubly']},
    {id: 'topo-chico', name: 'Topo Chico', category: 'drinks', aliases: ['Topo Chico'], owner: COCA_COLA, wikipedia: ['Topo_Chico']},
    {id: 'electrolit', name: 'Electrolit', category: 'drinks', aliases: ['Electrolit'], owner: null, parent: 'Grupo Pisa', wikipedia: ['Electrolit']},
    {id: 'vita-coco', name: 'Vita Coco', category: 'drinks', aliases: ['Vita Coco'], owner: pub('Vita Coco', 'COCO'), wikipedia: ['Vita_Coco']},
    {id: 'bud-light', name: 'Bud Light', category: 'drinks', aliases: ['Bud Light'], owner: pub('AB InBev', 'BUD', 'adr'), wikipedia: ['Bud_Light']},
    {id: 'white-claw', name: 'White Claw', category: 'drinks', aliases: ['White Claw'], owner: null, parent: 'Mark Anthony Brands', wikipedia: ['White_Claw_Hard_Seltzer']},
    {id: 'truly', name: 'Truly', category: 'drinks', aliases: ['Truly Hard Seltzer', 'Truly seltzer'], owner: pub('Boston Beer', 'SAM'), wikipedia: ['Truly_Hard_Seltzer']},
    {id: 'bloom-nutrition', name: 'Bloom', category: 'drinks', aliases: ['Bloom Nutrition', 'Bloom greens'], owner: null, wikipedia: ['Bloom_Nutrition']},

    // ---- snacks ----
    {id: 'doritos', name: 'Doritos', category: 'snacks', aliases: ['Doritos'], owner: PEPSICO, wikipedia: ['Doritos']},
    {id: 'cheetos', name: 'Cheetos', category: 'snacks', aliases: ['Cheetos', 'Hot Cheetos', 'Flamin Hot'], owner: PEPSICO, wikipedia: ['Cheetos']},
    {id: 'lays', name: "Lay's", category: 'snacks', aliases: ["Lay's", 'Lays chips'], owner: PEPSICO, wikipedia: ["Lay's"]},
    {id: 'takis', name: 'Takis', category: 'snacks', aliases: ['Takis'], owner: null, parent: 'Grupo Bimbo', wikipedia: ['Takis_(snack)']},
    {id: 'oreo', name: 'Oreo', category: 'snacks', aliases: ['Oreo', 'Oreos'], owner: MONDELEZ, wikipedia: ['Oreo']},
    {id: 'sour-patch-kids', name: 'Sour Patch Kids', category: 'snacks', aliases: ['Sour Patch Kids', 'Sour Patch'], owner: MONDELEZ, wikipedia: ['Sour_Patch_Kids']},
    {id: 'goldfish', name: 'Goldfish', category: 'snacks', aliases: ['Goldfish crackers', cased('Goldfish')], owner: pub("Campbell's", 'CPB'), wikipedia: ['Goldfish_(cracker)']},
    {id: 'cheez-it', name: 'Cheez-It', category: 'snacks', aliases: ['Cheez-It', 'Cheez It', 'Cheez-Its'], owner: null, parent: 'Mars (Kellanova)', wikipedia: ['Cheez-It']},
    {id: 'pringles', name: 'Pringles', category: 'snacks', aliases: ['Pringles'], owner: null, parent: 'Mars (Kellanova)', wikipedia: ['Pringles']},
    {id: 'reeses', name: "Reese's", category: 'snacks', aliases: ["Reese's", 'Reeses'], owner: HERSHEY, wikipedia: ["Reese's_Peanut_Butter_Cups"]},
    {id: 'hersheys', name: "Hershey's", category: 'snacks', aliases: ["Hershey's", 'Hershey bar'], owner: HERSHEY, wikipedia: ['The_Hershey_Company']},
    {id: 'haribo', name: 'Haribo', category: 'snacks', aliases: ['Haribo'], owner: null, wikipedia: ['Haribo']},
    {id: 'feastables', name: 'Feastables', category: 'snacks', aliases: ['Feastables'], owner: null, parent: 'MrBeast', wikipedia: ['Feastables']},
    {id: 'skittles', name: 'Skittles', category: 'snacks', aliases: ['Skittles'], owner: null, parent: 'Mars', wikipedia: ['Skittles_(confectionery)']},
    {id: 'nerds', name: 'Nerds', category: 'snacks', aliases: ['Nerds Gummy Clusters', 'Nerds candy', cased('Nerds')], owner: null, parent: 'Ferrara (Ferrero)', wikipedia: ['Nerds_(candy)']},
    {id: 'chobani', name: 'Chobani', category: 'snacks', aliases: ['Chobani'], owner: null, wikipedia: ['Chobani']},
    {id: 'quest-nutrition', name: 'Quest', category: 'snacks', aliases: ['Quest bar', 'Quest bars', 'Quest Nutrition', 'Quest chips'], owner: pub('Simply Good Foods', 'SMPL'), wikipedia: ['Quest_Nutrition']},

    // ---- fast food ----
    {id: 'chick-fil-a', name: 'Chick-fil-A', category: 'fast-food', aliases: ['Chick-fil-A', 'Chick fil A', 'Chickfila'], owner: null, wikipedia: ['Chick-fil-A']},
    {id: 'mcdonalds', name: "McDonald's", category: 'fast-food', aliases: ["McDonald's", 'McDonalds', 'McDonald’s', 'McNuggets'], owner: pub("McDonald's", 'MCD'), wikipedia: ["McDonald's"], appNames: ["McDonald's"]},
    {id: 'chipotle', name: 'Chipotle', category: 'fast-food', aliases: ['Chipotle'], owner: pub('Chipotle Mexican Grill', 'CMG'), wikipedia: ['Chipotle_Mexican_Grill'], appNames: ['Chipotle']},
    {id: 'raising-canes', name: "Raising Cane's", category: 'fast-food', aliases: ["Raising Cane's", 'Raising Canes', "Cane's chicken"], owner: null, wikipedia: ["Raising_Cane's_Chicken_Fingers"]},
    {id: 'starbucks', name: 'Starbucks', category: 'fast-food', aliases: ['Starbucks', 'Starbies'], owner: pub('Starbucks', 'SBUX'), wikipedia: ['Starbucks'], appNames: ['Starbucks']},
    {id: 'dutch-bros', name: 'Dutch Bros', category: 'fast-food', aliases: ['Dutch Bros'], owner: pub('Dutch Bros', 'BROS'), wikipedia: ['Dutch_Bros']},
    {id: 'cava', name: 'Cava', category: 'fast-food', aliases: [cased('CAVA'), cased('Cava'), 'Cava Grill'], owner: pub('Cava Group', 'CAVA'), wikipedia: ['Cava_(restaurant)']},
    {id: 'sweetgreen', name: 'Sweetgreen', category: 'fast-food', aliases: ['Sweetgreen'], owner: pub('Sweetgreen', 'SG'), wikipedia: ['Sweetgreen']},
    {id: 'wingstop', name: 'Wingstop', category: 'fast-food', aliases: ['Wingstop'], owner: pub('Wingstop', 'WING'), wikipedia: ['Wingstop']},
    {id: 'taco-bell', name: 'Taco Bell', category: 'fast-food', aliases: ['Taco Bell'], owner: YUM, wikipedia: ['Taco_Bell']},
    {id: 'kfc', name: 'KFC', category: 'fast-food', aliases: [cased('KFC'), 'Kentucky Fried Chicken'], owner: YUM, wikipedia: ['KFC']},
    {id: 'popeyes', name: 'Popeyes', category: 'fast-food', aliases: ['Popeyes'], owner: pub('Restaurant Brands International', 'QSR'), wikipedia: ['Popeyes']},
    {id: 'shake-shack', name: 'Shake Shack', category: 'fast-food', aliases: ['Shake Shack'], owner: pub('Shake Shack', 'SHAK'), wikipedia: ['Shake_Shack']},
    {id: 'in-n-out', name: 'In-N-Out', category: 'fast-food', aliases: ['In-N-Out', 'In N Out'], owner: null, wikipedia: ['In-N-Out_Burger']},
    {id: 'crumbl', name: 'Crumbl', category: 'fast-food', aliases: ['Crumbl', 'Crumbl Cookies'], owner: null, wikipedia: ['Crumbl']},
    {id: 'dunkin', name: "Dunkin'", category: 'fast-food', aliases: ["Dunkin'", 'Dunkin', 'Dunkin Donuts'], owner: null, parent: 'Inspire Brands', wikipedia: ["Dunkin'"]},
    {id: 'wendys', name: "Wendy's", category: 'fast-food', aliases: ["Wendy's", 'Wendys'], owner: pub("Wendy's", 'WEN'), wikipedia: ["Wendy's"]},
    {id: 'dominos', name: "Domino's", category: 'fast-food', aliases: ["Domino's", 'Dominos'], owner: pub("Domino's Pizza", 'DPZ'), wikipedia: ["Domino's"]},
    {id: 'chilis', name: "Chili's", category: 'fast-food', aliases: ["Chili's", 'Chilis', 'Triple Dipper'], owner: pub('Brinker International', 'EAT'), wikipedia: ["Chili's"]},
    {id: 'five-guys', name: 'Five Guys', category: 'fast-food', aliases: ['Five Guys'], owner: null, wikipedia: ['Five_Guys']},
    {id: 'jersey-mikes', name: "Jersey Mike's", category: 'fast-food', aliases: ["Jersey Mike's", 'Jersey Mikes'], owner: null, parent: 'Blackstone', wikipedia: ["Jersey_Mike's_Subs"]},
    {id: 'panda-express', name: 'Panda Express', category: 'fast-food', aliases: ['Panda Express'], owner: null, wikipedia: ['Panda_Express']},
    {id: 'black-rifle-coffee', name: 'Black Rifle Coffee', category: 'fast-food', aliases: ['Black Rifle Coffee', 'Black Rifle'], owner: pub('BRC Inc.', 'BRCC'), wikipedia: ['Black_Rifle_Coffee_Company']},

    // ---- apparel ----
    {id: 'lululemon', name: 'Lululemon', category: 'apparel', aliases: ['Lululemon'], owner: pub('Lululemon Athletica', 'LULU'), wikipedia: ['Lululemon']},
    {id: 'nike', name: 'Nike', category: 'apparel', aliases: ['Nike', 'Nike Dunk', 'Dunks', 'Air Force 1', 'Air Max'], owner: NIKE, wikipedia: ['Nike,_Inc.'], appNames: ['Nike: Shoes, Apparel & Stories']},
    {id: 'hollister', name: 'Hollister', category: 'apparel', aliases: ['Hollister'], owner: ANF, wikipedia: ['Hollister_Co.']},
    {id: 'abercrombie', name: 'Abercrombie', category: 'apparel', aliases: ['Abercrombie', 'Abercrombie & Fitch'], owner: ANF, wikipedia: ['Abercrombie_&_Fitch']},
    {id: 'american-eagle', name: 'American Eagle', category: 'apparel', aliases: ['American Eagle', 'AE jeans'], owner: AEO, wikipedia: ['American_Eagle_Outfitters']},
    {id: 'aerie', name: 'Aerie', category: 'apparel', aliases: ['Aerie'], owner: AEO, wikipedia: ['Aerie_(clothing_retailer)']},
    {id: 'gap', name: 'Gap', category: 'apparel', aliases: [cased('Gap'), cased('GAP'), 'Gap Inc'], owner: GAP, wikipedia: ['Gap_Inc.']},
    {id: 'old-navy', name: 'Old Navy', category: 'apparel', aliases: ['Old Navy'], owner: GAP, wikipedia: ['Old_Navy']},
    {id: 'urban-outfitters', name: 'Urban Outfitters', category: 'apparel', aliases: ['Urban Outfitters'], owner: URBN, wikipedia: ['Urban_Outfitters']},
    {id: 'free-people', name: 'Free People', category: 'apparel', aliases: ['Free People'], owner: URBN, wikipedia: ['Free_People']},
    {id: 'anthropologie', name: 'Anthropologie', category: 'apparel', aliases: ['Anthropologie'], owner: URBN, wikipedia: ['Anthropologie']},
    {id: 'levis', name: "Levi's", category: 'apparel', aliases: ["Levi's", 'Levis'], owner: pub('Levi Strauss', 'LEVI'), wikipedia: ['Levi_Strauss_&_Co.']},
    {id: 'uniqlo', name: 'Uniqlo', category: 'apparel', aliases: ['Uniqlo'], owner: pub('Fast Retailing', 'FRCOY', 'otc'), wikipedia: ['Uniqlo']},
    {id: 'zara', name: 'Zara', category: 'apparel', aliases: ['Zara'], owner: pub('Inditex', 'IDEXY', 'otc'), wikipedia: ['Zara_(retailer)']},
    {id: 'hm', name: 'H&M', category: 'apparel', aliases: ['H&M'], owner: pub('H&M', 'HNNMY', 'otc'), wikipedia: ['H&M']},
    {id: 'shein', name: 'Shein', category: 'apparel', aliases: ['Shein'], owner: null, wikipedia: ['Shein'], appArtists: ['SHEIN']},
    {id: 'brandy-melville', name: 'Brandy Melville', category: 'apparel', aliases: ['Brandy Melville'], owner: null, wikipedia: ['Brandy_Melville']},
    {id: 'alo-yoga', name: 'Alo Yoga', category: 'apparel', aliases: ['Alo Yoga'], owner: null, wikipedia: ['Alo_Yoga']},
    {id: 'vuori', name: 'Vuori', category: 'apparel', aliases: ['Vuori'], owner: null, wikipedia: ['Vuori']},
    {id: 'gymshark', name: 'Gymshark', category: 'apparel', aliases: ['Gymshark'], owner: null, wikipedia: ['Gymshark']},
    {id: 'carhartt', name: 'Carhartt', category: 'apparel', aliases: ['Carhartt'], owner: null, wikipedia: ['Carhartt']},
    {id: 'the-north-face', name: 'The North Face', category: 'apparel', aliases: ['North Face'], owner: VFC, wikipedia: ['The_North_Face']},
    {id: 'patagonia', name: 'Patagonia', category: 'apparel', aliases: [cased('Patagonia'), 'Patagonia jacket', 'Patagonia fleece'], owner: null, wikipedia: ['Patagonia,_Inc.']},
    {id: 'aritzia', name: 'Aritzia', category: 'apparel', aliases: ['Aritzia'], owner: pub('Aritzia', 'ATZAF', 'otc'), wikipedia: ['Aritzia']},
    {id: 'coach', name: 'Coach', category: 'apparel', aliases: ['Coach bag', 'Coach New York', 'Coach Tabby', 'Coach Outlet'], owner: pub('Tapestry', 'TPR'), wikipedia: ['Coach_New_York']},
    {id: 'ralph-lauren', name: 'Ralph Lauren', category: 'apparel', aliases: ['Ralph Lauren', 'Polo Ralph Lauren'], owner: pub('Ralph Lauren', 'RL'), wikipedia: ['Ralph_Lauren_Corporation']},
    {id: 'skims', name: 'Skims', category: 'apparel', aliases: [cased('Skims'), cased('SKIMS')], owner: null, wikipedia: ['Skims']},
    {id: 'pacsun', name: 'PacSun', category: 'apparel', aliases: ['PacSun', 'Pacific Sunwear'], owner: null, wikipedia: ['PacSun']},

    // ---- footwear ----
    {id: 'jordan', name: 'Jordan', category: 'footwear', aliases: ['Air Jordan', 'Jordans', 'Jordan 1', 'Jordan 4', 'Jordan Brand'], owner: NIKE, wikipedia: ['Air_Jordan']},
    {id: 'adidas', name: 'Adidas', category: 'footwear', aliases: ['Adidas', 'Sambas', 'Adidas Samba', 'Adidas Gazelle'], owner: pub('Adidas', 'ADDYY', 'otc'), wikipedia: ['Adidas'], appNames: ['adidas']},
    {id: 'new-balance', name: 'New Balance', category: 'footwear', aliases: ['New Balance'], owner: null, wikipedia: ['New_Balance']},
    {id: 'hoka', name: 'Hoka', category: 'footwear', aliases: ['Hoka', 'Hokas'], owner: DECKERS, wikipedia: ['Hoka_One_One']},
    {id: 'ugg', name: 'UGG', category: 'footwear', aliases: [cased('UGG'), 'Uggs', 'Ugg boots'], owner: DECKERS, wikipedia: ['UGG_(brand)']},
    {id: 'on-running', name: 'On', category: 'footwear', aliases: ['On Running', 'On Cloud', 'On Clouds', 'Cloudmonster'], owner: pub('On Holding', 'ONON'), wikipedia: ['On_(company)']},
    {id: 'crocs', name: 'Crocs', category: 'footwear', aliases: ['Crocs'], owner: pub('Crocs', 'CROX'), wikipedia: ['Crocs']},
    {id: 'birkenstock', name: 'Birkenstock', category: 'footwear', aliases: ['Birkenstock', 'Birkenstocks', 'Birks'], owner: pub('Birkenstock', 'BIRK'), wikipedia: ['Birkenstock']},
    {id: 'converse', name: 'Converse', category: 'footwear', aliases: ['Converse', 'Chuck Taylors'], owner: NIKE, wikipedia: ['Converse_(shoe_company)']},
    {id: 'salomon', name: 'Salomon', category: 'footwear', aliases: ['Salomon'], owner: AMER, wikipedia: ['Salomon_Group']},
    {id: 'arcteryx', name: "Arc'teryx", category: 'apparel', aliases: ["Arc'teryx", 'Arcteryx'], owner: AMER, wikipedia: ["Arc'teryx"]},
    {id: 'asics', name: 'Asics', category: 'footwear', aliases: ['Asics'], owner: pub('Asics', 'ASCCY', 'otc'), wikipedia: ['Asics']},
    {id: 'skechers', name: 'Skechers', category: 'footwear', aliases: ['Skechers'], owner: null, parent: '3G Capital', wikipedia: ['Skechers']},
    {id: 'dr-martens', name: 'Dr. Martens', category: 'footwear', aliases: ['Dr. Martens', 'Dr Martens', 'Doc Martens'], owner: null, parent: 'Dr. Martens plc (London-listed)', wikipedia: ['Dr._Martens']},
    {id: 'puma', name: 'Puma', category: 'footwear', aliases: [cased('Puma'), cased('PUMA')], owner: pub('Puma', 'PUMSY', 'otc'), wikipedia: ['Puma_(brand)']},
    {id: 'timberland', name: 'Timberland', category: 'footwear', aliases: ['Timberland', 'Timbs'], owner: VFC, wikipedia: ['Timberland_(company)']},
    {id: 'vans', name: 'Vans', category: 'footwear', aliases: [cased('Vans')], owner: VFC, wikipedia: ['Vans']},
    {id: 'allbirds', name: 'Allbirds', category: 'footwear', aliases: ['Allbirds'], owner: pub('Allbirds', 'BIRD'), wikipedia: ['Allbirds']},

    // ---- beauty ----
    {id: 'elf', name: 'e.l.f.', category: 'beauty', aliases: ['e.l.f.', 'elf cosmetics', 'elf beauty', 'e.l.f. Cosmetics'], owner: ELF, wikipedia: ['E.l.f._Cosmetics']},
    {id: 'rhode', name: 'Rhode', category: 'beauty', aliases: ['Rhode skin', 'Rhode beauty', 'Rhode lip', 'Rhode peptide'], owner: pub('e.l.f. Beauty', 'ELF', 'us', '2025-08-01'), wikipedia: ['Rhode_(brand)']},
    {id: 'ulta', name: 'Ulta', category: 'beauty', aliases: ['Ulta'], owner: pub('Ulta Beauty', 'ULTA'), wikipedia: ['Ulta_Beauty']},
    {id: 'sephora', name: 'Sephora', category: 'beauty', aliases: ['Sephora'], owner: LVMH, wikipedia: ['Sephora']},
    {id: 'rare-beauty', name: 'Rare Beauty', category: 'beauty', aliases: ['Rare Beauty'], owner: null, wikipedia: ['Rare_Beauty']},
    {id: 'glossier', name: 'Glossier', category: 'beauty', aliases: ['Glossier'], owner: null, wikipedia: ['Glossier']},
    {id: 'fenty-beauty', name: 'Fenty Beauty', category: 'beauty', aliases: ['Fenty Beauty', 'Fenty'], owner: LVMH, wikipedia: ['Fenty_Beauty']},
    {id: 'cerave', name: 'CeraVe', category: 'beauty', aliases: ['CeraVe'], owner: LOREAL, wikipedia: ['CeraVe']},
    {id: 'la-roche-posay', name: 'La Roche-Posay', category: 'beauty', aliases: ['La Roche-Posay', 'La Roche Posay'], owner: LOREAL, wikipedia: ['La_Roche-Posay']},
    {id: 'maybelline', name: 'Maybelline', category: 'beauty', aliases: ['Maybelline'], owner: LOREAL, wikipedia: ['Maybelline']},
    {id: 'nyx', name: 'NYX', category: 'beauty', aliases: ['NYX Cosmetics', cased('NYX')], owner: LOREAL, wikipedia: ['NYX_Cosmetics']},
    {id: 'sol-de-janeiro', name: 'Sol de Janeiro', category: 'beauty', aliases: ['Sol de Janeiro'], owner: null, parent: "L'Occitane", wikipedia: ['Sol_de_Janeiro']},
    {id: 'drunk-elephant', name: 'Drunk Elephant', category: 'beauty', aliases: ['Drunk Elephant'], owner: pub('Shiseido', 'SSDOY', 'otc'), wikipedia: ['Drunk_Elephant']},
    {id: 'the-ordinary', name: 'The Ordinary', category: 'beauty', aliases: [cased('The Ordinary'), 'Deciem'], owner: ESTEE, wikipedia: ['The_Ordinary']},
    {id: 'clinique', name: 'Clinique', category: 'beauty', aliases: ['Clinique'], owner: ESTEE, wikipedia: ['Clinique']},
    {id: 'summer-fridays', name: 'Summer Fridays', category: 'beauty', aliases: ['Summer Fridays'], owner: null, wikipedia: ['Summer_Fridays']},
    {id: 'laneige', name: 'Laneige', category: 'beauty', aliases: ['Laneige'], owner: null, parent: 'Amorepacific', wikipedia: ['Laneige']},
    {id: 'bath-and-body-works', name: 'Bath & Body Works', category: 'beauty', aliases: ['Bath & Body Works', 'Bath and Body Works'], owner: pub('Bath & Body Works', 'BBWI'), wikipedia: ['Bath_&_Body_Works']},
    {id: 'olaplex', name: 'Olaplex', category: 'beauty', aliases: ['Olaplex'], owner: pub('Olaplex', 'OLPX'), wikipedia: ['Olaplex']},
    {id: 'charlotte-tilbury', name: 'Charlotte Tilbury', category: 'beauty', aliases: ['Charlotte Tilbury'], owner: null, parent: 'Puig', wikipedia: ['Charlotte_Tilbury_Beauty']},
    {id: 'bubble-skincare', name: 'Bubble', category: 'beauty', aliases: ['Bubble Skincare'], owner: null, wikipedia: ['Bubble_Skincare']},

    // ---- devices ----
    {id: 'iphone', name: 'iPhone', category: 'devices', aliases: ['iPhone', 'iPhone 17', 'iPhone 16'], owner: APPLE, wikipedia: ['IPhone']},
    {id: 'airpods', name: 'AirPods', category: 'devices', aliases: ['AirPods'], owner: APPLE, wikipedia: ['AirPods']},
    {id: 'apple-watch', name: 'Apple Watch', category: 'devices', aliases: ['Apple Watch'], owner: APPLE, wikipedia: ['Apple_Watch']},
    {id: 'nintendo-switch', name: 'Nintendo Switch', category: 'devices', aliases: ['Nintendo Switch', 'Switch 2'], owner: NINTENDO, wikipedia: ['Nintendo_Switch', 'Nintendo_Switch_2']},
    {id: 'playstation', name: 'PlayStation', category: 'devices', aliases: ['PlayStation', 'PS5'], owner: SONY, wikipedia: ['PlayStation_5']},
    {id: 'xbox', name: 'Xbox', category: 'devices', aliases: ['Xbox', 'Game Pass'], owner: MICROSOFT, wikipedia: ['Xbox']},
    {id: 'meta-quest', name: 'Meta Quest', category: 'devices', aliases: ['Meta Quest', 'Quest 3', 'Oculus'], owner: META, wikipedia: ['Meta_Quest']},
    {id: 'ray-ban-meta', name: 'Ray-Ban Meta', category: 'devices', aliases: ['Ray-Ban Meta', 'Meta glasses', 'Meta Ray-Ban'], owner: META, wikipedia: ['Ray-Ban_Meta']},
    {id: 'garmin', name: 'Garmin', category: 'devices', aliases: ['Garmin'], owner: pub('Garmin', 'GRMN'), wikipedia: ['Garmin']},
    {id: 'samsung-galaxy', name: 'Samsung Galaxy', category: 'devices', aliases: ['Samsung Galaxy', 'Galaxy S25', 'Galaxy S26'], owner: null, parent: 'Samsung Electronics', wikipedia: ['Samsung_Galaxy']},
    {id: 'stanley', name: 'Stanley', category: 'devices', aliases: ['Stanley tumbler', 'Stanley Quencher', 'Stanley cups'], owner: null, parent: 'PMI Worldwide', wikipedia: ['Stanley_1913']},
    {id: 'owala', name: 'Owala', category: 'devices', aliases: ['Owala'], owner: null, parent: 'Trove Brands', wikipedia: ['Owala']},
    {id: 'yeti', name: 'Yeti', category: 'devices', aliases: [cased('YETI'), 'Yeti cooler', 'Yeti tumbler', 'Yeti Rambler'], owner: pub('Yeti Holdings', 'YETI'), wikipedia: ['Yeti_Holdings']},
    {id: 'hydro-flask', name: 'Hydro Flask', category: 'devices', aliases: ['Hydro Flask', 'Hydroflask'], owner: pub('Helen of Troy', 'HELE'), wikipedia: ['Hydro_Flask']},
    {id: 'gopro', name: 'GoPro', category: 'devices', aliases: ['GoPro'], owner: pub('GoPro', 'GPRO'), wikipedia: ['GoPro']},
    {id: 'sonos', name: 'Sonos', category: 'devices', aliases: ['Sonos'], owner: pub('Sonos', 'SONO'), wikipedia: ['Sonos']},
    {id: 'beats', name: 'Beats', category: 'devices', aliases: ['Beats headphones', 'Beats by Dre', 'Beats Studio', 'Beats Pill'], owner: APPLE, wikipedia: ['Beats_Electronics']},
    {id: 'instax', name: 'Instax', category: 'devices', aliases: ['Instax', 'Fujifilm Instax'], owner: pub('Fujifilm', 'FUJIY', 'otc'), wikipedia: ['Instax']},
    {id: 'kindle', name: 'Kindle', category: 'devices', aliases: ['Kindle'], owner: AMAZON, wikipedia: ['Amazon_Kindle']},
    {id: 'tesla', name: 'Tesla', category: 'devices', aliases: ['Tesla', 'Cybertruck', 'Model Y'], owner: pub('Tesla', 'TSLA'), wikipedia: ['Tesla,_Inc.']},

    // ---- apps ----
    {id: 'tiktok', name: 'TikTok', category: 'apps', aliases: ['TikTok', 'TikTok Shop'], owner: null, parent: 'ByteDance', wikipedia: ['TikTok'], appArtists: ['TikTok Ltd.', 'TikTok Pte. Ltd.']},
    {id: 'instagram', name: 'Instagram', category: 'apps', aliases: ['Instagram', 'Insta', 'Reels'], owner: META, wikipedia: ['Instagram'], appArtists: ['Instagram, Inc.'], appNames: ['Instagram']},
    {id: 'threads', name: 'Threads', category: 'apps', aliases: [cased('Threads'), 'Threads app'], owner: META, wikipedia: ['Threads_(social_network)'], appNames: ['Threads']},
    {id: 'facebook', name: 'Facebook', category: 'apps', aliases: ['Facebook', 'Facebook Marketplace'], owner: META, wikipedia: ['Facebook'], appNames: ['Facebook']},
    {id: 'whatsapp', name: 'WhatsApp', category: 'apps', aliases: ['WhatsApp'], owner: META, wikipedia: ['WhatsApp'], appArtists: ['WhatsApp Inc.']},
    {id: 'snapchat', name: 'Snapchat', category: 'apps', aliases: ['Snapchat', 'Snap Map', 'Snapchat+'], owner: pub('Snap', 'SNAP'), wikipedia: ['Snapchat'], appArtists: ['Snap, Inc.'], appNames: ['Snapchat']},
    {id: 'youtube', name: 'YouTube', category: 'apps', aliases: ['YouTube', 'YouTube Shorts'], owner: ALPHABET, wikipedia: ['YouTube'], appNames: ['YouTube', 'YouTube Music']},
    {id: 'pinterest', name: 'Pinterest', category: 'apps', aliases: ['Pinterest'], owner: pub('Pinterest', 'PINS'), wikipedia: ['Pinterest'], appArtists: ['Pinterest']},
    {id: 'reddit', name: 'Reddit', category: 'apps', aliases: ['Reddit'], owner: pub('Reddit', 'RDDT'), wikipedia: ['Reddit'], appArtists: ['reddit']},
    {id: 'spotify', name: 'Spotify', category: 'apps', aliases: ['Spotify', 'Spotify Wrapped'], owner: pub('Spotify', 'SPOT'), wikipedia: ['Spotify'], appArtists: ['Spotify']},
    {id: 'duolingo', name: 'Duolingo', category: 'apps', aliases: ['Duolingo', 'Duo owl'], owner: pub('Duolingo', 'DUOL'), wikipedia: ['Duolingo'], appArtists: ['Duolingo']},
    {id: 'discord', name: 'Discord', category: 'apps', aliases: [cased('Discord')], owner: null, wikipedia: ['Discord'], appArtists: ['Discord, Inc.']},
    {id: 'chatgpt', name: 'ChatGPT', category: 'apps', aliases: ['ChatGPT', 'OpenAI'], owner: null, parent: 'OpenAI', wikipedia: ['ChatGPT'], appArtists: ['OpenAI OpCo, LLC', 'OpenAI']},
    {id: 'gemini', name: 'Gemini', category: 'apps', aliases: ['Google Gemini', 'Gemini app'], owner: ALPHABET, wikipedia: ['Gemini_(chatbot)'], appNames: ['Google Gemini']},
    {id: 'claude', name: 'Claude', category: 'apps', aliases: ['Claude AI', 'Claude by Anthropic', 'Anthropic'], owner: null, parent: 'Anthropic', wikipedia: ['Claude_(language_model)'], appArtists: ['Anthropic PBC']},
    {id: 'capcut', name: 'CapCut', category: 'apps', aliases: ['CapCut'], owner: null, parent: 'ByteDance', wikipedia: ['CapCut'], appArtists: ['Bytedance Pte. Ltd']},
    {id: 'bereal', name: 'BeReal', category: 'apps', aliases: ['BeReal'], owner: null, parent: 'Voodoo', wikipedia: ['BeReal']},
    {id: 'uber', name: 'Uber', category: 'apps', aliases: [cased('Uber'), 'Uber Eats'], owner: pub('Uber', 'UBER'), wikipedia: ['Uber'], appArtists: ['Uber Technologies, Inc.']},
    {id: 'doordash', name: 'DoorDash', category: 'apps', aliases: ['DoorDash', 'Door Dash'], owner: pub('DoorDash', 'DASH'), wikipedia: ['DoorDash'], appArtists: ['DoorDash, Inc.']},
    {id: 'airbnb', name: 'Airbnb', category: 'apps', aliases: ['Airbnb'], owner: pub('Airbnb', 'ABNB'), wikipedia: ['Airbnb'], appArtists: ['Airbnb, Inc.']},
    {id: 'tinder', name: 'Tinder', category: 'apps', aliases: [cased('Tinder')], owner: MATCH, wikipedia: ['Tinder_(app)'], appArtists: ['Tinder Inc.']},
    {id: 'hinge', name: 'Hinge', category: 'apps', aliases: ['Hinge app', 'Hinge dating', cased('Hinge')], owner: MATCH, wikipedia: ['Hinge_(app)'], appArtists: ['Hinge, Inc.']},
    {id: 'bumble', name: 'Bumble', category: 'apps', aliases: [cased('Bumble')], owner: pub('Bumble', 'BMBL'), wikipedia: ['Bumble_(app)'], appArtists: ['Bumble Inc.']},
    {id: 'canva', name: 'Canva', category: 'apps', aliases: ['Canva'], owner: null, wikipedia: ['Canva'], appArtists: ['Canva']},
    {id: 'twitter', name: 'X', category: 'apps', aliases: ['Twitter', 'X app', 'Grok'], owner: null, parent: 'xAI', wikipedia: ['Twitter'], appArtists: ['X Corp.']},

    // ---- gaming ----
    {id: 'roblox', name: 'Roblox', category: 'gaming', aliases: ['Roblox', 'Robux'], owner: pub('Roblox', 'RBLX'), wikipedia: ['Roblox'], appArtists: ['Roblox Corporation']},
    {id: 'fortnite', name: 'Fortnite', category: 'gaming', aliases: ['Fortnite', 'Epic Games'], owner: null, parent: 'Epic Games', wikipedia: ['Fortnite']},
    {id: 'minecraft', name: 'Minecraft', category: 'gaming', aliases: ['Minecraft'], owner: MICROSOFT, wikipedia: ['Minecraft'], appArtists: ['Mojang']},
    {id: 'call-of-duty', name: 'Call of Duty', category: 'gaming', aliases: ['Call of Duty', 'Warzone', 'Black Ops'], owner: MICROSOFT, wikipedia: ['Call_of_Duty'], appArtists: ['Activision Publishing, Inc.']},
    {id: 'gta', name: 'Grand Theft Auto', category: 'gaming', aliases: ['GTA 6', 'GTA VI', 'Grand Theft Auto', 'GTA Online'], owner: TAKE_TWO, wikipedia: ['Grand_Theft_Auto_VI']},
    {id: 'nba-2k', name: 'NBA 2K', category: 'gaming', aliases: ['NBA 2K'], owner: TAKE_TWO, wikipedia: ['NBA_2K']},
    {id: 'ea-sports-fc', name: 'EA Sports FC', category: 'gaming', aliases: ['EA Sports FC', 'EA FC', 'Madden'], owner: null, parent: 'Electronic Arts (private since 2026)', wikipedia: ['EA_Sports_FC']},
    {id: 'valorant', name: 'Valorant', category: 'gaming', aliases: ['Valorant'], owner: TENCENT, wikipedia: ['Valorant']},
    {id: 'league-of-legends', name: 'League of Legends', category: 'gaming', aliases: ['League of Legends', 'Riot Games'], owner: TENCENT, wikipedia: ['League_of_Legends']},
    {id: 'genshin-impact', name: 'Genshin Impact', category: 'gaming', aliases: ['Genshin Impact', 'Genshin'], owner: null, parent: 'miHoYo', wikipedia: ['Genshin_Impact']},
    {id: 'pokemon', name: 'Pokémon', category: 'gaming', aliases: ['Pokemon', 'Pokémon', 'Pokemon cards', 'Pokemon TCG'], owner: null, parent: 'The Pokémon Company', wikipedia: ['Pokémon']},
    {id: 'steam', name: 'Steam', category: 'gaming', aliases: ['Steam Deck', 'Valve'], owner: null, parent: 'Valve', wikipedia: ['Steam_(service)']},
    {id: 'marvel-rivals', name: 'Marvel Rivals', category: 'gaming', aliases: ['Marvel Rivals'], owner: pub('NetEase', 'NTES', 'adr'), wikipedia: ['Marvel_Rivals']},
    {id: 'candy-crush', name: 'Candy Crush', category: 'gaming', aliases: ['Candy Crush'], owner: MICROSOFT, wikipedia: ['Candy_Crush_Saga'], appArtists: ['King']},
    {id: 'monopoly-go', name: 'Monopoly Go', category: 'gaming', aliases: ['Monopoly Go'], owner: null, parent: 'Scopely (Savvy Games)', wikipedia: ['Monopoly_Go!'], appArtists: ['Scopely, Inc.']},

    // ---- streaming and going out ----
    {id: 'netflix', name: 'Netflix', category: 'streaming', aliases: ['Netflix'], owner: pub('Netflix', 'NFLX'), wikipedia: ['Netflix'], appArtists: ['Netflix, Inc.']},
    {id: 'disney-plus', name: 'Disney+', category: 'streaming', aliases: ['Disney+', 'Disney Plus'], owner: DISNEY, wikipedia: ['Disney+'], appNames: ['Disney+']},
    {id: 'hulu', name: 'Hulu', category: 'streaming', aliases: ['Hulu'], owner: DISNEY, wikipedia: ['Hulu'], appArtists: ['Hulu, LLC']},
    {id: 'hbo-max', name: 'HBO Max', category: 'streaming', aliases: ['HBO Max', cased('HBO')], owner: pub('Warner Bros. Discovery', 'WBD'), wikipedia: ['HBO_Max'], appNames: ['HBO Max: Stream TV & Movies']},
    {id: 'peacock', name: 'Peacock', category: 'streaming', aliases: [cased('Peacock')], owner: pub('Comcast', 'CMCSA'), wikipedia: ['Peacock_(streaming_service)'], appNames: ['Peacock TV: Stream TV & Movies']},
    {id: 'paramount-plus', name: 'Paramount+', category: 'streaming', aliases: ['Paramount+', 'Paramount Plus'], owner: pub('Paramount Skydance', 'PSKY'), wikipedia: ['Paramount+']},
    {id: 'crunchyroll', name: 'Crunchyroll', category: 'streaming', aliases: ['Crunchyroll'], owner: SONY, wikipedia: ['Crunchyroll']},
    {id: 'twitch', name: 'Twitch', category: 'streaming', aliases: [cased('Twitch')], owner: AMAZON, wikipedia: ['Twitch_(service)'], appArtists: ['Twitch Interactive, Inc.']},
    {id: 'prime-video', name: 'Prime Video', category: 'streaming', aliases: ['Prime Video'], owner: AMAZON, wikipedia: ['Amazon_Prime_Video'], appNames: ['Amazon Prime Video']},
    {id: 'apple-tv', name: 'Apple TV', category: 'streaming', aliases: ['Apple TV+', 'Apple TV'], owner: APPLE, wikipedia: ['Apple_TV+']},
    {id: 'live-nation', name: 'Live Nation', category: 'streaming', aliases: ['Live Nation', 'Ticketmaster'], owner: pub('Live Nation Entertainment', 'LYV'), wikipedia: ['Live_Nation_Entertainment']},
    {id: 'amc-theatres', name: 'AMC Theatres', category: 'streaming', aliases: ['AMC Theatres', 'AMC theaters', 'AMC Stubs'], owner: pub('AMC Entertainment', 'AMC'), wikipedia: ['AMC_Theatres']},
    {id: 'dave-and-busters', name: "Dave & Buster's", category: 'streaming', aliases: ["Dave & Buster's", 'Dave and Busters'], owner: pub("Dave & Buster's", 'PLAY'), wikipedia: ["Dave_&_Buster's"]},
    {id: 'topgolf', name: 'Topgolf', category: 'streaming', aliases: ['Topgolf'], owner: pub('Topgolf Callaway Brands', 'MODG'), wikipedia: ['Topgolf']},

    // ---- fitness and health ----
    {id: 'strava', name: 'Strava', category: 'fitness', aliases: ['Strava'], owner: null, wikipedia: ['Strava'], appArtists: ['Strava, Inc.']},
    {id: 'whoop', name: 'Whoop', category: 'fitness', aliases: [cased('WHOOP'), 'Whoop band', 'Whoop strap'], owner: null, wikipedia: ['Whoop_(company)']},
    {id: 'oura', name: 'Oura', category: 'fitness', aliases: ['Oura', 'Oura ring'], owner: null, wikipedia: ['Oura_Health']},
    {id: 'peloton', name: 'Peloton', category: 'fitness', aliases: ['Peloton'], owner: pub('Peloton Interactive', 'PTON'), wikipedia: ['Peloton_Interactive']},
    {id: 'planet-fitness', name: 'Planet Fitness', category: 'fitness', aliases: ['Planet Fitness'], owner: pub('Planet Fitness', 'PLNT'), wikipedia: ['Planet_Fitness']},
    {id: 'equinox', name: 'Equinox', category: 'fitness', aliases: ['Equinox gym', cased('Equinox')], owner: null, wikipedia: ['Equinox_Group']},
    {id: 'hyrox', name: 'Hyrox', category: 'fitness', aliases: ['Hyrox'], owner: null, wikipedia: ['Hyrox']},
    {id: 'life-time', name: 'Life Time', category: 'fitness', aliases: ['Life Time Fitness', 'Lifetime Fitness'], owner: pub('Life Time Group', 'LTH'), wikipedia: ['Life_Time_Inc.']},
    {id: 'hims', name: 'Hims & Hers', category: 'fitness', aliases: ['Hims & Hers', 'Hims and Hers', cased('Hims')], owner: pub('Hims & Hers Health', 'HIMS'), wikipedia: ['Hims_&_Hers_Health']},

    // ---- money ----
    {id: 'cash-app', name: 'Cash App', category: 'money', aliases: ['Cash App', 'CashApp'], owner: BLOCK, wikipedia: ['Cash_App'], appArtists: ['Block, Inc.']},
    {id: 'venmo', name: 'Venmo', category: 'money', aliases: ['Venmo'], owner: pub('PayPal', 'PYPL'), wikipedia: ['Venmo'], appNames: ['Venmo']},
    {id: 'robinhood', name: 'Robinhood', category: 'money', aliases: ['Robinhood'], owner: pub('Robinhood Markets', 'HOOD'), wikipedia: ['Robinhood_Markets'], appArtists: ['Robinhood Markets, Inc.']},
    {id: 'coinbase', name: 'Coinbase', category: 'money', aliases: ['Coinbase'], owner: pub('Coinbase', 'COIN'), wikipedia: ['Coinbase'], appArtists: ['Coinbase, Inc.']},
    {id: 'chime', name: 'Chime', category: 'money', aliases: [cased('Chime'), 'Chime bank'], owner: pub('Chime Financial', 'CHYM'), wikipedia: ['Chime_(company)'], appArtists: ['Chime Financial, Inc.']},
    {id: 'sofi', name: 'SoFi', category: 'money', aliases: ['SoFi'], owner: pub('SoFi Technologies', 'SOFI'), wikipedia: ['SoFi'], appArtists: ['Social Finance, Inc.']},
    {id: 'klarna', name: 'Klarna', category: 'money', aliases: ['Klarna'], owner: pub('Klarna', 'KLAR'), wikipedia: ['Klarna'], appArtists: ['Klarna Bank AB']},
    {id: 'afterpay', name: 'Afterpay', category: 'money', aliases: ['Afterpay'], owner: BLOCK, wikipedia: ['Afterpay']},
    {id: 'affirm', name: 'Affirm', category: 'money', aliases: [cased('Affirm')], owner: pub('Affirm', 'AFRM'), wikipedia: ['Affirm_Holdings'], appArtists: ['Affirm, Inc.']},
    {id: 'apple-pay', name: 'Apple Pay', category: 'money', aliases: ['Apple Pay', 'Apple Card'], owner: APPLE, wikipedia: ['Apple_Pay']},
    {id: 'zelle', name: 'Zelle', category: 'money', aliases: ['Zelle'], owner: null, parent: 'Early Warning Services', wikipedia: ['Zelle']},
    {id: 'draftkings', name: 'DraftKings', category: 'money', aliases: ['DraftKings'], owner: pub('DraftKings', 'DKNG'), wikipedia: ['DraftKings'], appArtists: ['DraftKings']},
    {id: 'fanduel', name: 'FanDuel', category: 'money', aliases: ['FanDuel'], owner: pub('Flutter Entertainment', 'FLUT'), wikipedia: ['FanDuel'], appArtists: ['FanDuel']},
    {id: 'kalshi', name: 'Kalshi', category: 'money', aliases: ['Kalshi'], owner: null, wikipedia: ['Kalshi'], appArtists: ['KalshiEX LLC']},
    {id: 'polymarket', name: 'Polymarket', category: 'money', aliases: ['Polymarket'], owner: null, wikipedia: ['Polymarket']},
    {id: 'webull', name: 'Webull', category: 'money', aliases: ['Webull'], owner: pub('Webull', 'BULL'), wikipedia: ['Webull']},

    // ---- retail ----
    {id: 'target', name: 'Target', category: 'retail', aliases: [cased('Target')], owner: pub('Target', 'TGT'), wikipedia: ['Target_Corporation'], appNames: ['Target']},
    {id: 'walmart', name: 'Walmart', category: 'retail', aliases: ['Walmart'], owner: pub('Walmart', 'WMT'), wikipedia: ['Walmart'], appArtists: ['Walmart']},
    {id: 'costco', name: 'Costco', category: 'retail', aliases: ['Costco', 'Kirkland'], owner: pub('Costco', 'COST'), wikipedia: ['Costco']},
    {id: 'amazon', name: 'Amazon', category: 'retail', aliases: ['Amazon', 'Amazon Prime'], owner: AMAZON, wikipedia: ['Amazon_(company)'], appNames: ['Amazon Shopping']},
    {id: 'temu', name: 'Temu', category: 'retail', aliases: ['Temu'], owner: pub('PDD Holdings', 'PDD', 'adr'), wikipedia: ['Temu'], appArtists: ['Temu']},
    {id: 'five-below', name: 'Five Below', category: 'retail', aliases: ['Five Below'], owner: pub('Five Below', 'FIVE'), wikipedia: ['Five_Below']},
    {id: 'dollar-tree', name: 'Dollar Tree', category: 'retail', aliases: ['Dollar Tree'], owner: pub('Dollar Tree', 'DLTR'), wikipedia: ['Dollar_Tree']},
    {id: 'tj-maxx', name: 'TJ Maxx', category: 'retail', aliases: ['TJ Maxx', 'T.J. Maxx', 'Marshalls', 'HomeGoods'], owner: pub('TJX Companies', 'TJX'), wikipedia: ['TJ_Maxx']},
    {id: 'gamestop', name: 'GameStop', category: 'retail', aliases: ['GameStop'], owner: pub('GameStop', 'GME'), wikipedia: ['GameStop']},
    {id: 'best-buy', name: 'Best Buy', category: 'retail', aliases: ['Best Buy'], owner: pub('Best Buy', 'BBY'), wikipedia: ['Best_Buy']},
    {id: 'etsy', name: 'Etsy', category: 'retail', aliases: ['Etsy'], owner: ETSY, wikipedia: ['Etsy'], appArtists: ['Etsy, Inc.']},
    {id: 'depop', name: 'Depop', category: 'retail', aliases: ['Depop'], owner: ETSY, wikipedia: ['Depop'], appArtists: ['Depop Ltd']},
    {id: 'vinted', name: 'Vinted', category: 'retail', aliases: ['Vinted'], owner: null, wikipedia: ['Vinted'], appArtists: ['Vinted Limited']},
    {id: 'thredup', name: 'ThredUp', category: 'retail', aliases: ['ThredUp', 'Thred Up'], owner: pub('ThredUp', 'TDUP'), wikipedia: ['ThredUp']},
    {id: 'zumiez', name: 'Zumiez', category: 'retail', aliases: ['Zumiez'], owner: pub('Zumiez', 'ZUMZ'), wikipedia: ['Zumiez']},
    {id: 'shopify', name: 'Shop', category: 'retail', aliases: ['Shopify', 'Shop app', 'Shop Pay'], owner: pub('Shopify', 'SHOP'), wikipedia: ['Shopify'], appArtists: ['Shopify Inc.']},
    {id: 'trader-joes', name: "Trader Joe's", category: 'retail', aliases: ["Trader Joe's", 'Trader Joes'], owner: null, wikipedia: ["Trader_Joe's"]},
    {id: 'aldi', name: 'Aldi', category: 'retail', aliases: ['Aldi'], owner: null, wikipedia: ['Aldi']},
    {id: 'ikea', name: 'IKEA', category: 'retail', aliases: ['IKEA'], owner: null, wikipedia: ['IKEA']},
    {id: '7-eleven', name: '7-Eleven', category: 'retail', aliases: ['7-Eleven', '7 Eleven', 'Slurpee'], owner: pub('Seven & i Holdings', 'SVNDY', 'otc'), wikipedia: ['7-Eleven']},
    {id: 'bucees', name: "Buc-ee's", category: 'retail', aliases: ["Buc-ee's", 'Bucees'], owner: null, wikipedia: ["Buc-ee's"]},
    {id: 'dicks-sporting-goods', name: "Dick's Sporting Goods", category: 'retail', aliases: ["Dick's Sporting Goods", 'Dicks Sporting Goods'], owner: DICKS, wikipedia: ["Dick's_Sporting_Goods"]},
    {id: 'foot-locker', name: 'Foot Locker', category: 'retail', aliases: ['Foot Locker', 'Footlocker'], owner: pub("Dick's Sporting Goods", 'DKS', 'us', '2025-09-08'), wikipedia: ['Foot_Locker']},

    // ---- toys and collectibles ----
    {id: 'lego', name: 'LEGO', category: 'toys', aliases: [cased('LEGO'), cased('Lego'), 'Lego set', 'Lego sets'], owner: null, parent: 'The Lego Group', wikipedia: ['Lego']},
    {id: 'labubu', name: 'Labubu', category: 'toys', aliases: ['Labubu', 'Labubus', 'Pop Mart'], owner: pub('Pop Mart', 'PMMAF', 'otc'), wikipedia: ['Labubu']},
    {id: 'squishmallows', name: 'Squishmallows', category: 'toys', aliases: ['Squishmallows', 'Squishmallow'], owner: pub('Berkshire Hathaway (Jazwares)', 'BRK.B'), wikipedia: ['Squishmallows']},
    {id: 'funko', name: 'Funko', category: 'toys', aliases: ['Funko', 'Funko Pop'], owner: pub('Funko', 'FNKO'), wikipedia: ['Funko']},
    {id: 'jellycat', name: 'Jellycat', category: 'toys', aliases: ['Jellycat'], owner: null, wikipedia: ['Jellycat']},
    {id: 'sonny-angel', name: 'Sonny Angel', category: 'toys', aliases: ['Sonny Angel', 'Sonny Angels'], owner: null, parent: 'Dreams Inc.', wikipedia: ['Sonny_Angel']},
    {id: 'hot-wheels', name: 'Hot Wheels', category: 'toys', aliases: ['Hot Wheels'], owner: MATTEL, wikipedia: ['Hot_Wheels']},
    {id: 'barbie', name: 'Barbie', category: 'toys', aliases: [cased('Barbie')], owner: MATTEL, wikipedia: ['Barbie']},
    {id: 'nerf', name: 'Nerf', category: 'toys', aliases: [cased('Nerf'), cased('NERF')], owner: HASBRO, wikipedia: ['Nerf']},
    {id: 'magic-the-gathering', name: 'Magic: The Gathering', category: 'toys', aliases: ['Magic: The Gathering', 'Magic the Gathering'], owner: HASBRO, wikipedia: ['Magic:_The_Gathering']},
    {id: 'build-a-bear', name: 'Build-A-Bear', category: 'toys', aliases: ['Build-A-Bear', 'Build a Bear'], owner: pub('Build-A-Bear Workshop', 'BBW'), wikipedia: ['Build-A-Bear_Workshop']},
];

export const CATEGORY_LABELS: Record<(typeof CULTURE_CATEGORIES)[number], string> = {
    'drinks': 'Drinks',
    'snacks': 'Snacks',
    'fast-food': 'Fast food',
    'apparel': 'Apparel',
    'footwear': 'Footwear',
    'beauty': 'Beauty',
    'devices': 'Devices',
    'apps': 'Apps',
    'gaming': 'Gaming',
    'streaming': 'Streaming and going out',
    'fitness': 'Fitness and health',
    'money': 'Money',
    'retail': 'Retail',
    'toys': 'Toys and collectibles',
};

const BY_ID = new Map(CULTURE_BRANDS.map((brand) => [brand.id, brand]));

export const brandById = (id: string): CultureBrand | undefined => BY_ID.get(id);

// The term an alias matches on, whatever its form.
export const aliasTerm = (alias: BrandAlias): string => (typeof alias === 'string' ? alias : alias.term);

// Every listed owner's brands, by ticker: 'PEP' → Gatorade, Poppi, Pepsi, Doritos…
export const brandsByTicker = (catalog: readonly CultureBrand[] = CULTURE_BRANDS): Map<string, CultureBrand[]> => {
    const map = new Map<string, CultureBrand[]>();
    for (const brand of catalog) {
        if (!brand.owner) continue;
        map.set(brand.owner.ticker, [...(map.get(brand.owner.ticker) ?? []), brand]);
    }
    return map;
};

export type CatalogTicker = {ticker: string; listing: Listing; company: string; brands: string[]};

// The picker's raw universe: each distinct listed owner with its brands' ids, A→Z.
export const catalogTickers = (catalog: readonly CultureBrand[] = CULTURE_BRANDS): CatalogTicker[] =>
    [...brandsByTicker(catalog)]
        .map(([ticker, brands]) => ({
            ticker,
            listing: brands[0].owner!.listing,
            company: brands[0].owner!.company,
            brands: brands.map((b) => b.id),
        }))
        .sort((a, b) => a.ticker.localeCompare(b.ticker));
