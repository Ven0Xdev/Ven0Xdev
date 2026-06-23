export type Category =
  | "Historical"
  | "Religious"
  | "Nature"
  | "Beach"
  | "Desert"
  | "City"
  | "Archaeology";

export interface Place {
  id: string;
  name: string;
  hebrewName: string;
  region: string;
  category: Category;
  description: string;
  details: string;
  highlights: string[];
  bestTime: string;
  entryFee: string;
  /** 4K hero image */
  image: string;
  /** Gallery thumbnails */
  gallery: string[];
  lat: number;
  lng: number;
}

const U = "https://images.unsplash.com";

// Helper: build Unsplash URL at a given width
const img = (id: string, w = 1600) =>
  `${U}/photo-${id}?auto=format&fit=crop&w=${w}&q=90`;

export const HERO_IMAGE = img("1548199589-1b8ef84e1898", 2560);

export const places: Place[] = [
  {
    id: "jerusalem-old-city",
    name: "Jerusalem Old City",
    hebrewName: "עיר עתיקה",
    region: "Jerusalem",
    category: "Historical",
    description:
      "One of the oldest cities in the world, sacred to Judaism, Christianity, and Islam.",
    details:
      "The Old City of Jerusalem is a 0.9 km² walled area containing some of the most iconic religious sites on Earth — the Western Wall, the Dome of the Rock, the Church of the Holy Sepulchre, and the Via Dolorosa. Divided into four quarters — Jewish, Muslim, Christian, and Armenian — every alley tells 3,000 years of history. The golden Dome of the Rock gleams above everything, a sight that stops every visitor in their tracks.",
    highlights: [
      "Western Wall (Kotel)",
      "Dome of the Rock",
      "Church of the Holy Sepulchre",
      "Via Dolorosa",
      "Jewish Quarter",
    ],
    bestTime: "March–May or September–November",
    entryFee: "Free (individual sites may charge)",
    image: img("1548199589-1b8ef84e1898", 2560),
    gallery: [
      img("1548199589-1b8ef84e1898", 1200),
      img("1572177191856-3cde618dee1f", 1200),
      img("1588516903720-8ceb67f9ef84", 1200),
    ],
    lat: 31.7767,
    lng: 35.2345,
  },
  {
    id: "tel-aviv-jaffa",
    name: "Tel Aviv & Old Jaffa",
    hebrewName: "תל אביב–יפו",
    region: "Tel Aviv District",
    category: "City",
    description:
      "Israel's vibrant coastal metropolis — Bauhaus boulevards, golden beaches, and the ancient port of Jaffa.",
    details:
      "Tel Aviv is the 'city that never stops' — a sun-soaked, ultra-modern city on the Mediterranean with a world-class food scene, cutting-edge art galleries, and UNESCO-listed Bauhaus architecture. The adjacent ancient port of Jaffa (Yafo), one of the oldest in the world, weaves narrow cobblestone alleys, art studios, and seafood restaurants right against the city skyline. The beachfront promenade stretches for kilometers, packed day and night.",
    highlights: [
      "Old Jaffa Port & Clock Tower",
      "Carmel Market",
      "White City Bauhaus (UNESCO)",
      "Rothschild Boulevard",
      "12 km of Mediterranean beach",
    ],
    bestTime: "Year-round — avoid August heat",
    entryFee: "Free",
    image: img("1579965342575-16428a7c8881", 2560),
    gallery: [
      img("1579965342575-16428a7c8881", 1200),
      img("1601232680543-fb7dd5f9a19d", 1200),
      img("1564501049412-61c2a3083791", 1200),
    ],
    lat: 32.0853,
    lng: 34.7818,
  },
  {
    id: "dead-sea",
    name: "Dead Sea",
    hebrewName: "ים המלח",
    region: "Southern District",
    category: "Nature",
    description:
      "The lowest point on Earth — float effortlessly in hypersaline waters surrounded by Judean Desert cliffs.",
    details:
      "At 430 meters below sea level, the Dead Sea is the lowest exposed point on Earth. Its water is 10× saltier than the ocean, making it impossible to sink — floating here is a surreal, life-affirming experience. The mineral-rich black mud on the shores is world-famous for skin-healing properties. At sunrise, the Jordanian mountains across the water turn vivid shades of pink and amber, making it one of the most breathtaking views in the Middle East.",
    highlights: [
      "Effortless floating in salt water",
      "Mineral mud bath ritual",
      "Sunrise over Jordan",
      "Ein Gedi oasis nearby",
      "Masada fortress views",
    ],
    bestTime: "October–April (summers exceed 45°C)",
    entryFee: "Resort fees 50–120 NIS",
    image: img("1544551763-8dd44758c2dd", 2560),
    gallery: [
      img("1544551763-8dd44758c2dd", 1200),
      img("1504701954957-2010ec3bcec1", 1200),
      img("1508739773434-c26b3d09e071", 1200),
    ],
    lat: 31.5588,
    lng: 35.4732,
  },
  {
    id: "masada",
    name: "Masada",
    hebrewName: "מצדה",
    region: "Southern District",
    category: "Archaeology",
    description:
      "An ancient fortress on a sheer desert plateau — symbol of Jewish heroism and Herod's ultimate palace.",
    details:
      "Built by Herod the Great between 37–31 BCE as a palace-fortress, Masada became the legendary last stand of 960 Jewish Zealots against Rome in 73 CE. Perched 450 meters above the Dead Sea on a sheer rock plateau, it is now a UNESCO World Heritage Site. Hiking the Snake Path at dawn, with the Dead Sea glowing below and the desert sky blazing pink, is one of the most powerful experiences in Israel. The ruins include Herod's palatial apartments, a Roman-style bathhouse, and a remarkable synagogue.",
    highlights: [
      "Snake Path dawn hike",
      "Herod's Northern Palace",
      "Roman siege ramp",
      "Cable car rides",
      "Dead Sea panorama",
    ],
    bestTime: "October–April — arrive before dawn",
    entryFee: "29 NIS (cable car extra)",
    image: img("1598802548963-df2dfe8ef95d", 2560),
    gallery: [
      img("1598802548963-df2dfe8ef95d", 1200),
      img("1566438480900-0609be27a4be", 1200),
      img("1528360983277-13d401cdc186", 1200),
    ],
    lat: 31.3155,
    lng: 35.3535,
  },
  {
    id: "haifa-bahai-gardens",
    name: "Baha'i Gardens, Haifa",
    hebrewName: "גני הבהאי",
    region: "Haifa District",
    category: "Religious",
    description:
      "Nineteen terraced gardens cascading down Mount Carmel — a UNESCO masterpiece of symmetry and serenity.",
    details:
      "The Baha'i World Centre terraced gardens descend 19 immaculate levels down Mount Carmel, with the gold-domed Shrine of the Báb at their center. Internationally recognized as a UNESCO World Heritage Site, the gardens are a testament to precision, patience, and devotion — each terrace is geometrically perfect. Free guided tours (Monday–Thursday) take visitors through the spiritual and architectural significance of this extraordinary place, with sweeping views over Haifa Bay and the Mediterranean.",
    highlights: [
      "19 perfect terraced gardens",
      "Golden-domed Shrine of the Báb",
      "Panoramic Haifa Bay views",
      "Free UNESCO guided tours",
      "Evening illumination",
    ],
    bestTime: "Year-round — early morning is best",
    entryFee: "Free",
    image: img("1580834341580-8c17a3a630ca", 2560),
    gallery: [
      img("1580834341580-8c17a3a630ca", 1200),
      img("1578923949740-db3dc2cf7b7b", 1200),
      img("1590756254933-2873d72a83b6", 1200),
    ],
    lat: 32.8152,
    lng: 34.9897,
  },
  {
    id: "caesarea",
    name: "Caesarea National Park",
    hebrewName: "קיסריה",
    region: "Haifa District",
    category: "Archaeology",
    description:
      "A magnificent Roman port city built by Herod the Great, with a theater still ringing with live concerts.",
    details:
      "Built between 22–10 BCE, Caesarea was Herod's great gift to the Roman world — a gleaming marble city with one of the ancient world's largest artificial harbors. Today the national park preserves a remarkably intact Roman theater (2,000-year-old stone seats now host international pop concerts), Crusader city walls, ancient hippodrome, Byzantine streets, and submerged harbor ruins. Seeing the sunset over the Mediterranean from the ancient amphitheater is unforgettable.",
    highlights: [
      "Roman amphitheater (live concerts)",
      "Herodian harbor ruins",
      "Crusader city walls",
      "Byzantine excavations",
      "Underwater archaeology",
    ],
    bestTime: "Year-round — concerts in summer",
    entryFee: "29 NIS adults",
    image: img("1532375810709-75b1da00537c", 2560),
    gallery: [
      img("1532375810709-75b1da00537c", 1200),
      img("1555993539-1732b0258235", 1200),
      img("1548199569-3e1c6aa8f469", 1200),
    ],
    lat: 32.5,
    lng: 34.9,
  },
  {
    id: "sea-of-galilee",
    name: "Sea of Galilee",
    hebrewName: "כינרת",
    region: "Northern District",
    category: "Nature",
    description:
      "Israel's inland sea — sacred waters where Jesus walked, surrounded by lush green hills and ancient ruins.",
    details:
      "The Kinneret is Israel's largest freshwater lake and a spiritual epicenter for Christianity. The surrounding landscape is lush and fertile, dotted with ancient synagogues, churches, and basalt ruins. Early morning on the water is magical — mist rising from the glass-calm surface while the Golan Heights reflect in the distance. Sites like the Mount of Beatitudes, Capernaum, and Tabgha (Multiplication of the Loaves) make this a compelling mix of natural beauty and deep history.",
    highlights: [
      "Mount of Beatitudes",
      "Capernaum ancient synagogue",
      "Kayaking at sunrise",
      "Tiberias waterfront promenade",
      "Tabgha Church",
    ],
    bestTime: "March–May and September–November",
    entryFee: "Free (individual sites vary)",
    image: img("1548365328-8c849e7a4f5b", 2560),
    gallery: [
      img("1548365328-8c849e7a4f5b", 1200),
      img("1570168007204-dfb528c6958f", 1200),
      img("1586348943529-beaae6c28db9", 1200),
    ],
    lat: 32.8208,
    lng: 35.5843,
  },
  {
    id: "negev-ramon",
    name: "Makhtesh Ramon",
    hebrewName: "מכתש רמון",
    region: "Southern District",
    category: "Desert",
    description:
      "The world's largest erosion crater — 200 million years of geology exposed in vivid layers of red and gold.",
    details:
      "Makhtesh Ramon is a geological phenomenon unique to the Negev: an erosion cirque 40 km long, 9 km wide, and 500 meters deep. The multi-colored cliff walls expose 200 million years of Earth's geological history in dramatic strata of red sandstone, white chalk, black basalt, and yellow limestone. The nearby town of Mitzpe Ramon sits on the crater's edge and is one of Israel's prime stargazing spots — its skies rank among the darkest in the country. Ibex herds roam freely alongside hikers.",
    highlights: [
      "Crater rim sunrise hike",
      "4WD desert tours",
      "World-class stargazing",
      "Geological visitor center",
      "Wild ibex herds",
    ],
    bestTime: "October–April (summer heat is extreme)",
    entryFee: "29 NIS national park",
    image: img("1509316785289-025f5b846b35", 2560),
    gallery: [
      img("1509316785289-025f5b846b35", 1200),
      img("1492551557933-34265f7af79e", 1200),
      img("1469854523086-cc02fe5d8800", 1200),
    ],
    lat: 30.5952,
    lng: 34.8007,
  },
  {
    id: "acre-akko",
    name: "Akko (Acre)",
    hebrewName: "עכו",
    region: "Northern District",
    category: "Historical",
    description:
      "A UNESCO Crusader city where underground halls, Ottoman domes, and ancient harbors collide.",
    details:
      "One of the oldest inhabited cities on Earth, Akko has been conquered by Phoenicians, Greeks, Romans, Arabs, Crusaders, Ottomans, and Napoleonic French. The UNESCO-listed old city hides an entire underground Crusader city beneath its Ottoman streets — vast vaulted halls, refectories, and the eerie Templar Tunnel. Above ground, the domed Khan al-Umdan caravanserai, the impressive Al-Jazzar Mosque, and a bustling fishing harbor all compete for attention. The food scene alone is worth the trip.",
    highlights: [
      "Underground Crusader city",
      "Al-Jazzar Mosque",
      "Templar Tunnel",
      "Ancient harbor & fish market",
      "Khan al-Umdan courtyard",
    ],
    bestTime: "Year-round",
    entryFee: "Combined ticket: 46 NIS",
    image: img("1566438480900-0609be27a4be", 2560),
    gallery: [
      img("1566438480900-0609be27a4be", 1200),
      img("1575408264798-b50b252663e6", 1200),
      img("1584551246679-0daf3d275d0f", 1200),
    ],
    lat: 32.9252,
    lng: 35.0718,
  },
  {
    id: "eilat",
    name: "Eilat & Red Sea",
    hebrewName: "אילת",
    region: "Southern District",
    category: "Beach",
    description:
      "Israel's Red Sea gem — pristine coral reefs, year-round sunshine, and surreal desert-meets-sea landscapes.",
    details:
      "At the very tip of Israel where four countries converge, Eilat floats above some of the world's most northerly coral reefs. The warm, gin-clear waters shelter hundreds of species of tropical fish, sea turtles, rays, and dolphins. The Underwater Observatory Marine Park lets visitors descend without getting wet. After snorkeling, the dramatic desert mountains ring the city and offer world-class hiking — particularly the Red Canyon and the Timna Valley copper mines 30 minutes north.",
    highlights: [
      "Coral Beach reef snorkeling",
      "Underwater Observatory Park",
      "Dolphin Reef swim-with",
      "Red Canyon hike",
      "Timna Valley day trip",
    ],
    bestTime: "Year-round — summer is intensely hot",
    entryFee: "Free beach; attractions 40–100 NIS",
    image: img("1563911302283-d2bc129e7570", 2560),
    gallery: [
      img("1563911302283-d2bc129e7570", 1200),
      img("1544551763-92ab630bf278", 1200),
      img("1520520731457-9283dd14aa66", 1200),
    ],
    lat: 29.5577,
    lng: 34.9519,
  },
  {
    id: "nazareth",
    name: "Nazareth",
    hebrewName: "נצרת",
    region: "Northern District",
    category: "Religious",
    description:
      "The boyhood home of Jesus — a city of pilgrimage wrapped around the magnificent Basilica of the Annunciation.",
    details:
      "Nazareth is the largest Arab city in Israel and one of Christianity's most sacred destinations. The Basilica of the Annunciation, built over the site where the angel Gabriel appeared to Mary, is one of the largest churches in the Middle East — its interior decorated with stunning mosaic panels gifted by nations from around the world. The Old City market is a labyrinth of spice vendors, silversmiths, and the aroma of freshly baked flatbread. The Nazareth Village reconstructed first-century farm brings the time of Jesus vividly to life.",
    highlights: [
      "Basilica of the Annunciation",
      "Nazareth Village",
      "Ancient Bathhouse",
      "Old Market souk",
      "Church of St. Gabriel",
    ],
    bestTime: "Year-round",
    entryFee: "Basilica free; Nazareth Village 45 NIS",
    image: img("1553913861-c0fddf2619ee", 2560),
    gallery: [
      img("1553913861-c0fddf2619ee", 1200),
      img("1592789705501-f9ae4278a9c9", 1200),
      img("1549989476-69a92fa57c36", 1200),
    ],
    lat: 32.6996,
    lng: 35.3035,
  },
  {
    id: "rosh-hanikra",
    name: "Rosh HaNikra",
    hebrewName: "ראש הנקרה",
    region: "Northern District",
    category: "Nature",
    description:
      "White chalk sea-cliffs carved into glowing grottos — reached by the world's steepest cable car.",
    details:
      "Where the Galilee mountains plunge into the Mediterranean, the sea has carved a spectacular system of caves and grottos through brilliant white chalk. The cliffs glow an eerie aquamarine as waves surge through the tunnels below. A dramatically steep cable car (65-degree descent) brings visitors to the cave entrance, where illuminated walkways thread through the chambers. On clear days, the cliffs of Lebanon are visible just kilometers away. Sunset here, with the Mediterranean turning to fire, is extraordinary.",
    highlights: [
      "Sea grottos & glowing caves",
      "World's steepest cable car",
      "Lebanese border overlook",
      "White cliff coastal walk",
      "Sunset over the Mediterranean",
    ],
    bestTime: "Year-round",
    entryFee: "50 NIS (cable car included)",
    image: img("1506905925346-21bda4d32df4", 2560),
    gallery: [
      img("1506905925346-21bda4d32df4", 1200),
      img("1505118380757-91f5f5632de0", 1200),
      img("1519681393784-d120267933ba", 1200),
    ],
    lat: 33.0875,
    lng: 35.1042,
  },
  {
    id: "safed-tzfat",
    name: "Safed (Tzfat)",
    hebrewName: "צפת",
    region: "Northern District",
    category: "Religious",
    description:
      "A mystical mountain city of Kabbalah, ancient synagogues, and blue-painted alleyways filled with art.",
    details:
      "Perched at 900 meters above the Galilee, Safed is one of Judaism's four holy cities and the birthplace of Kabbalah — Jewish mysticism. Its Old City is a maze of blue-and-white alleyways lined with ancient synagogues, art galleries, and studios. The Ari Ashkenazi Synagogue dates to the 16th century and is considered one of the most important sites in Jewish mystical tradition. In winter, the city is blanketed in snow and mist, giving it an otherworldly atmosphere unlike anywhere else in Israel.",
    highlights: [
      "Ari Ashkenazi Synagogue",
      "Abuhav Synagogue frescoes",
      "Artists' Quarter galleries",
      "Mountain views over Galilee",
      "Safed Candle Factory",
    ],
    bestTime: "Spring (wildflowers) or Winter (snow)",
    entryFee: "Free",
    image: img("1571019613454-1cb2f99b2d8b", 2560),
    gallery: [
      img("1571019613454-1cb2f99b2d8b", 1200),
      img("1480796927426-f609979314bd", 1200),
      img("1516483638261-f4dbaf036963", 1200),
    ],
    lat: 32.9646,
    lng: 35.4961,
  },
  {
    id: "en-gedi",
    name: "Ein Gedi Nature Reserve",
    hebrewName: "עין גדי",
    region: "Southern District",
    category: "Nature",
    description:
      "A lush desert oasis with cascading waterfalls, ibex herds, and ancient mosaics — steps from the Dead Sea.",
    details:
      "A true miracle of nature, Ein Gedi is a lush oasis of springs, waterfalls, and tropical vegetation erupting from the bleached Judean Desert. King David hid from Saul in these very gorges, as recounted in the Bible. The Nahal David and Nahal Arugot trails lead past cool natural pools and waterfalls surrounded by date palms, papyrus, and fragrant herbs. Wild Nubian ibex are so accustomed to hikers they walk beside you on the trails, making for extraordinary wildlife encounters.",
    highlights: [
      "David Waterfall & pools",
      "Wild ibex alongside trails",
      "Ancient synagogue mosaic",
      "Nahal Arugot canyon",
      "Dead Sea panoramas",
    ],
    bestTime: "October–April (summer is very hot)",
    entryFee: "29 NIS adults",
    image: img("1447752875215-b2761acb3c5d", 2560),
    gallery: [
      img("1447752875215-b2761acb3c5d", 1200),
      img("1518173946687-a4c8892bbd9f", 1200),
      img("1502082553048-f009c37129b9", 1200),
    ],
    lat: 31.462,
    lng: 35.391,
  },
  {
    id: "golan-heights",
    name: "Golan Heights",
    hebrewName: "רמת הגולן",
    region: "Northern District",
    category: "Nature",
    description:
      "Volcanic plateaus, snowcapped Hermon, award-winning wineries, and sweeping views to Syria and Lebanon.",
    details:
      "The Golan is Israel's most dramatic plateau — a volcanic tableland of basalt rock, wildflower meadows, cascading waterfalls, and ancient synagogues perched above the Sea of Galilee. Mount Hermon, Israel's only ski mountain, dominates the northeast in winter, its peak often wrapped in cloud. Dozens of boutique wineries produce some of Israel's finest reds from the iron-rich volcanic soil. Druze villages like Majdal Shams offer extraordinary hospitality and cuisine unlike anywhere else in Israel.",
    highlights: [
      "Mount Hermon ski resort",
      "Golan boutique wineries",
      "Banias waterfall & ruins",
      "Druze village cuisine",
      "Gamla ancient city & vultures",
    ],
    bestTime: "Spring for wildflowers; Winter for snow",
    entryFee: "Varies by attraction",
    image: img("1501854140801-50d01698950b", 2560),
    gallery: [
      img("1501854140801-50d01698950b", 1200),
      img("1559827260-dc66d52bef19", 1200),
      img("1455218873509-8097305ee378", 1200),
    ],
    lat: 33.12,
    lng: 35.77,
  },
  {
    id: "timna-park",
    name: "Timna Valley",
    hebrewName: "עמק תמנע",
    region: "Southern District",
    category: "Archaeology",
    description:
      "Ancient copper mines and towering red sandstone pillars in a surreal painted desert near Eilat.",
    details:
      "Timna Valley contains one of the world's oldest copper mines, worked since the Chalcolithic period 9,000 years ago. The landscape is sensational — towering formations of rust-red and orange sandstone sculpted by wind and time into mushroom shapes, arches, and the iconic King Solomon's Pillars: 50-meter walls of fluted sandstone that glow like embers at golden hour. The park includes a reconstructed biblical Tabernacle sanctuary and world-class stargazing night tours in one of Israel's darkest skies.",
    highlights: [
      "King Solomon's Pillars at sunset",
      "Ancient copper mine tunnels",
      "Mushroom Rock formation",
      "Reconstructed Tabernacle",
      "Desert night stargazing tours",
    ],
    bestTime: "October–April",
    entryFee: "40 NIS adults",
    image: img("1527489377706-5bf97e608852", 2560),
    gallery: [
      img("1527489377706-5bf97e608852", 1200),
      img("1469474968028-56623f02e42e", 1200),
      img("1508739773434-c26b3d09e071", 1200),
    ],
    lat: 29.7928,
    lng: 34.975,
  },
  {
    id: "beit-shean",
    name: "Beit She'an",
    hebrewName: "בית שאן",
    region: "Northern District",
    category: "Archaeology",
    description:
      "Israel's best-preserved Roman city — colonnaded streets, temples, and a theater for 8,000 spectators.",
    details:
      "Beit She'an National Park is the most complete Roman-Byzantine city in the Middle East. Atop a 7,000-year-old tel, the city was a major hub of the Decapolis — the league of ten Roman cities. The remarkably preserved colonnaded main street (Cardo), 2,000-seat theater, Roman bathhouse, temple ruins, and mosaic-floored Byzantine streets give a vivid picture of urban life 2,000 years ago. A scale model in the visitor center helps visitors understand the enormous scale of the original city.",
    highlights: [
      "Roman theater (8,000-seat)",
      "Colonnaded Cardo",
      "Byzantine bathhouse",
      "Seven-thousand-year tel",
      "Egyptian Ramesses II stele",
    ],
    bestTime: "Year-round — cooler October–April",
    entryFee: "28 NIS adults",
    image: img("1555993539-1732b0258235", 2560),
    gallery: [
      img("1555993539-1732b0258235", 1200),
      img("1532375810709-75b1da00537c", 1200),
      img("1548199589-1b8ef84e1898", 1200),
    ],
    lat: 32.4986,
    lng: 35.4996,
  },
  {
    id: "mount-carmel",
    name: "Mount Carmel & Haifa",
    hebrewName: "הר הכרמל",
    region: "Haifa District",
    category: "Nature",
    description:
      "Mediterranean forest, Druze villages, artists' colonies, and panoramic views over the bay.",
    details:
      "Mount Carmel rises to 546 meters above Haifa Bay, cloaked in Israel's most extensive Mediterranean forest of pine, oak, and carob. The Carmel National Park — Israel's largest — threads through ancient terraced agriculture, archaeological sites, and natural spring valleys. The Ein Hod artists' village, founded by a Dadaist sculptor in 1953, is home to galleries and studios. Druze villages like Daliyat al-Karmel are renowned for handcraft markets and the best hummus in northern Israel.",
    highlights: [
      "Carmel National Park trails",
      "Ein Hod artists' village",
      "Druze cuisine & crafts",
      "Elijah's Cave",
      "Haifa Bay panorama",
    ],
    bestTime: "Year-round — Spring for wildflowers",
    entryFee: "Free",
    image: img("1448375240586-882707db888b", 2560),
    gallery: [
      img("1448375240586-882707db888b", 1200),
      img("1500534314209-a25ddb2bd429", 1200),
      img("1441974231531-c6227db76b6e", 1200),
    ],
    lat: 32.7316,
    lng: 34.9872,
  },
];

export const categories: Category[] = [
  "Historical",
  "Religious",
  "Nature",
  "Beach",
  "Desert",
  "City",
  "Archaeology",
];

export const categoryColors: Record<Category, { bg: string; text: string; border: string }> = {
  Historical:  { bg: "rgba(180,120,40,0.18)",  text: "#e8c96b", border: "rgba(180,120,40,0.35)" },
  Religious:   { bg: "rgba(130,80,180,0.18)",  text: "#c4a0f0", border: "rgba(130,80,180,0.35)" },
  Nature:      { bg: "rgba(40,160,80,0.18)",   text: "#7de09a", border: "rgba(40,160,80,0.35)" },
  Beach:       { bg: "rgba(30,130,200,0.18)",  text: "#70c8f8", border: "rgba(30,130,200,0.35)" },
  Desert:      { bg: "rgba(200,100,30,0.18)",  text: "#f4a55a", border: "rgba(200,100,30,0.35)" },
  City:        { bg: "rgba(80,100,160,0.18)",  text: "#9fb0e8", border: "rgba(80,100,160,0.35)" },
  Archaeology: { bg: "rgba(180,60,60,0.18)",   text: "#f4857a", border: "rgba(180,60,60,0.35)" },
};

export const categoryIcon: Record<Category, string> = {
  Historical:  "landmark",
  Religious:   "moon-star",
  Nature:      "leaf",
  Beach:       "waves",
  Desert:      "sun",
  City:        "building-2",
  Archaeology: "pickaxe",
};
