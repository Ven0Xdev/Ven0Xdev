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
  image: string;
  gallery: string[];
  lat: number;
  lng: number;
}

const UNSPLASH = "https://images.unsplash.com";

export const places: Place[] = [
  {
    id: "jerusalem-old-city",
    name: "Jerusalem Old City",
    hebrewName: "עיר עתיקה",
    region: "Jerusalem",
    category: "Historical",
    description:
      "One of the oldest cities in the world, home to sites sacred to Judaism, Christianity, and Islam.",
    details:
      "The Old City of Jerusalem is a 0.9 km² walled area within the modern city. It contains many iconic religious sites including the Western Wall — the holiest place where Jews can pray — the Church of the Holy Sepulchre, and the Dome of the Rock. The city is divided into four quarters: the Jewish Quarter, the Muslim Quarter, the Christian Quarter, and the Armenian Quarter. Walking its ancient cobblestone lanes feels like stepping back 3,000 years in history.",
    highlights: [
      "Western Wall (Kotel)",
      "Dome of the Rock",
      "Church of the Holy Sepulchre",
      "Via Dolorosa",
      "Jewish Quarter",
    ],
    bestTime: "Spring (March–May) or Autumn (September–November)",
    entryFee: "Free (individual sites may charge)",
    image: `${UNSPLASH}/photo-1548199589-1b8ef84e1898?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1548199589-1b8ef84e1898?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1572177191856-3cde618dee1f?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1588516903720-8ceb67f9ef84?auto=format&fit=crop&w=800&q=80`,
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
      "Israel's vibrant coastal metropolis, blending modern culture with the ancient port city of Jaffa.",
    details:
      "Tel Aviv is known as the 'non-stop city' — a modern, liberal, beachside metropolis with world-class restaurants, nightlife, and Bauhaus architecture. Adjacent Old Jaffa (Yafo) is one of the oldest port cities in the world, with narrow alleyways, art galleries, flea markets, and panoramic views of the Mediterranean. The Tel Aviv beach promenade stretches for kilometers along the sea.",
    highlights: [
      "Old Jaffa Port",
      "Carmel Market",
      "White City (UNESCO)",
      "Rothschild Boulevard",
      "Tel Aviv beaches",
    ],
    bestTime: "Year-round; avoid August heat",
    entryFee: "Free",
    image: `${UNSPLASH}/photo-1579965342575-16428a7c8881?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1579965342575-16428a7c8881?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1601232680543-fb7dd5f9a19d?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=800&q=80`,
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
      "The lowest point on Earth — float effortlessly in hypersaline waters with therapeutic mineral mud.",
    details:
      "At 430 meters below sea level, the Dead Sea is the lowest point on Earth and one of the world's saltiest bodies of water. Its salt concentration is roughly 34%, making it impossible to sink and giving the water a surreal, silky feel. The shores are covered in mineral-rich black mud, famous for skin-healing properties. The dramatic landscape of Judean Desert cliffs rising from the shoreline creates an otherworldly atmosphere.",
    highlights: [
      "Floating in salt water",
      "Mineral mud baths",
      "Ein Gedi oasis nearby",
      "Masada fortress views",
      "Sunrise over Jordan",
    ],
    bestTime: "October–April (summer is extremely hot)",
    entryFee: "Beach resort fees vary (50–120 NIS)",
    image: `${UNSPLASH}/photo-1544551763-8dd44758c2dd?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1544551763-8dd44758c2dd?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1504701954957-2010ec3bcec1?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80`,
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
      "An ancient fortress atop a dramatic desert plateau, symbol of Jewish heroism and the last stand of the Zealots.",
    details:
      "Masada was originally built by Herod the Great as a palace-fortress between 37–31 BCE. It became infamous as the site where 960 Jewish Zealots chose death over Roman slavery in 73 CE. Today it is a UNESCO World Heritage Site perched 450 meters above the Dead Sea on a sheer rock plateau. Visitors can hike the Snake Path at dawn to catch a spectacular sunrise, or take the cable car. The ruins include Herod's palace, a bathhouse, synagogue, and water cisterns.",
    highlights: [
      "Snake Path sunrise hike",
      "Herod's Northern Palace",
      "Cable car rides",
      "Roman siege ramp",
      "Dead Sea views",
    ],
    bestTime: "October–April; arrive before sunrise",
    entryFee: "29 NIS (cable car extra)",
    image: `${UNSPLASH}/photo-1598802548963-df2dfe8ef95d?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1598802548963-df2dfe8ef95d?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1566438480900-0609be27a4be?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80`,
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
      "Nineteen terraced gardens cascading down Mount Carmel — a UNESCO World Heritage Site of breathtaking symmetry.",
    details:
      "The Baha'i World Centre in Haifa is the spiritual and administrative heart of the Baha'i Faith. The terraced gardens descend 19 terraces down the northern slope of Mount Carmel, with the golden-domed Shrine of the Báb at their center. The gardens are meticulously maintained and offer panoramic views of Haifa Bay and the Mediterranean. Guided tours are available and provide insight into the Baha'i Faith.",
    highlights: [
      "19 terraced gardens",
      "Shrine of the Báb",
      "Panoramic bay views",
      "Guided free tours",
      "Night illuminations",
    ],
    bestTime: "Year-round; gardens open daily",
    entryFee: "Free (guided tours Mon–Thu)",
    image: `${UNSPLASH}/photo-1580834341580-8c17a3a630ca?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1580834341580-8c17a3a630ca?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1578923949740-db3dc2cf7b7b?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1590756254933-2873d72a83b6?auto=format&fit=crop&w=800&q=80`,
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
      "A magnificent Roman port city built by Herod the Great, featuring a stunning amphitheater on the Mediterranean shore.",
    details:
      "Caesarea was built by Herod the Great between 22–10 BCE as a grand Roman port city dedicated to Augustus Caesar. The ancient harbor, Sebastos, was one of the largest in the ancient world. Today, the national park contains a remarkably well-preserved Roman theater (still used for concerts), a Crusader city, ancient hippodrome, Byzantine streets, and harbor ruins. The juxtaposition of ancient ruins against the blue Mediterranean is unforgettable.",
    highlights: [
      "Roman amphitheater (live concerts)",
      "Ancient Herodian harbor",
      "Crusader city walls",
      "Byzantine streets",
      "Underwater archaeology",
    ],
    bestTime: "Year-round; concerts in summer",
    entryFee: "29 NIS adults",
    image: `${UNSPLASH}/photo-1532375810709-75b1da00537c?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1532375810709-75b1da00537c?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1555993539-1732b0258235?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1548199569-3e1c6aa8f469?auto=format&fit=crop&w=800&q=80`,
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
      "Israel's largest freshwater lake, sacred in Christianity as the setting of Jesus's ministry and miracles.",
    details:
      "The Kinneret, known as the Sea of Galilee, is Israel's main freshwater reservoir and one of the lowest freshwater lakes in the world at 209 meters below sea level. The area is deeply sacred for Christians, with sites including the Mount of Beatitudes, Capernaum, and Tabgha (Multiplication of the Loaves). The surrounding landscape features basalt cliffs, banana plantations, and hot springs. Kayaking, cycling, and boat tours are popular.",
    highlights: [
      "Mount of Beatitudes",
      "Capernaum ruins",
      "Kayaking & sailing",
      "Tiberias waterfront",
      "Tabgha Church",
    ],
    bestTime: "March–May and September–November",
    entryFee: "Free (individual sites vary)",
    image: `${UNSPLASH}/photo-1548365328-8c849e7a4f5b?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1548365328-8c849e7a4f5b?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1570168007204-dfb528c6958f?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1586348943529-beaae6c28db9?auto=format&fit=crop&w=800&q=80`,
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
      "The world's largest natural erosion crater — a geological wonder in the heart of the Negev Desert.",
    details:
      "Makhtesh Ramon is not a meteor crater but an erosion cirque — a geological formation unique to the Negev. It measures 40 km long, 9 km wide, and 500 meters deep. The crater exposes 200 million years of geological history through colorful rock layers of red, orange, yellow, and white. The nearby Mitzpe Ramon town serves as the base for hiking, jeep tours, stargazing (one of Israel's darkest skies), and desert camping. Ibexes and foxes roam freely.",
    highlights: [
      "Crater rim sunrise hike",
      "Jeep desert tours",
      "Stargazing nights",
      "Geological museum",
      "Wild ibex sightings",
    ],
    bestTime: "October–April (summers reach 40°C+)",
    entryFee: "29 NIS (national park)",
    image: `${UNSPLASH}/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1492551557933-34265f7af79e?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80`,
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
      "A UNESCO-listed Crusader city with underground halls, Ottoman bazaars, and one of Israel's best ports.",
    details:
      "Akko is one of the oldest continuously inhabited sites in the world, with a history spanning over 5,000 years. The UNESCO-listed old city includes the spectacular Knights' Halls — underground Crusader city beneath the current streets — the Ottoman Citadel, Al-Jazzar Mosque, a vibrant market, Templar tunnels, and a picturesque fishing harbor. The city's unique blend of Jewish, Muslim, Christian, and Druze communities makes it one of Israel's most diverse cultural destinations.",
    highlights: [
      "Crusader Underground City",
      "Al-Jazzar Mosque",
      "Templar Tunnel",
      "Old harbor seafood restaurants",
      "Khan al-Umdan",
    ],
    bestTime: "Year-round",
    entryFee: "Combined ticket: 46 NIS",
    image: `${UNSPLASH}/photo-1566438480900-0609be27a4be?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1566438480900-0609be27a4be?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1575408264798-b50b252663e6?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1584551246679-0daf3d275d0f?auto=format&fit=crop&w=800&q=80`,
    ],
    lat: 32.9252,
    lng: 35.0718,
  },
  {
    id: "eilat",
    name: "Eilat",
    hebrewName: "אילת",
    region: "Southern District",
    category: "Beach",
    description:
      "Israel's Red Sea resort city — world-class coral reefs, year-round sun, and border-crossing adventures.",
    details:
      "Eilat sits at the northern tip of the Red Sea between Jordan, Egypt, and Saudi Arabia. The warm, clear waters host some of the world's northernmost coral reefs teeming with tropical fish, turtles, and rays. The Underwater Observatory Marine Park lets visitors descend without getting wet. Snorkeling and diving are outstanding year-round. The desert mountains surrounding the city offer hiking, jeep trips, and visits to the Timna Valley copper mines and rock carvings.",
    highlights: [
      "Coral Beach snorkeling",
      "Underwater Observatory",
      "Dolphin Reef",
      "Timna Valley nearby",
      "Red Canyon hike",
    ],
    bestTime: "Year-round; summers are very hot",
    entryFee: "Free beach; attractions 40–100 NIS",
    image: `${UNSPLASH}/photo-1563911302283-d2bc129e7570?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1563911302283-d2bc129e7570?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1544551763-92ab630bf278?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1520520731457-9283dd14aa66?auto=format&fit=crop&w=800&q=80`,
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
      "Jesus's boyhood home — a city of pilgrimage with the magnificent Basilica of the Annunciation.",
    details:
      "Nazareth is the largest Arab city in Israel and one of Christianity's most important pilgrimage sites. The Basilica of the Annunciation, built over the site where the angel Gabriel announced the birth of Jesus to Mary, is one of the largest churches in the Middle East. The old market, ancient bathhouse, and reconstructed village of Nazareth Village all bring the first-century world to life. The city is known for its excellent Arabic cuisine.",
    highlights: [
      "Basilica of the Annunciation",
      "Nazareth Village",
      "Ancient Bathhouse",
      "Old Market souk",
      "Church of St. Gabriel",
    ],
    bestTime: "Year-round",
    entryFee: "Basilica free; Nazareth Village 45 NIS",
    image: `${UNSPLASH}/photo-1553913861-c0fddf2619ee?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1553913861-c0fddf2619ee?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1592789705501-f9ae4278a9c9?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1549989476-69a92fa57c36?auto=format&fit=crop&w=800&q=80`,
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
      "Dramatic white chalk cliffs with sea-carved grottos on the Lebanese border — accessible by cable car.",
    details:
      "Rosh HaNikra sits at the northwesternmost tip of Israel, where the white chalk cliffs of the Galilee meet the Mediterranean Sea. The famous sea grottos were formed over thousands of years by wave erosion and can be explored on foot along illuminated walkways. The world's steepest commercial cable car (65-degree incline) takes visitors down the cliffside. On clear days, views extend to Lebanon. The British Mandate-era railway tunnel is also visible in the cliffs.",
    highlights: [
      "Sea grottos & caves",
      "Steepest cable car",
      "Lebanese border view",
      "White cliff walks",
      "Sunset over Mediterranean",
    ],
    bestTime: "Year-round",
    entryFee: "50 NIS adults (cable car included)",
    image: `${UNSPLASH}/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80`,
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
      "Mountaintop mystical city, birthplace of Kabbalah and center of Jewish mysticism, filled with art galleries.",
    details:
      "At 900 meters above sea level in the Upper Galilee, Safed (Tzfat) is one of Judaism's four holy cities and the center of Kabbalah (Jewish mysticism). The old city's blue-painted alleyways house ancient synagogues, art galleries, and studios. The Ari Ashkenazi Synagogue and Abuhav Synagogue are masterpieces of Jewish art and architecture. The Safed Candle Factory and artists' quarter draw visitors year-round. In winter, Safed is often blanketed in snow.",
    highlights: [
      "Ancient Kabbalistic synagogues",
      "Artists' Quarter galleries",
      "Ari Ashkenazi Synagogue",
      "Mountain views to Galilee",
      "Safed Candle Factory",
    ],
    bestTime: "Spring and autumn",
    entryFee: "Free",
    image: `${UNSPLASH}/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1480796927426-f609979314bd?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80`,
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
      "A lush desert oasis with waterfalls, ibexes, and ancient synagogues, steps from the Dead Sea.",
    details:
      "Ein Gedi is an oasis of extraordinary biodiversity in the Judean Desert, where several springs create cascading waterfalls and pools surrounded by lush vegetation. David hid from King Saul in these caves, as told in the Bible. The nature reserve hosts hiking trails to Nahal David and Nahal Arugot waterfalls, ancient synagogues, ibex herds that roam freely among hikers, hyraxes, and hundreds of bird species. The Ein Gedi kibbutz botanical garden and spa are adjacent.",
    highlights: [
      "David Waterfall",
      "Wild ibex herds",
      "Ancient synagogue mosaic",
      "Nahal Arugot pools",
      "Dead Sea views",
    ],
    bestTime: "October–April",
    entryFee: "29 NIS adults",
    image: `${UNSPLASH}/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1518173946687-a4c8892bbd9f?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=800&q=80`,
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
      "Volcanic plateaus with snowcapped Mount Hermon, wineries, and sweeping views over Syria and Lebanon.",
    details:
      "The Golan Heights is a basalt plateau rising above the Sea of Galilee to the east, captured from Syria in 1967. It's home to Israel's main ski resort on Mount Hermon (the country's only ski area), dozens of wineries producing award-winning wines, Druze villages, ancient synagogues, and abundant wildlife. The Golan is one of Israel's most scenic regions, with rolling hills, wildflower meadows in spring, and waterfalls in winter.",
    highlights: [
      "Hermon ski resort",
      "Golan wineries",
      "Banias waterfall",
      "Druze village hospitality",
      "Gamla Nature Reserve",
    ],
    bestTime: "Spring for flowers; Winter for snow",
    entryFee: "Varies by attraction",
    image: `${UNSPLASH}/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1455218873509-8097305ee378?auto=format&fit=crop&w=800&q=80`,
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
      "Ancient copper mines and dramatic red rock formations including the famous King Solomon's Pillars.",
    details:
      "Timna Valley is an archaeological site in the Arava desert near Eilat with one of the world's oldest copper mines, dating back 9,000 years. The park features extraordinary sandstone formations including the iconic Mushroom Rock and the towering King Solomon's Pillars — 50-meter-high red and orange rock walls. A reconstructed Tabernacle represents the biblical desert sanctuary. Sunrise and sunset paint the rocks in vivid colors. The park also offers night tours under starlit desert skies.",
    highlights: [
      "King Solomon's Pillars",
      "Ancient copper mines",
      "Mushroom Rock",
      "Reconstructed Tabernacle",
      "Night stargazing tours",
    ],
    bestTime: "October–April",
    entryFee: "40 NIS adults",
    image: `${UNSPLASH}/photo-1527489377706-5bf97e608852?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1527489377706-5bf97e608852?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1508739773434-c26b3d09e071?auto=format&fit=crop&w=800&q=80`,
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
      "Israel's best-preserved Roman city with colonnaded streets, temples, and a theater for 8,000 spectators.",
    details:
      "Beit She'an National Park protects one of the most impressive Roman-Byzantine city ruins in the Middle East. The city was built atop a 7,000-year-old tel (settlement mound) and was one of the ten cities of the Decapolis league. The remarkably preserved colonnaded main street, Roman theater, baths, and temples give a vivid picture of ancient urban life. The site also contains ancient Egyptian ruins from the reign of Ramesses II.",
    highlights: [
      "Roman theater (8,000 seats)",
      "Colonnaded main street",
      "Ancient tel excavations",
      "Byzantine bathhouse",
      "Egyptian ruins",
    ],
    bestTime: "Year-round; cooler Oct–April",
    entryFee: "28 NIS adults",
    image: `${UNSPLASH}/photo-1555993539-1732b0258235?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1555993539-1732b0258235?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1532375810709-75b1da00537c?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1548199589-1b8ef84e1898?auto=format&fit=crop&w=800&q=80`,
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
      "Forested mountain range with nature reserves, Druze villages, and panoramic Mediterranean views.",
    details:
      "Mount Carmel is a coastal mountain range in northern Israel, rising to 546 meters above Haifa Bay. The Carmel National Park is Israel's largest national park, featuring Mediterranean forest, hiking trails, and the Ein Hod artists' village. Druze villages like Daliyat al-Karmel offer authentic cuisine and crafts. The Carmelite Monastery at Muhraka marks where Elijah the prophet defeated the prophets of Baal in the Bible. The Carmel Forest Spa Resort is a luxurious retreat in the trees.",
    highlights: [
      "Carmel National Park hiking",
      "Ein Hod artists' village",
      "Druze village cuisine",
      "Elijah's Cave",
      "Forest spa retreats",
    ],
    bestTime: "Year-round; Spring for wildflowers",
    entryFee: "Free",
    image: `${UNSPLASH}/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80`,
    gallery: [
      `${UNSPLASH}/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=800&q=80`,
      `${UNSPLASH}/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=800&q=80`,
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

export const categoryColors: Record<Category, string> = {
  Historical: "bg-amber-100 text-amber-800",
  Religious: "bg-purple-100 text-purple-800",
  Nature: "bg-green-100 text-green-800",
  Beach: "bg-blue-100 text-blue-800",
  Desert: "bg-orange-100 text-orange-800",
  City: "bg-slate-100 text-slate-800",
  Archaeology: "bg-rose-100 text-rose-800",
};

export const categoryEmoji: Record<Category, string> = {
  Historical: "🏛️",
  Religious: "🕌",
  Nature: "🌿",
  Beach: "🏖️",
  Desert: "🏜️",
  City: "🏙️",
  Archaeology: "⚱️",
};
