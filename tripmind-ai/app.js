/* ============================================================
   TripMind AI — client-side itinerary engine
   No backend, no data leaves the browser.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- small helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pick = (arr, i) => arr[i % arr.length];
  const fmtDate = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  /* ---------- icon set (inline SVG, stroked) ---------- */
  const I = {
    sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
    coffee: 'M4 8h13v5a4 4 0 01-4 4H8a4 4 0 01-4-4V8zM17 9h2a2 2 0 010 4h-2M6 2v2M10 2v2M14 2v2',
    moon: 'M21 12.8A8.5 8.5 0 1111.2 3a6.5 6.5 0 009.8 9.8z',
    pin: 'M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7z|circle:12,9,2.4',
    walk: 'M13 4a1.5 1.5 0 100 0M9 21l2-5 2 2v3M11 16l-1-4 3-2 2 3 2 1M7 10l3-2',
    food: 'M4 3v7a3 3 0 003 3v8M6 3v6M9 3v6M9 3v0M16 3c-1.5 0-3 2-3 5s1 5 3 5v8',
    bed: 'M3 18v-6h18v6M3 12V8a2 2 0 012-2h6v6M21 12V9a3 3 0 00-3-3h-2',
    shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z',
    bag: 'M6 7h12l1 13H5L6 7zM9 7V5a3 3 0 016 0v2',
    calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
    wallet: 'M3 7h16a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l3-3h11M17 13h.5',
    info: 'M12 8h.01M11 12h1v4h1|circle:12,12,9',
    star: 'M12 3l2.5 6.3L21 10l-5 4 1.6 6.6L12 17l-5.6 3.6L8 14l-5-4 6.5-.7z',
    map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14',
    camera: 'M4 8h3l2-2h6l2 2h3v12H4V8z|circle:12,13,3.2',
    leaf: 'M5 19c10 0 14-5 15-15C10 4 5 9 5 19zM5 19c3-5 7-7 11-8',
    plane: 'M10 14l-7 2 7-4V5a2 2 0 014 0v7l7 4-7-2v4l2 2H8l2-2v-4z',
    drink: 'M5 4h14l-6 8v6M9 18h8M5 4l1 4h12',
    music: 'M9 18V6l10-2v12M9 18a2 2 0 11-4 0 2 2 0 014 0zM19 16a2 2 0 11-4 0 2 2 0 014 0z',
    heart: 'M12 21C7 17 3 13 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.5C21 13 17 17 12 21z',
    check: 'M20 6L9 17l-4-4',
    mountain: 'M3 20l6-12 4 7 2-3 6 8z',
    waves: 'M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
    palette: 'M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-1-2 0-3 2 0 3 0a4 4 0 004-4c0-5-4-9-9-9z',
    shirt: 'M6 4l3-1 3 2 3-2 3 1 2 4-3 2v9H7v-9L4 8z',
    cube: 'M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10',
    health: 'M12 3v18M3 12h18M8 7h8M8 17h8'
  };
  function svg(path, w) {
    let extra = '';
    let d = path;
    if (path.includes('|circle:')) {
      const [pd, c] = path.split('|circle:');
      d = pd; const [cx, cy, r] = c.split(',');
      extra = `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke-width="${w || 2}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/>${extra}</svg>`;
  }

  /* ---------- interests ---------- */
  const INTERESTS = [
    ['history', 'History & landmarks', I.map], ['art', 'Art & museums', I.palette],
    ['food', 'Food & markets', I.food], ['nature', 'Nature & parks', I.leaf],
    ['beach', 'Beaches & water', I.waves], ['nightlife', 'Nightlife', I.music],
    ['shopping', 'Shopping', I.bag], ['adventure', 'Adventure sports', I.mountain],
    ['photography', 'Photography spots', I.camera], ['wellness', 'Spa & wellness', I.heart],
    ['architecture', 'Architecture', I.cube], ['local', 'Local & offbeat', I.pin]
  ];

  /* ---------- budget tiers (USD/person/day, ex-flights) ---------- */
  const TIERS = {
    budget:   { base: 45,  label: 'Shoestring', hotel: 'Hostels & guesthouses', acc: .42, food: .27, act: .15, trn: .09, misc: .07 },
    moderate: { base: 130, label: 'Comfort',    hotel: '3–4★ hotels & nice rentals', acc: .40, food: .26, act: .18, trn: .08, misc: .08 },
    luxury:   { base: 360, label: 'Luxury',     hotel: '4–5★ hotels & boutique stays', acc: .45, food: .25, act: .17, trn: .06, misc: .07 },
    ultra:    { base: 720, label: 'No limits',  hotel: '5★ & private experiences', acc: .48, food: .24, act: .18, trn: .04, misc: .06 }
  };
  const STYLE_TILT = {
    balanced: {}, relaxed: { act: -.04, misc: .04 }, adventure: { act: .08, trn: .02, acc: -.1 },
    culture: { act: .05, acc: -.05 }, foodie: { food: .1, acc: -.1 }, nightlife: { misc: .08, food: .04, acc: -.12 },
    luxury: { acc: .08, misc: .04, act: -.06 }, family: { acc: .06, act: -.02, food: -.02 }
  };

  /* ---------- destination database ----------
     POI tags: sight, museum, view, nature, market, food, nightlife, relax, shop, landmark, daytrip, adventure, beach
     tod: m=morning a=afternoon e=evening any   cost: free $ $$ $$$ */
  const DESTS = {
    'tokyo': {
      aka: ['tokyo', 'japan'], vibe: 'a hyper-organized megacity where neon, tradition and the world\'s best food sit side by side',
      currency: 'JPY (¥)', climateNote: 'Humid summers, crisp winters; pack for rain in June–July.',
      pois: [
        ['Senso-ji Temple & Asakusa', 'Tokyo\'s oldest temple and lantern-lined Nakamise shopping street.', 'sight', 'm', 'free', 'Go early to beat crowds and catch soft morning light.'],
        ['Meiji Jingu & Yoyogi Park', 'A forest shrine that feels worlds away from the city.', 'nature', 'm', 'free', 'Sundays bring cosplayers and street performers nearby.'],
        ['teamLab Planets', 'Immersive digital-art rooms you walk through barefoot.', 'museum', 'a', '$$', 'Book a timed ticket days ahead — it sells out.'],
        ['Shibuya Crossing & Sky', 'The famous scramble plus a rooftop view over it.', 'view', 'a', '$', 'Hachiko statue is the classic meet-up spot.'],
        ['Tsukiji Outer Market', 'Grilled scallops, tamago and knife shops.', 'market', 'm', '$', 'Come hungry and graze — most stalls are cash only.'],
        ['Shinjuku & Omoide Yokocho', 'Skyscrapers by day, smoky yakitori alleys by night.', 'nightlife', 'e', '$$', 'Golden Gai\'s tiny bars often add a cover charge.'],
        ['Akihabara', 'Electronics, anime and retro arcades.', 'shop', 'a', '$', 'Multi-floor stores hide the best finds up top.'],
        ['Ueno Museums', 'Cluster of top museums around a leafy park.', 'museum', 'a', '$', 'The National Museum is the standout for history.'],
        ['Shimokitazawa', 'Vintage shops, indie coffee and a laid-back crowd.', 'local', 'a', '$', 'Great for an unhurried, walkable afternoon.'],
        ['Tokyo Skytree', 'One of the world\'s tallest towers with sweeping views.', 'view', 'e', '$$', 'Sunset slots give you day and night in one visit.'],
        ['Day trip: Hakone', 'Hot springs, a lake and Mt Fuji views.', 'daytrip', 'm', '$$', 'The loop pass covers train, cable car and pirate ship.'],
        ['Yanaka Old Town', 'Wooden houses, temples and a nostalgic shotengai.', 'local', 'm', 'free', 'One of the few areas to survive the war intact.']
      ],
      areas: [
        ['Shinjuku', 'Best transport hub — trains everywhere, endless food & nightlife.', 'First-timers & night owls'],
        ['Shibuya', 'Young, buzzy and central to the fashion districts.', 'Shopping & energy'],
        ['Asakusa', 'Traditional, lower-cost and atmospheric by the river.', 'Budget & culture'],
        ['Ginza / Marunouchi', 'Polished, central and steps from Tokyo Station.', 'Luxury & convenience']
      ],
      foods: ['Sushi & sashimi', 'Ramen (try tonkotsu & shoyu)', 'Tempura', 'Okonomiyaki', 'Wagashi sweets & matcha'],
      foodSpots: ['Standing sushi bars in Tsukiji', 'Ramen alleys in Shinjuku', 'Depachika food halls in department-store basements'],
      safety: [
        ['low', 'Extremely safe, even late at night', 'Tokyo has very low street crime; lost wallets are often returned.'],
        ['med', 'Mind the rush-hour crush', 'Trains pack tight 8–9am and 6–7pm; keep bags in front.'],
        ['low', 'Carry some cash', 'Many small restaurants and shrines are cash-only.']
      ],
      packExtra: ['Comfortable walking shoes (you\'ll average 15k+ steps)', 'A coin purse for vending machines', 'Pocket Wi-Fi or eSIM']
    },
    'paris': {
      aka: ['paris', 'france'], vibe: 'a city built for wandering — grand boulevards, café terraces and art around every corner',
      currency: 'EUR (€)', climateNote: 'Mild and changeable; a light layer and umbrella help most of the year.',
      pois: [
        ['Louvre Museum', 'The world\'s most-visited museum — pace yourself.', 'museum', 'm', '$$', 'Enter via the Carrousel mall to skip the pyramid line.'],
        ['Eiffel Tower & Champ de Mars', 'The icon, best enjoyed with a picnic on the lawn.', 'landmark', 'e', '$$', 'It sparkles for 5 minutes on the hour after dark.'],
        ['Notre-Dame & Île de la Cité', 'The Gothic heart of the city by the Seine.', 'sight', 'm', 'free', 'Pair with Sainte-Chapelle\'s stained glass nearby.'],
        ['Montmartre & Sacré-Cœur', 'Hilltop village lanes, artists\' square and city views.', 'view', 'a', 'free', 'Climb early; the steps get packed by midday.'],
        ['Musée d\'Orsay', 'Impressionist masterpieces in a former railway station.', 'museum', 'a', '$$', 'Lighter and lovelier than the Louvre for many.'],
        ['Le Marais', 'Boutiques, falafel, galleries and the Picasso Museum.', 'shop', 'a', '$', 'Sundays it stays lively when much of Paris closes.'],
        ['Seine river cruise', 'See the monuments float by at dusk.', 'relax', 'e', '$$', 'Cheaper to walk the quais if budget is tight.'],
        ['Latin Quarter & Luxembourg Gardens', 'Bookshops, students and a beautiful park.', 'nature', 'a', 'free', 'Grab a chair by the fountain and people-watch.'],
        ['Canal Saint-Martin', 'Hip, local and great for an evening apéro.', 'local', 'e', '$', 'Picnic canal-side like the Parisians do.'],
        ['Day trip: Versailles', 'The palace and gardens of the Sun King.', 'daytrip', 'm', '$$', 'Reserve a timed slot; gardens are free on most days.'],
        ['Marché des Enfants Rouges', 'Paris\'s oldest covered market for lunch.', 'market', 'm', '$', 'Moroccan and Italian stalls draw the queues.']
      ],
      areas: [
        ['Le Marais (3rd/4th)', 'Central, characterful, walkable to everything.', 'First-timers'],
        ['Saint-Germain (6th)', 'Classic, elegant, café culture at its best.', 'Romance & charm'],
        ['Latin Quarter (5th)', 'Lively, central and friendlier on the wallet.', 'Budget & students'],
        ['Canal Saint-Martin (10th)', 'Local, trendy, great food scene.', 'Offbeat & nightlife']
      ],
      foods: ['Fresh croissants & pain au chocolat', 'Steak-frites', 'Cheese & charcuterie boards', 'Crêpes', 'Macarons & pastries'],
      foodSpots: ['Neighborhood boulangeries each morning', 'Bistros in the Marais', 'Rue Montorgueil market street'],
      safety: [
        ['med', 'Watch for pickpockets', 'Especially on the metro, around the Eiffel Tower and Sacré-Cœur.'],
        ['med', 'Ignore "petition" and "gold ring" scams', 'Common near tourist sites — keep walking.'],
        ['low', 'Generally safe to stroll', 'Stick to lit, busy streets late at night.']
      ],
      packExtra: ['A scarf (it dresses up any outfit here)', 'Comfortable but smart shoes', 'A reusable picnic kit']
    },
    'rome': {
      aka: ['rome', 'roma', 'italy'], vibe: 'an open-air museum where ancient ruins, baroque squares and great food collide',
      currency: 'EUR (€)', climateNote: 'Hot dry summers; spring and autumn are ideal. Bring sun cover.',
      pois: [
        ['Colosseum & Roman Forum', 'The beating heart of ancient Rome.', 'landmark', 'm', '$$', 'A combined ticket includes Palatine Hill — go early.'],
        ['Vatican Museums & Sistine Chapel', 'Centuries of art ending in Michelangelo\'s ceiling.', 'museum', 'm', '$$', 'Book the first entry slot to dodge the crush.'],
        ['Pantheon', 'A 2,000-year-old dome that still stuns.', 'sight', 'a', 'free', 'Pop into a nearby café for the city\'s best espresso.'],
        ['Trevi Fountain & Spanish Steps', 'Baroque showstoppers a short walk apart.', 'sight', 'e', 'free', 'Visit Trevi after 9pm for fewer crowds.'],
        ['Trastevere', 'Cobbled, ivy-clad and the place to eat at night.', 'nightlife', 'e', '$$', 'Wander without a plan and follow the noise.'],
        ['Borghese Gallery & Gardens', 'Bernini sculptures in a leafy park.', 'museum', 'a', '$$', 'Timed entry only — reserve ahead.'],
        ['Campo de\' Fiori market', 'Morning produce, evening aperitivo.', 'market', 'm', '$', 'Great for picnic supplies and people-watching.'],
        ['Castel Sant\'Angelo', 'A riverside fortress with rooftop views.', 'view', 'a', '$', 'The bridge of angels in front is photogenic at dusk.'],
        ['Day trip: Ostia Antica', 'A remarkably intact ancient port town.', 'daytrip', 'm', '$', 'Quieter and cheaper than Pompeii, 30 min by train.'],
        ['Aperitivo in Monti', 'A chic, local neighborhood near the Forum.', 'local', 'e', '$$', 'Snacks often come free with your evening drink.']
      ],
      areas: [
        ['Monti', 'Central, hip and walkable to the ancient sites.', 'Sweet spot for most'],
        ['Trastevere', 'Atmospheric and lively after dark.', 'Food & nightlife'],
        ['Centro Storico', 'In the middle of the icons; pricier.', 'Convenience'],
        ['Prati', 'Quiet, elegant, near the Vatican.', 'Calm & families']
      ],
      foods: ['Cacio e pepe & carbonara', 'Roman-style pizza al taglio', 'Supplì (fried rice balls)', 'Gelato', 'Espresso & cornetti'],
      foodSpots: ['Trattorias in Trastevere', 'Pizza al taglio counters', 'Gelaterias using seasonal fruit'],
      safety: [
        ['med', 'Pickpockets on buses & metro', 'The 64 bus to the Vatican is notorious — bag in front.'],
        ['low', 'Hot summer sun', 'Carry water; many fountains (nasoni) give free refills.'],
        ['low', 'Taxi only from official ranks', 'Avoid unmetered offers at stations.']
      ],
      packExtra: ['Refillable water bottle', 'Shoulder-covering layer for churches', 'Sturdy shoes for cobblestones']
    },
    'barcelona': {
      aka: ['barcelona', 'spain', 'catalonia'], vibe: 'beach-meets-boulevard energy with Gaudí\'s dreamlike architecture and late, lively nights',
      currency: 'EUR (€)', climateNote: 'Warm and sunny much of the year; summer is hot and busy.',
      pois: [
        ['Sagrada Família', 'Gaudí\'s unfinished, otherworldly basilica.', 'landmark', 'm', '$$', 'Book a timed ticket; the towers cost extra but wow.'],
        ['Park Güell', 'Mosaic terraces and city-and-sea views.', 'view', 'm', '$', 'The monumental zone is ticketed — reserve a slot.'],
        ['Gothic Quarter', 'Medieval lanes, hidden squares and tapas.', 'sight', 'a', 'free', 'Get lost on purpose — that\'s the joy.'],
        ['La Boqueria market', 'A riot of color off Las Ramblas.', 'market', 'm', '$', 'Eat at the back stalls where locals do.'],
        ['Casa Batlló & Passeig de Gràcia', 'Modernista facades along a grand avenue.', 'museum', 'a', '$$', 'The audioguide brings the building to life.'],
        ['Barceloneta beach', 'City sand, seafood shacks and a boardwalk.', 'beach', 'a', 'free', 'Watch your things while you swim.'],
        ['El Born & Picasso Museum', 'Cool boutiques and the artist\'s early work.', 'museum', 'a', '$', 'Free entry on Thursday evenings — go early.'],
        ['Bunkers del Carmel', 'A hilltop ruin with the best free sunset view.', 'view', 'e', 'free', 'Bring snacks and a drink for golden hour.'],
        ['Tapas crawl in El Born', 'Hop between bars for small plates and vermouth.', 'nightlife', 'e', '$$', 'Dinner here rarely starts before 9pm.'],
        ['Day trip: Montserrat', 'A mountaintop monastery and hiking trails.', 'daytrip', 'm', '$$', 'Take the rack railway up for the views.']
      ],
      areas: [
        ['Eixample', 'Central, elegant grid near the big sights.', 'Most travelers'],
        ['Gothic Quarter / El Born', 'Atmospheric and walkable; can be noisy.', 'Nightlife & culture'],
        ['Gràcia', 'Local, villagey, full of plazas.', 'Offbeat & relaxed'],
        ['Barceloneta', 'By the beach; lively in summer.', 'Sun & sea']
      ],
      foods: ['Tapas & pintxos', 'Paella & fideuà', 'Jamón ibérico', 'Pa amb tomàquet', 'Crema catalana'],
      foodSpots: ['Vermouth bars in Gràcia', 'Seafood at Barceloneta', 'Tapas counters in El Born'],
      safety: [
        ['high', 'Pickpocketing is the #1 issue', 'Las Ramblas, metro and the beach are hotspots — stay alert.'],
        ['low', 'Nightlife runs very late', 'Plan a safe route or taxi home after clubs close at dawn.'],
        ['low', 'Beach theft', 'Never leave bags unattended on the sand.']
      ],
      packExtra: ['A cross-body anti-theft bag', 'Swimwear', 'Light layers for late dinners']
    },
    'new york': {
      aka: ['new york', 'nyc', 'manhattan', 'brooklyn'], vibe: 'relentless, electric and endlessly walkable — a different world in every neighborhood',
      currency: 'USD ($)', climateNote: 'Cold winters, humid summers; layers and good shoes are essential.',
      pois: [
        ['Central Park', 'A green heart with lakes, bridges and skyline views.', 'nature', 'm', 'free', 'Rent a bike or just wander from Bethesda Terrace.'],
        ['The Met / MoMA', 'World-class art on the Upper East Side or Midtown.', 'museum', 'a', '$$', 'The Met has a suggested donation for some visitors.'],
        ['Top of the Rock / Edge', 'The best skyline panoramas — including the Empire State.', 'view', 'e', '$$', 'Sunset slots are worth the premium.'],
        ['High Line & Chelsea', 'An elevated park over the West Side, into galleries.', 'sight', 'a', 'free', 'Ends at the buzzy Chelsea Market for lunch.'],
        ['Brooklyn Bridge & DUMBO', 'Walk the bridge into a postcard neighborhood.', 'view', 'm', 'free', 'Start in Brooklyn, walk toward Manhattan for the skyline.'],
        ['Greenwich Village & SoHo', 'Brownstones, boutiques and jazz clubs.', 'local', 'a', '$', 'Catch a late set at a Village jazz bar.'],
        ['9/11 Memorial & Financial District', 'Reflecting pools and the new tower.', 'sight', 'm', '$', 'The museum is moving but emotionally heavy.'],
        ['Times Square & a Broadway show', 'Pure spectacle, then a world-class stage.', 'nightlife', 'e', '$$$', 'TKTS booth sells same-day discounted tickets.'],
        ['Williamsburg, Brooklyn', 'Indie shops, rooftop bars and food halls.', 'nightlife', 'e', '$$', 'Smorgasburg food market runs weekends in season.'],
        ['Grand Central & Bryant Park', 'A beaux-arts terminal and a leafy square.', 'landmark', 'a', 'free', 'Whisper in the gallery\'s acoustic arches.']
      ],
      areas: [
        ['Midtown', 'Central to everything; great transit, less character.', 'First-timers'],
        ['Lower East Side / SoHo', 'Trendy, walkable, packed with food.', 'Style & nightlife'],
        ['Williamsburg (Brooklyn)', 'Cooler, cheaper, quick to Manhattan.', 'Hip & value'],
        ['Upper West Side', 'Calm, residential, by Central Park.', 'Families']
      ],
      foods: ['New York pizza by the slice', 'Bagels with lox', 'Pastrami on rye', 'Global eats in food halls', 'Cheesecake'],
      foodSpots: ['Classic Jewish delis', 'Food halls like Chelsea Market', 'Dollar-slice pizza joints'],
      safety: [
        ['low', 'Safer than its reputation', 'Stay aware on late-night subways; ride the busier cars.'],
        ['med', 'Watch your bag in crowds', 'Times Square and packed trains attract pickpockets.'],
        ['low', 'Jaywalking & traffic', 'Cross at lights — drivers turn aggressively.']
      ],
      packExtra: ['Genuinely comfortable shoes', 'A refillable bottle', 'Layers — buildings are over-cooled/heated']
    },
    'london': {
      aka: ['london', 'england', 'uk', 'united kingdom'], vibe: 'a deep, layered capital of world museums, royal pomp, markets and village-like pockets',
      currency: 'GBP (£)', climateNote: 'Mild but wet year-round; always pack a compact umbrella.',
      pois: [
        ['British Museum', 'From the Rosetta Stone to the Parthenon marbles — free.', 'museum', 'm', 'free', 'Pick 2–3 wings; you can\'t do it all in a day.'],
        ['Tower of London & Tower Bridge', 'Crown jewels, ravens and a Thames icon.', 'landmark', 'a', '$$', 'Yeoman Warder tours are included and excellent.'],
        ['Westminster & Buckingham Palace', 'Big Ben, the Abbey and the changing of the guard.', 'sight', 'm', 'free', 'Check the guard-change schedule before you go.'],
        ['South Bank walk', 'River views, the Eye, street food and theatres.', 'view', 'a', 'free', 'Stroll from the Eye to Tate Modern.'],
        ['Borough Market', 'London\'s best food market under the railway arches.', 'market', 'm', '$', 'Go hungry and graze your way through lunch.'],
        ['Tate Modern / National Gallery', 'World art, free to enter.', 'museum', 'a', 'free', 'Tate\'s top-floor view of St Paul\'s is a bonus.'],
        ['Camden & Regent\'s Canal', 'Alt markets, music history and a canal walk.', 'local', 'a', '$', 'Walk the towpath toward Little Venice.'],
        ['Soho & West End show', 'Dinner then a world-class musical or play.', 'nightlife', 'e', '$$$', 'TodayTix and TKTS sell day-of discounts.'],
        ['Notting Hill & Portobello Road', 'Pastel houses and a famous antiques market.', 'shop', 'm', 'free', 'Saturday is the full market; weekdays are calmer.'],
        ['Day trip: Greenwich', 'Maritime history, the meridian and park views.', 'daytrip', 'a', '$', 'Take the river boat down for the scenic route.']
      ],
      areas: [
        ['Soho / Covent Garden', 'In the thick of theatres and food; lively.', 'First-timers'],
        ['South Bank / Southwark', 'Riverside, central, great food.', 'Sightseeing'],
        ['Shoreditch', 'Hip, arty, strong nightlife.', 'Cool & creative'],
        ['Kensington', 'Elegant, near the big free museums.', 'Calm & families']
      ],
      foods: ['Sunday roast', 'Fish & chips', 'Full English breakfast', 'Global curries & dim sum', 'Afternoon tea'],
      foodSpots: ['Borough & Maltby Street markets', 'Historic pubs', 'Brick Lane curry houses'],
      safety: [
        ['low', 'Broadly safe, well-policed', 'Standard city caution applies, especially late at night.'],
        ['med', 'Phone snatching', 'Don\'t hold your phone loosely near roads — bikes grab them.'],
        ['low', 'Mind the traffic direction', 'Look right first when crossing.']
      ],
      packExtra: ['Compact umbrella & waterproof', 'An Oyster/contactless card for transit', 'A warm layer even in summer']
    },
    'bangkok': {
      aka: ['bangkok', 'thailand'], vibe: 'a sensory rush of golden temples, street food, river life and dizzying markets',
      currency: 'THB (฿)', climateNote: 'Hot and humid year-round; rainy season May–Oct. Dress light and modest for temples.',
      pois: [
        ['Grand Palace & Wat Phra Kaew', 'The dazzling royal complex and Emerald Buddha.', 'landmark', 'm', '$', 'Dress code is strict — cover shoulders and knees.'],
        ['Wat Pho & reclining Buddha', 'A giant gilded Buddha and a famous massage school.', 'sight', 'm', '$', 'Get a traditional Thai massage right on site.'],
        ['Chao Phraya river boats', 'Cheap, breezy transport past riverside temples.', 'view', 'a', '$', 'The orange-flag express boat is the local way.'],
        ['Chatuchak Weekend Market', 'Thousands of stalls — a shopping marathon.', 'market', 'm', '$', 'Go early before the heat; sections are mapped online.'],
        ['Wat Arun', 'The "Temple of Dawn" glows at sunset.', 'view', 'e', '$', 'Cross by ferry and view it from the Eat Sight Story side.'],
        ['Chinatown (Yaowarat) food crawl', 'The city\'s best street-food street after dark.', 'food', 'e', '$', 'Follow the longest local queues.'],
        ['Jim Thompson House', 'A serene teak-house museum of Thai art.', 'museum', 'a', '$', 'A cool, green escape from the midday heat.'],
        ['Rooftop sky bar', 'Cocktails high above the glittering skyline.', 'nightlife', 'e', '$$', 'There\'s often a dress code — no shorts/sandals.'],
        ['Day trip: Ayutthaya', 'Atmospheric ruins of an ancient capital.', 'daytrip', 'm', '$', 'Rent a bike to tour the temple islands.'],
        ['Khlong (canal) tour', 'See stilt houses and local life by longtail boat.', 'local', 'a', '$', 'Agree the price before you board.']
      ],
      areas: [
        ['Sukhumvit', 'Modern, on the Skytrain, full of food & nightlife.', 'Convenience'],
        ['Riverside (Old City)', 'Near the temples and the river.', 'Sightseeing & charm'],
        ['Silom', 'Business by day, lively by night.', 'Nightlife'],
        ['Banglamphu / Khao San', 'Backpacker hub, cheap and central-ish.', 'Budget']
      ],
      foods: ['Pad thai & pad see ew', 'Green & massaman curry', 'Som tam (papaya salad)', 'Mango sticky rice', 'Boat noodles'],
      foodSpots: ['Yaowarat street stalls', 'Markets like Or Tor Kor', 'Riverside seafood spots'],
      safety: [
        ['med', 'Tuk-tuk & gem scams', 'Insist on the meter in taxis; skip "special tour" tuk-tuks.'],
        ['med', 'Street food & water', 'Eat at busy stalls; drink bottled or filtered water.'],
        ['low', 'Heat exhaustion', 'Hydrate, rest midday, and use sun protection.']
      ],
      packExtra: ['Modest temple cover-up (shoulders & knees)', 'Electrolytes & strong sunscreen', 'Slip-on shoes for temple visits']
    },
    'bali': {
      aka: ['bali', 'indonesia', 'ubud', 'canggu', 'seminyak'], vibe: 'lush rice terraces, surf beaches, temples and a deeply relaxed island rhythm',
      currency: 'IDR (Rp)', climateNote: 'Tropical; dry season Apr–Oct is best. Expect heat, humidity and sudden showers.',
      pois: [
        ['Ubud rice terraces (Tegallalang)', 'Emerald stepped fields and jungle swings.', 'nature', 'm', '$', 'Arrive at opening to beat tour buses.'],
        ['Sacred Monkey Forest', 'A temple sanctuary full of macaques.', 'nature', 'a', '$', 'Hide snacks and sunglasses — the monkeys are bold.'],
        ['Tegenungan / waterfall', 'A cooling jungle waterfall swim.', 'adventure', 'm', '$', 'Wear sandals with grip on the steps.'],
        ['Tanah Lot temple', 'A sea temple on a rock, magic at sunset.', 'view', 'e', '$', 'Come 90 min before sunset for parking and light.'],
        ['Uluwatu temple & Kecak dance', 'Clifftop temple and a fire-lit dance at dusk.', 'sight', 'e', '$', 'Hold your bag tight — more cheeky monkeys.'],
        ['Canggu / Seminyak beach', 'Surf, beach clubs and sunset cocktails.', 'beach', 'a', '$$', 'Beginner surf lessons are cheap and fun here.'],
        ['Balinese spa & yoga', 'Affordable massages and riverside yoga.', 'relax', 'a', '$', 'Ubud is the wellness heartland.'],
        ['Nusa Penida day trip', 'Dramatic cliffs and turquoise coves by boat.', 'daytrip', 'm', '$$', 'Roads are rough — book a reputable tour.'],
        ['Campuhan Ridge walk', 'An easy green ridge stroll in Ubud.', 'nature', 'm', 'free', 'Go at dawn before the heat builds.'],
        ['Jimbaran seafood dinner', 'Grilled catch on the sand at sunset.', 'food', 'e', '$$', 'Confirm prices by weight before ordering.']
      ],
      areas: [
        ['Ubud', 'Green, cultural, wellness-focused inland.', 'Nature & calm'],
        ['Seminyak', 'Stylish, beachy, good dining & shopping.', 'Comfort & style'],
        ['Canggu', 'Surf, cafés and a young digital-nomad scene.', 'Hip & social'],
        ['Uluwatu', 'Clifftop luxury and world-class surf.', 'Romance & views']
      ],
      foods: ['Nasi/mie goreng', 'Babi guling (suckling pig)', 'Satay lilit', 'Fresh tropical fruit & smoothie bowls', 'Nasi campur'],
      foodSpots: ['Warungs (local family eateries)', 'Jimbaran beach grills', 'Ubud health cafés'],
      safety: [
        ['med', 'Scooter accidents are the top risk', 'Wear a helmet, go slow, and only ride if experienced.'],
        ['med', 'Bali belly', 'Drink bottled water; be choosy with ice and raw veg.'],
        ['low', 'Tides & currents', 'Swim where flags allow; some beaches have strong rips.']
      ],
      packExtra: ['Reef-safe sunscreen & after-sun', 'A sarong (for temples and beaches)', 'Anti-mosquito repellent']
    },
    'lisbon': {
      aka: ['lisbon', 'lisboa', 'portugal'], vibe: 'sun-washed hills, tiled facades, rattling trams and soulful fado nights',
      currency: 'EUR (€)', climateNote: 'Mild and sunny; summers warm, winters gentle. Hills mean good shoes.',
      pois: [
        ['Alfama & Tram 28', 'The old Moorish quarter best seen from a vintage tram.', 'sight', 'm', '$', 'Board early at the start of the line for a seat.'],
        ['São Jorge Castle', 'Ramparts with the city\'s best panorama.', 'view', 'm', '$', 'Peacocks roam the grounds; go for sunset light.'],
        ['Belém: Jerónimos & Tower', 'Maritime-era monuments by the river.', 'landmark', 'a', '$', 'Queue at Pastéis de Belém for the original tart.'],
        ['LX Factory', 'A creative complex of shops, art and food under a bridge.', 'local', 'a', '$', 'Great brunch and a famous bookshop.'],
        ['Time Out Market', 'Top chefs and classics under one roof.', 'food', 'e', '$$', 'Busy at peak — go a little early or late.'],
        ['Miradouros (viewpoints)', 'Hop between hilltop terraces for sunset drinks.', 'view', 'e', 'free', 'Santa Catarina and Graça are local favorites.'],
        ['Fado night in Alfama', 'Portugal\'s mournful, beautiful music over dinner.', 'nightlife', 'e', '$$', 'Reserve a small, intimate venue for the real thing.'],
        ['Day trip: Sintra', 'Fairytale palaces in misty green hills.', 'daytrip', 'm', '$$', 'Pre-book Pena Palace; start early to fit two sites.'],
        ['Day trip: Cascais', 'A breezy seaside town and beaches.', 'beach', 'a', '$', 'Easy 40-min train ride along the coast.'],
        ['Bairro Alto bar crawl', 'Tiny bars spilling onto the streets at night.', 'nightlife', 'e', '$', 'Drinks are cheap; the crowd fills the lanes.']
      ],
      areas: [
        ['Baixa / Chiado', 'Central, flat-ish, walkable to most sights.', 'First-timers'],
        ['Alfama', 'Historic, atmospheric, steep lanes.', 'Charm & fado'],
        ['Príncipe Real', 'Chic, leafy, great dining.', 'Style & calm'],
        ['Cais do Sodré / Bairro Alto', 'Nightlife central.', 'Going out']
      ],
      foods: ['Pastéis de nata', 'Bacalhau (salt cod) dishes', 'Grilled sardines', 'Bifana pork sandwich', 'Seafood rice'],
      foodSpots: ['Tascas (tiny taverns)', 'Time Out Market', 'Belém pastry shops'],
      safety: [
        ['low', 'Very safe overall', 'One of Europe\'s safer capitals.'],
        ['med', 'Pickpockets on Tram 28', 'The famous tram and crowded viewpoints attract them.'],
        ['low', 'Slippery cobbles & hills', 'Wear grippy shoes, especially after rain.']
      ],
      packExtra: ['Grippy walking shoes for hills', 'Layers for breezy evenings', 'Sunglasses & sun cream']
    },
    'dubai': {
      aka: ['dubai', 'uae', 'emirates'], vibe: 'a futuristic desert metropolis of record-breaking towers, malls, beaches and dunes',
      currency: 'AED (د.إ)', climateNote: 'Very hot May–Sep; Nov–Mar is glorious. Indoor venues are heavily air-conditioned.',
      pois: [
        ['Burj Khalifa "At the Top"', 'The world\'s tallest building\'s observation decks.', 'view', 'e', '$$', 'Book a sunset slot well ahead for day-and-night.'],
        ['Dubai Mall & Fountain', 'A mega-mall, aquarium and nightly fountain show.', 'shop', 'e', 'free', 'The fountains dance every 30 min after dark.'],
        ['Old Dubai: Al Fahidi & Creek', 'Wind-tower lanes, museums and abra boat crossings.', 'sight', 'm', '$', 'Cross the creek on a 1 AED traditional abra.'],
        ['Gold & Spice Souks', 'Glittering, fragrant traditional markets.', 'market', 'a', '$', 'Haggling is expected — start low and smile.'],
        ['Desert safari', 'Dune bashing, camels and a Bedouin-style dinner.', 'adventure', 'a', '$$', 'Afternoon tours catch the sunset over the dunes.'],
        ['Palm Jumeirah & The View', 'The famous palm island and a skyline viewpoint.', 'view', 'a', '$$', 'The monorail runs the spine of the palm.'],
        ['Jumeirah / JBR beach', 'Soft sand with the Burj Al Arab as backdrop.', 'beach', 'm', 'free', 'Public beaches are free; clubs charge for loungers.'],
        ['Museum of the Future', 'A striking building and immersive exhibits.', 'museum', 'a', '$$', 'Tickets sell out — book days in advance.'],
        ['Dubai Marina & dhow dinner', 'A cruise past the glittering towers.', 'nightlife', 'e', '$$', 'The Marina Walk is lovely for an evening stroll.'],
        ['Day trip: Hatta or Abu Dhabi', 'Mountains and a dam, or the Grand Mosque.', 'daytrip', 'm', '$$', 'Sheikh Zayed Mosque is free but has a dress code.']
      ],
      areas: [
        ['Downtown', 'By the Burj Khalifa and Dubai Mall; central.', 'Icons & convenience'],
        ['Dubai Marina / JBR', 'Beachy, lively, lots of dining.', 'Sea & nightlife'],
        ['Deira / Bur Dubai', 'Old-town character and better value.', 'Budget & culture'],
        ['Palm Jumeirah', 'Resort luxury on the island.', 'Indulgence']
      ],
      foods: ['Shawarma & mezze', 'Emirati machboos', 'Luqaimat (sweet dumplings)', 'Global fine dining', 'Fresh juices'],
      foodSpots: ['Al Seef & creek-side eateries', 'Mall food halls', 'Marina waterfront restaurants'],
      safety: [
        ['low', 'Extremely safe & low crime', 'Among the safest big cities for visitors.'],
        ['med', 'Respect local laws & customs', 'Dress modestly at heritage/religious sites; no public intoxication.'],
        ['med', 'Extreme heat in summer', 'Plan outdoor activity for early morning or evening.']
      ],
      packExtra: ['Light, modest clothing & a cover-up', 'High-SPF sunscreen & sunglasses', 'A light layer for fierce air-con']
    },
    'reykjavik': {
      aka: ['reykjavik', 'iceland'], vibe: 'a tiny, design-forward capital that\'s a launchpad to waterfalls, geysers and the aurora',
      currency: 'ISK (kr)', climateNote: 'Cold, windy and fast-changing all year. Waterproof layers are non-negotiable.',
      pois: [
        ['Hallgrímskirkja & old town', 'The landmark church tower over colorful streets.', 'sight', 'm', '$', 'Ride the tower lift for a rooftop city view.'],
        ['Golden Circle', 'Þingvellir rift, Geysir and Gullfoss waterfall.', 'daytrip', 'm', '$$', 'The classic full-day loop — self-drive or tour.'],
        ['Blue Lagoon / Sky Lagoon', 'A geothermal spa soak in milky-blue water.', 'relax', 'a', '$$$', 'Pre-book a slot; Sky Lagoon is closer to town.'],
        ['South Coast waterfalls', 'Seljalandsfoss, Skógafoss and a black-sand beach.', 'nature', 'm', '$$', 'A long but jaw-dropping day — leave early.'],
        ['Northern Lights hunt', 'Chase the aurora on clear autumn–winter nights.', 'adventure', 'e', '$$', 'Only Sep–Apr; tours rebook you if clouds win.'],
        ['Harpa concert hall & harbour', 'A glittering glass landmark by the water.', 'view', 'a', 'free', 'Free to wander inside; lovely at dusk.'],
        ['Whale watching', 'Boat trips from the old harbour.', 'nature', 'a', '$$', 'Dress far warmer than you think for the wind.'],
        ['Reykjavík food & bar crawl', 'Cosy bars and New Nordic plates.', 'nightlife', 'e', '$$$', 'Weekend "rúntur" bar-hopping is a local tradition.'],
        ['Day trip: Snæfellsnes', 'A peninsula of "Iceland in miniature".', 'daytrip', 'm', '$$', 'Kirkjufell mountain is the photographer\'s dream.'],
        ['Geothermal bakery & pool', 'Soak in a local hot pool like a true Icelander.', 'relax', 'm', '$', 'Shower thoroughly before entering — it\'s the rule.']
      ],
      areas: [
        ['Downtown (101)', 'Walkable core with bars, shops and food.', 'Most visitors'],
        ['Old Harbour', 'By the water and the tour boats.', 'Nature trips'],
        ['Laugardalur', 'Quieter, near the big thermal pool.', 'Calm & value'],
        ['Near Keflavík', 'Handy for short stays & the Blue Lagoon.', 'Quick stopovers']
      ],
      foods: ['Lamb soup (kjötsúpa)', 'Fresh Arctic fish', 'Skyr (thick yogurt)', 'Pylsur (lamb hot dog)', 'Rúgbrauð (geothermal rye)'],
      foodSpots: ['The famous harbour hot-dog stand', 'New Nordic bistros downtown', 'Bakeries for cinnamon buns'],
      safety: [
        ['low', 'One of the safest countries on earth', 'Crime is minimal; nature is the real risk.'],
        ['high', 'Respect the weather & roads', 'Check road.is and vedur.is; storms close routes fast.'],
        ['med', 'Stay behind barriers', 'Cliffs, sneaker waves and hot springs can be deadly.']
      ],
      packExtra: ['Waterproof jacket & trousers', 'Thermal base layers & hat/gloves', 'A swimsuit (for the lagoons)']
    },
    'kyoto': {
      aka: ['kyoto'], vibe: 'Japan\'s serene old capital of golden temples, geisha lanes, gardens and tea houses',
      currency: 'JPY (¥)', climateNote: 'Beautiful spring (cherry) and autumn (foliage); summers are humid, winters cold.',
      pois: [
        ['Fushimi Inari shrine', 'Thousands of vermilion torii gates up a mountain.', 'sight', 'm', 'free', 'Climb at dawn for empty gates and soft light.'],
        ['Arashiyama bamboo grove', 'A towering green corridor and riverside town.', 'nature', 'm', 'free', 'Pair with the Iwatayama monkey park and Tenryu-ji.'],
        ['Kinkaku-ji (Golden Pavilion)', 'A gold-leaf temple mirrored in its pond.', 'landmark', 'a', '$', 'Mornings are calmer; it\'s a quick, scenic visit.'],
        ['Gion & Higashiyama', 'Wooden machiya lanes where you may glimpse geiko.', 'local', 'e', 'free', 'Be respectful — don\'t chase or block geisha.'],
        ['Kiyomizu-dera', 'A hillside temple with a famous wooden stage.', 'view', 'a', '$', 'The approach lanes are full of crafts and sweets.'],
        ['Nishiki Market', '"Kyoto\'s kitchen" — a covered food street.', 'market', 'm', '$', 'Graze on pickles, tofu and skewers.'],
        ['Tea ceremony', 'A quiet, ceremonial matcha experience.', 'relax', 'a', '$$', 'Book a small-group session for real interaction.'],
        ['Philosopher\'s Path', 'A canal-side stroll between temples.', 'nature', 'a', 'free', 'Magical under cherry blossom in early April.'],
        ['Day trip: Nara', 'Bowing deer and a giant bronze Buddha.', 'daytrip', 'm', '$', 'Buy deer crackers — and bow back to them.'],
        ['Pontocho dinner alley', 'A lantern-lit lane of riverside restaurants.', 'food', 'e', '$$', 'In summer, dine on the kawayuka river terraces.']
      ],
      areas: [
        ['Downtown (Kawaramachi)', 'Central, near food, market and transit.', 'Most visitors'],
        ['Higashiyama / Gion', 'Atmospheric and traditional.', 'Charm & temples'],
        ['Near Kyoto Station', 'Convenient for day trips and bags.', 'Convenience'],
        ['Arashiyama', 'Scenic and serene on the edge.', 'Nature & calm']
      ],
      foods: ['Kaiseki (multi-course)', 'Yudofu (hot tofu)', 'Matcha sweets', 'Obanzai home-style dishes', 'Yuba (tofu skin)'],
      foodSpots: ['Nishiki Market stalls', 'Pontocho riverside restaurants', 'Temple-area tea houses'],
      safety: [
        ['low', 'Very safe and orderly', 'Petty crime is rare; etiquette matters more here.'],
        ['med', 'Respect temple & geisha etiquette', 'Quiet voices, no flash, follow posted photo rules.'],
        ['low', 'Cash & timing', 'Carry cash; major temples close by 5pm.']
      ],
      packExtra: ['Slip-on shoes (you\'ll remove them often)', 'Comfortable layers', 'A small gift if visiting a home/teahouse']
    },
    'mexico city': {
      aka: ['mexico city', 'cdmx', 'mexico', 'ciudad de mexico'], vibe: 'a vast, vibrant capital of ancient ruins, world-class food, murals and leafy plazas',
      currency: 'MXN ($)', climateNote: 'Mild highland climate; afternoon rain May–Oct. It sits at 2,240m — pace yourself day one.',
      pois: [
        ['Zócalo & Templo Mayor', 'The grand central square over Aztec ruins.', 'sight', 'm', '$', 'Climb a nearby rooftop café for the plaza view.'],
        ['Frida Kahlo Museum (Casa Azul)', 'The artist\'s cobalt-blue home in Coyoacán.', 'museum', 'm', '$$', 'Buy timed tickets online — it sells out daily.'],
        ['Teotihuacán pyramids', 'Climb the avenue of a vanished civilization.', 'daytrip', 'm', '$', 'Go early; bring a hat, water and good shoes.'],
        ['Chapultepec & Anthropology Museum', 'A huge park and the country\'s top museum.', 'museum', 'a', '$', 'The museum alone deserves a half-day.'],
        ['Roma & Condesa', 'Tree-lined, art-deco neighborhoods of cafés.', 'local', 'a', '$', 'Perfect for a slow walk and taco-hopping.'],
        ['Coyoacán market & plaza', 'Colorful crafts, food stalls and street life.', 'market', 'a', '$', 'Try a tostada and a fresh agua fresca.'],
        ['Xochimilco trajineras', 'Float on colorful boats through ancient canals.', 'relax', 'a', '$$', 'Best with a group, music and snacks aboard.'],
        ['Palacio de Bellas Artes', 'An art-nouveau gem with Rivera murals.', 'landmark', 'm', '$', 'See it from the Sears café terrace opposite.'],
        ['Lucha libre night', 'Masked wrestling — pure, joyful spectacle.', 'nightlife', 'e', '$', 'Arena México on certain nights; buy from official sellers.'],
        ['Mezcal & taco crawl in Roma', 'Sip artisanal mezcal between taquerías.', 'food', 'e', '$', 'Al pastor tacos are the late-night essential.']
      ],
      areas: [
        ['Roma / Condesa', 'Leafy, hip, walkable and full of food.', 'Most travelers'],
        ['Polanco', 'Upscale, safe, fine dining & museums.', 'Comfort & luxury'],
        ['Centro Histórico', 'In the heart of the icons; lively by day.', 'Sightseeing'],
        ['Coyoacán', 'Bohemian, calm, villagey feel.', 'Culture & charm']
      ],
      foods: ['Tacos al pastor', 'Tamales & chilaquiles', 'Mole', 'Elote & esquites', 'Churros & hot chocolate'],
      foodSpots: ['Street taquerías (busy = good)', 'Mercados like Roma\'s', 'Mezcalerías in Roma Norte'],
      safety: [
        ['med', 'Use registered taxis / apps', 'Avoid hailing on the street; use Uber/Didi or sitio cabs.'],
        ['med', 'Watch belongings in crowds', 'Metro and markets can attract pickpockets.'],
        ['low', 'Altitude & stomach', 'Go easy on day one; eat where it\'s busy and drink bottled water.']
      ],
      packExtra: ['A light rain layer for afternoons', 'Sunscreen (strong highland sun)', 'A day pack with a secure zip']
    }
  };

  /* ---------- generic archetypes for unknown destinations ---------- */
  const ARCH = {
    beach: {
      vibe: 'a sun-and-sea escape built around beaches, water and easy days',
      pois: [
        ['Main beach morning', 'Claim a good spot early for swimming and sun.', 'beach', 'm', 'free', 'Mornings are calmer and cooler.'],
        ['Coastal walk & viewpoint', 'Stroll the shoreline to a scenic lookout.', 'view', 'm', 'free', 'Golden hour is best for photos.'],
        ['Snorkel or boat trip', 'Get out on the water to nearby coves or reefs.', 'adventure', 'm', '$$', 'Book reputable operators with good reviews.'],
        ['Seaside seafood lunch', 'Fresh local catch by the water.', 'food', 'a', '$$', 'Confirm prices, especially when sold by weight.'],
        ['Old town / market wander', 'Explore the local center and shops.', 'market', 'a', '$', 'Good for souvenirs and people-watching.'],
        ['Sunset drinks', 'A beach bar or rooftop for the sunset.', 'nightlife', 'e', '$$', 'Arrive 30 min before sundown for a good seat.'],
        ['Spa or relaxed evening', 'Wind down with a massage or quiet dinner.', 'relax', 'e', '$$', 'Tired from the sun? Keep the evening gentle.'],
        ['Water sports session', 'Try paddleboarding, kayaking or surfing.', 'adventure', 'a', '$$', 'Beginner lessons are widely available.'],
        ['Hidden cove day trip', 'Find a quieter beach away from the crowds.', 'daytrip', 'm', '$', 'Pack water, snacks and shade.']
      ]
    },
    mountain: {
      vibe: 'a highland getaway of trails, fresh air and big views',
      pois: [
        ['Signature day hike', 'Take the area\'s classic trail to a viewpoint.', 'nature', 'm', '$', 'Start early; check weather and trail status.'],
        ['Cable car / summit view', 'Ride up for panoramas without the full climb.', 'view', 'a', '$$', 'Layer up — it\'s colder at altitude.'],
        ['Mountain village stroll', 'Explore the local center and crafts.', 'sight', 'a', 'free', 'Great for a relaxed afternoon and lunch.'],
        ['Local hearty lunch', 'Warm regional dishes after a morning out.', 'food', 'a', '$$', 'Mountain food is rich and satisfying.'],
        ['Lake or waterfall visit', 'A scenic natural spot for photos and a picnic.', 'nature', 'm', '$', 'Bring a picnic and good shoes.'],
        ['Adventure activity', 'Try biking, rafting, climbing or a via ferrata.', 'adventure', 'a', '$$', 'Use certified guides for technical activities.'],
        ['Cosy evening', 'Fireside dinner and a relaxed night in.', 'relax', 'e', '$$', 'Evenings cool quickly — bring a warm layer.'],
        ['Scenic drive / pass', 'A loop drive past the best viewpoints.', 'daytrip', 'm', '$', 'Pull over often for the views.'],
        ['Stargazing', 'Clear mountain skies make for great stargazing.', 'view', 'e', 'free', 'Get away from village lights.']
      ]
    },
    city: {
      vibe: 'a vibrant destination with landmarks, culture, markets and a lively food scene',
      pois: [
        ['Old town & landmarks', 'Walk the historic core and main sights.', 'sight', 'm', 'free', 'A walking tour is a great orientation on day one.'],
        ['Top museum or gallery', 'Dive into the area\'s art or history.', 'museum', 'a', '$$', 'Check for free-entry days or evening hours.'],
        ['Central market', 'Local produce, snacks and crafts.', 'market', 'm', '$', 'A cheap, delicious way to eat like a local.'],
        ['Best viewpoint', 'A tower, hill or rooftop for the panorama.', 'view', 'e', '$', 'Go for sunset to get day and night.'],
        ['Local neighborhood', 'Explore a characterful district away from the crowds.', 'local', 'a', '$', 'Where the residents eat and hang out.'],
        ['Signature landmark', 'The must-see icon of the destination.', 'landmark', 'm', '$$', 'Book ahead to skip the longest lines.'],
        ['Food tour or crawl', 'Taste your way through regional specialties.', 'food', 'e', '$$', 'Come hungry; share dishes to try more.'],
        ['Park or green space', 'A relaxed break in nature within the city.', 'nature', 'a', 'free', 'Pack a picnic on a nice day.'],
        ['Evening out', 'Live music, a show or a lively bar district.', 'nightlife', 'e', '$$', 'Ask a local for the spot they actually go to.'],
        ['Day trip nearby', 'A worthwhile half/full-day escape close by.', 'daytrip', 'm', '$$', 'Trains and group tours make it easy.']
      ]
    }
  };
  const GENERIC = {
    areas: [
      ['City center / old town', 'Most walkable and close to the main sights.', 'First-timers'],
      ['A trendy local district', 'Better food, value and local atmosphere.', 'Offbeat & dining'],
      ['Near the main station/hub', 'Easiest for transport and day trips.', 'Convenience'],
      ['A quieter residential area', 'Calmer and often better value.', 'Calm & budget']
    ],
    foods: ['Regional signature dish', 'Street-food specialties', 'A famous local market snack', 'Seasonal local produce', 'A traditional dessert'],
    foodSpots: ['Busy local eateries (crowds = quality)', 'The central market', 'A recommended neighborhood restaurant'],
    safety: [
      ['low', 'Stay aware in crowds', 'Keep valuables secure and split your cash and cards.'],
      ['med', 'Use trusted transport', 'Prefer official taxis or ride apps, especially at night.'],
      ['low', 'Check local advisories', 'Read up on any current health or safety notices before you go.']
    ],
    packExtra: ['A reusable water bottle', 'A small daypack with a secure zip', 'Copies of key documents (digital + paper)']
  };

  /* ---------- destination resolver ---------- */
  function resolveDest(raw) {
    const q = raw.trim().toLowerCase();
    for (const key in DESTS) {
      if (DESTS[key].aka.some(a => q.includes(a))) return { key, data: DESTS[key], named: true };
    }
    // archetype detection
    let arch = 'city';
    const beachWords = ['beach', 'island', 'coast', 'maldives', 'hawaii', 'caribbean', 'cancun', 'phuket', 'goa', 'santorini', 'mykonos', 'riviera', 'cabo', 'maui', 'tropical', 'bahamas', 'fiji', 'seychelles'];
    const mtnWords = ['mountain', 'alps', 'himalaya', 'andes', 'ski', 'aspen', 'banff', 'patagonia', 'dolomites', 'rockies', 'tahoe', 'chamonix', 'queenstown', 'nepal', 'trek', 'national park'];
    if (beachWords.some(w => q.includes(w))) arch = 'beach';
    else if (mtnWords.some(w => q.includes(w))) arch = 'mountain';
    const a = ARCH[arch];
    return { key: arch, data: { vibe: a.vibe, pois: a.pois, areas: GENERIC.areas, foods: GENERIC.foods, foodSpots: GENERIC.foodSpots, safety: GENERIC.safety, packExtra: GENERIC.packExtra, currency: 'local currency', climateNote: '' }, named: false, arch };
  }

  /* ---------- itinerary builder ---------- */
  const DAY_THEMES = [
    { name: 'Iconic highlights', want: ['landmark', 'sight', 'view'] },
    { name: 'Culture & museums', want: ['museum', 'sight', 'art'] },
    { name: 'Local life & markets', want: ['market', 'local', 'food'] },
    { name: 'Nature & views', want: ['nature', 'view', 'relax'] },
    { name: 'Day trip & beyond', want: ['daytrip', 'adventure', 'nature'] },
    { name: 'Neighborhoods & hidden gems', want: ['local', 'shop', 'sight'] },
    { name: 'Relax & easy pace', want: ['relax', 'beach', 'food'] }
  ];
  const STYLE_THEME_BIAS = {
    relaxed: ['relax', 'nature', 'food', 'view'], adventure: ['adventure', 'nature', 'daytrip', 'view'],
    culture: ['museum', 'sight', 'landmark', 'local'], foodie: ['food', 'market', 'local', 'nightlife'],
    nightlife: ['nightlife', 'local', 'food', 'view'], luxury: ['relax', 'view', 'food', 'shop'],
    family: ['nature', 'sight', 'view', 'relax'], balanced: []
  };

  function buildItinerary(P) {
    const { data } = P.resolved;
    const pois = data.pois.slice();
    const used = new Set();
    const days = [];
    const bias = STYLE_THEME_BIAS[P.style] || [];
    const interestTags = new Set(P.interests.flatMap(mapInterestToTags));

    function score(poi, wantTags) {
      const tag = poi[2];
      let s = 0;
      if (wantTags.includes(tag)) s += 5;
      if (bias.includes(tag)) s += 3;
      if (interestTags.has(tag)) s += 4;
      if (P.group === 'family' && tag === 'nightlife') s -= 6;
      if (P.group === 'family' && (tag === 'nature' || tag === 'sight')) s += 1;
      if (P.style === 'relaxed' && tag === 'daytrip') s -= 2;
      return s + Math.random() * 1.5;
    }
    function take(wantTags, tod, n) {
      const cands = pois.filter(p => !used.has(p[0]))
        .filter(p => !tod || p[3] === tod || p[3] === 'any')
        .sort((a, b) => score(b, wantTags) - score(a, wantTags));
      const out = [];
      for (const c of cands) { if (out.length >= n) break; used.add(c[0]); out.push(c); }
      return out;
    }

    for (let d = 0; d < P.nDays; d++) {
      const date = new Date(P.startDate); date.setDate(date.getDate() + d);
      // choose theme
      let theme;
      if (d === 0) theme = DAY_THEMES[0];
      else if (d === P.nDays - 1 && P.nDays > 2) theme = P.style === 'relaxed' ? DAY_THEMES[6] : DAY_THEMES[5];
      else theme = pick(DAY_THEMES, d);
      // day-trip only mid-trip and not for very relaxed short trips
      const wantTags = theme.want;

      const blocks = [];
      const morning = take(wantTags, 'm', 1)[0] || take(wantTags, null, 1)[0];
      const midday = take(['market', 'food', 'local'], null, 1)[0];
      const afternoon = take(wantTags.concat(['sight', 'museum', 'shop']), 'a', 1)[0] || take(wantTags, null, 1)[0];
      const extra = take(['view', 'local', 'relax', 'nature'], null, 1)[0];
      const evening = take(['nightlife', 'food', 'view', 'relax'], 'e', 1)[0] || take(['food', 'view'], null, 1)[0];

      if (morning) blocks.push(block('9:00 AM', 'Morning', I.sun, morning));
      blocks.push(lunchBlock(midday, P));
      if (afternoon) blocks.push(block('2:30 PM', 'Afternoon', I.walk, afternoon));
      if (extra && P.style !== 'relaxed') blocks.push(block('4:30 PM', 'Late afternoon', I.camera, extra));
      blocks.push(dinnerBlock(evening, P, d));
      if (P.style === 'nightlife' && evening && evening[2] !== 'nightlife') {
        const nightX = take(['nightlife'], null, 1)[0];
        if (nightX) blocks.push(block('10:00 PM', 'Night', I.moon, nightX));
      }

      const dayCost = estimateDayCost(P, blocks);
      days.push({ n: d + 1, date, theme: theme.name, blocks, cost: dayCost });
    }
    return days;
  }

  function block(time, label, icon, poi) {
    return { time, label, icon, title: poi[0], desc: poi[1], tag: poi[2], cost: poi[4], tip: poi[5] };
  }
  function lunchBlock(poi, P) {
    if (poi) return { time: '12:30 PM', label: 'Lunch', icon: I.coffee, title: poi[0], desc: poi[1], tag: poi[2], cost: poi[4] || '$', tip: poi[5] };
    return { time: '12:30 PM', label: 'Lunch', icon: I.coffee, title: 'Local lunch break', desc: 'Refuel at a busy local spot near your morning stop — markets and side streets beat the tourist strip.', tag: 'food', cost: '$', tip: 'Where the locals queue is where to eat.' };
  }
  function dinnerBlock(poi, P, d) {
    if (poi) return { time: '7:30 PM', label: 'Dinner & evening', icon: I.moon, title: poi[0], desc: poi[1], tag: poi[2], cost: poi[4] || '$$', tip: poi[5] };
    return { time: '7:30 PM', label: 'Dinner & evening', icon: I.moon, title: 'Dinner in a lively district', desc: 'Pick a neighborhood known for food and settle in for the evening.', tag: 'food', cost: '$$', tip: 'Reserve ahead on weekends.' };
  }

  const COST_BAND = { 'free': 0, '$': 12, '$$': 35, '$$$': 90 };
  function estimateDayCost(P, blocks) {
    const tier = TIERS[P.budget];
    let activities = blocks.reduce((s, b) => s + (COST_BAND[b.cost] || 0), 0);
    activities *= (tier.base / 130) * 0.9 + 0.3; // scale activity spend to tier
    const food = tier.base * (tier.food) * (P.style === 'foodie' ? 1.25 : 1);
    return Math.round((activities + food) * 0.7 + tier.base * 0.25);
  }

  function mapInterestToTags(i) {
    return ({
      history: ['landmark', 'sight'], art: ['museum'], food: ['food', 'market'],
      nature: ['nature', 'view'], beach: ['beach', 'relax'], nightlife: ['nightlife'],
      shopping: ['shop', 'market'], adventure: ['adventure', 'daytrip'], photography: ['view', 'sight'],
      wellness: ['relax'], architecture: ['landmark', 'sight'], local: ['local', 'market']
    })[i] || [];
  }

  /* ---------- budget ---------- */
  function computeBudget(P) {
    const tier = TIERS[P.budget];
    const tilt = STYLE_TILT[P.style] || {};
    const cats = { acc: tier.acc, food: tier.food, act: tier.act, trn: tier.trn, misc: tier.misc };
    for (const k in tilt) cats[k] = Math.max(0.02, (cats[k] || 0) + tilt[k]);
    // normalize
    const sum = Object.values(cats).reduce((a, b) => a + b, 0);
    for (const k in cats) cats[k] /= sum;

    const nDays = P.nDays;
    const people = P.people;
    const perPersonDay = tier.base;

    // accommodation sharing discount
    const share = { solo: 1, couple: 0.62, friends: 0.55, family: 0.5 }[P.groupKey] || 1;
    const accPerPersonDay = perPersonDay * cats.acc * (P.groupKey === 'solo' ? 1 : share / 1 * 1.0);
    // simpler: accommodation cost is per-room; approximate per-person by sharing
    const lines = [
      ['Accommodation', perPersonDay * cats.acc * (P.groupKey === 'solo' ? 1 : share) , tier.hotel, '#EA580C'],
      ['Food & drink', perPersonDay * cats.food * (P.style === 'foodie' ? 1.18 : 1), 'Mix of local & sit-down meals', '#0891B2'],
      ['Activities & entries', perPersonDay * cats.act, 'Sights, tours & experiences', '#D97706'],
      ['Local transport', perPersonDay * cats.trn, 'Metro, taxis & day-trip travel', '#16A34A'],
      ['Misc & shopping', perPersonDay * cats.misc, 'Souvenirs, tips & extras', '#7C3AED']
    ];
    const perPersonTotalDay = lines.reduce((s, l) => s + l[1], 0);
    const perPersonTrip = perPersonTotalDay * nDays;
    const groupTrip = perPersonTrip * people;
    return { lines, perPersonTotalDay, perPersonTrip, groupTrip, nDays, people, tier };
  }

  /* ---------- packing ---------- */
  function buildPacking(P) {
    const data = P.resolved.data;
    const cats = [];
    cats.push(['Essentials', I.bag, [
      'Passport / ID + visa if needed', 'Cards + some local cash', 'Phone, charger & power bank',
      'Universal travel adapter', 'Reusable water bottle', P.people > 1 ? 'Shared first-aid kit' : 'Mini first-aid kit'
    ]]);
    cats.push(['Clothing', I.shirt, clothingFor(P)]);
    cats.push(['Health & toiletries', I.health, [
      'Any personal medication (in original packaging)', 'Sunscreen SPF 30+', 'Hand sanitizer & wipes',
      'Toothbrush & travel toiletries', P.style === 'adventure' ? 'Blister plasters & pain relief' : 'Basic pain relief'
    ]]);
    cats.push(['Smart extras', I.star, (data.packExtra || GENERIC.packExtra).concat([
      'Offline maps & key bookings saved', P.group === 'family' ? 'Kids\' snacks & entertainment' : 'Headphones & a book/e-reader'
    ])]);
    return cats;
  }
  function clothingFor(P) {
    const base = ['Comfortable walking shoes', 'Underwear & socks for the trip', 'Sleepwear'];
    const s = P.style, arch = P.resolved.arch;
    const list = base.slice();
    if (arch === 'beach' || P.interests.includes('beach')) list.push('Swimwear ×2', 'Sandals / flip-flops', 'Cover-up & sun hat');
    if (arch === 'mountain' || s === 'adventure') list.push('Warm layers & a fleece', 'Waterproof jacket', 'Quick-dry trousers');
    if (s === 'nightlife' || s === 'luxury') list.push('A smart outfit for nights out');
    if (P.group === 'family') list.push('Spare clothes for kids (they\'ll need them)');
    list.push('A light layer for cool evenings / strong A/C', 'A versatile jacket or scarf');
    return list;
  }

  /* ============================================================
     RENDERING
     ============================================================ */
  const out = $('#out');

  function render(P) {
    const days = buildItinerary(P);
    const budget = computeBudget(P);
    const packing = buildPacking(P);
    const data = P.resolved.data;

    out.innerHTML = '';
    out.appendChild(resultHero(P, budget));

    // 1. itinerary
    out.appendChild(sectionHead('Daily itinerary', I.calendar, `${P.nDays} day${P.nDays > 1 ? 's' : ''} mapped morning to night`));
    const dayWrap = el('div', 'days');
    days.forEach(dy => dayWrap.appendChild(dayCard(dy)));
    out.appendChild(dayWrap);

    // 2. budget
    out.appendChild(sectionHead('Estimated budget', I.wallet, `Approximate ${budget.tier.label} costs — excludes international flights`));
    out.appendChild(budgetBlock(budget, P));

    // 3. stay
    out.appendChild(sectionHead('Best areas to stay', I.bed, 'Neighborhoods matched to how you travel'));
    out.appendChild(infoGrid(data.areas.map(a => ({
      badge: a[2], title: a[0], body: a[1]
    }))));

    // 4. food
    out.appendChild(sectionHead('Food recommendations', I.food, 'What to eat and where to find it'));
    out.appendChild(foodBlock(data, P));

    // 5. safety
    out.appendChild(sectionHead('Safety tips', I.shield, 'Stay smart and travel with confidence'));
    out.appendChild(safetyBlock(data, P));

    // 6. packing
    out.appendChild(sectionHead('Packing list', I.bag, 'Tap items to check them off as you pack'));
    out.appendChild(packingBlock(packing));

    wireResults();
    requestAnimationFrame(() => {
      $$('.bar-fill', out).forEach(b => b.style.width = b.dataset.w + '%');
      $$('.reveal', out).forEach((r, i) => setTimeout(() => r.classList.add('in'), 40 * i));
    });
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resultHero(P, budget) {
    const d = el('div', 'result-hero reveal');
    const dateStr = `${fmtDate(P.startDate)} – ${fmtDate(P.endDate)}`;
    const styleLabel = $('#style option[value="' + P.style + '"]').textContent;
    const groupLabel = $('#group option[value="' + P.groupKey + '"]').textContent;
    const tag = (ic, t) => `<span class="rh-tag">${svg(ic)}${t}</span>`;
    d.innerHTML = `<div class="rh-in">
      <div class="rh-eyebrow">Your TripMind plan</div>
      <h2 class="rh-title serif">${esc(P.destLabel)}</h2>
      <div class="rh-meta">
        ${tag(I.calendar, dateStr + ' · ' + P.nDays + ' days')}
        ${tag(I.heart, styleLabel)}
        ${tag(I.bed, groupLabel + ' · ' + P.people + ' traveler' + (P.people > 1 ? 's' : ''))}
        ${tag(I.wallet, money(budget.groupTrip) + ' total')}
      </div>
      <p class="rh-summary">A ${P.nDays}-day ${styleLabel.toLowerCase()} trip to <b>${esc(P.destLabel)}</b> — ${P.resolved.data.vibe}. ${P.notes ? 'We\'ve kept your note in mind: <em>"' + esc(P.notes) + '"</em>. ' : ''}Below is a day-by-day plan, a costed budget, where to stay, what to eat, safety tips and a packing checklist.</p>
      <div class="rh-actions">
        <button class="rh-btn" id="printBtn">${svg('M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v6H8z')}Save / Print PDF</button>
        <button class="rh-btn ghost" id="copyBtn">${svg('M9 9h11v11H9zM5 15H4V4h11v1')}Copy plan</button>
        <button class="rh-btn ghost" id="redoBtn">${svg('M4 4v6h6M20 20v-6h-6M20 9a8 8 0 00-15-2M4 15a8 8 0 0015 2')}Edit details</button>
      </div>
    </div>`;
    return d;
  }

  function sectionHead(title, icon, sub) {
    const s = el('div', 'section reveal');
    s.innerHTML = `<div class="sec-head"><span class="sec-ic">${svg(icon)}</span><div><h3 class="serif">${title}</h3><p>${sub}</p></div></div>`;
    return s;
  }

  function dayCard(dy) {
    const c = el('div', 'day reveal' + (dy.n === 1 ? ' open' : ''));
    const tl = dy.blocks.map(b => `
      <div class="tl-item">
        <div class="tl-time">${b.time}<small>${b.label}</small></div>
        <div class="tl-dot"></div>
        <div class="tl-c">
          <b>${esc(b.title)}</b>
          <p>${esc(b.desc)}</p>
          ${b.tip ? `<div class="tip">${svg(I.info, 2.2)}${esc(b.tip)}</div>` : ''}
        </div>
      </div>`).join('');
    c.innerHTML = `
      <div class="day-top">
        <div class="day-num"><small>DAY</small><b>${dy.n}</b></div>
        <div class="day-meta">
          <h4>${esc(dy.theme)}</h4>
          <span class="date">${fmtDate(dy.date)}</span>
        </div>
        <span class="day-cost">~${money(dy.cost)}/person</span>
        <span class="day-caret">${svg('M6 9l6 6 6-6')}</span>
      </div>
      <div class="day-body"><div><div class="timeline">${tl}</div></div></div>`;
    return c;
  }

  function budgetBlock(b, P) {
    const w = el('div', 'budget-wrap reveal');
    const max = Math.max(...b.lines.map(l => l[1]));
    const bars = b.lines.map(l => {
      const pct = Math.round((l[1] / max) * 100);
      return `<div class="bar-row">
        <div class="bar-top"><b>${l[0]}</b><span>${money(l[1] * b.nDays)} <small style="color:var(--fg3);font-weight:400">/person</small></span></div>
        <div class="bar-track"><div class="bar-fill" data-w="${pct}" style="background:${l[3]}"></div></div>
        <div style="font-size:.76rem;color:var(--fg3);margin-top:3px">${l[2]}</div>
      </div>`;
    }).join('');
    w.innerHTML = `
      <div class="budget-total">
        <span class="bt-lbl">Estimated total · ${b.people} traveler${b.people > 1 ? 's' : ''}</span>
        <span class="bt-num">${money(b.groupTrip)}</span>
        <span class="bt-sub">${b.tier.label} style · ${b.nDays} days · ${money(b.perPersonTrip)} per person</span>
        <div class="bt-per"><span>Per person / day</span><b>${money(b.perPersonTotalDay)}</b></div>
        <div class="bt-per"><span>Whole group / day</span><b>${money(b.perPersonTotalDay * b.people)}</b></div>
      </div>
      <div class="budget-bars">
        ${bars}
        <div class="disclaimer">${svg(I.info, 2)}<span>Figures are realistic estimates in USD and exclude international flights and travel insurance. Actual prices vary by season, availability and exchange rates.</span></div>
      </div>`;
    return w;
  }

  function infoGrid(items) {
    const g = el('div', 'info-grid reveal');
    g.innerHTML = items.map(it => `
      <div class="info-card">
        <div class="ic-h">${it.badge ? `<span class="badge">${esc(it.badge)}</span>` : ''}<h4>${esc(it.title)}</h4></div>
        <p>${esc(it.body)}</p>
        ${it.list ? '<ul>' + it.list.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : ''}
      </div>`).join('');
    return g;
  }

  function foodBlock(data, P) {
    const wrap = el('div', 'info-grid reveal');
    const dishes = `<div class="info-card">
      <div class="ic-h"><span class="badge">Must-try</span><h4>Dishes to seek out</h4></div>
      <ul>${data.foods.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
    const where = `<div class="info-card">
      <div class="ic-h"><span class="badge">Where</span><h4>Where to eat well</h4></div>
      <ul>${data.foodSpots.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>`;
    let tips = ['Eat where it\'s busy — turnover means fresh food.', 'Lunch menus are often cheaper than the same dishes at dinner.'];
    if (P.notes && /veg|vegan|halal|kosher|gluten|allerg/i.test(P.notes)) tips.unshift('Note your dietary needs (' + esc(P.notes) + ') — translate them on a card to show staff.');
    if (P.budget === 'budget') tips.push('Markets and street food give the best value and flavor.');
    if (P.style === 'foodie' || P.budget === 'luxury' || P.budget === 'ultra') tips.push('Book standout restaurants well ahead — the best tables go fast.');
    const tipsCard = `<div class="info-card">
      <div class="ic-h"><span class="badge">Tips</span><h4>Eating smart</h4></div>
      <ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul></div>`;
    wrap.innerHTML = dishes + where + tipsCard;
    return wrap;
  }

  function safetyBlock(data, P) {
    const wrap = el('div', 'safe-list reveal');
    const sev = { low: I.check, med: I.info, high: I.shield };
    let items = data.safety.slice();
    // universal additions
    items.push(['low', 'Share your plans', 'Send your itinerary to someone at home and check in regularly.']);
    if (P.group === 'solo') items.push(['med', 'Solo-travel basics', 'Trust your instincts, keep someone updated, and avoid arriving somewhere new late at night.']);
    if (P.group === 'family') items.push(['med', 'Keep kids close', 'Agree a meeting point, and write your number on the child or a wristband.']);
    items.push(['low', 'Insurance & copies', 'Get travel insurance and keep digital + paper copies of key documents.']);
    wrap.innerHTML = items.map(s => `
      <div class="safe-item ${s[0]}">
        <span class="si-ic">${svg(sev[s[0]] || I.info)}</span>
        <div><h4>${esc(s[1])}</h4><p>${esc(s[2])}</p></div>
      </div>`).join('');
    return wrap;
  }

  function packingBlock(cats) {
    const g = el('div', 'pack-grid reveal');
    g.innerHTML = cats.map(c => `
      <div class="pack-cat">
        <h4>${svg(c[1])}${esc(c[0])}</h4>
        ${c[2].map(item => `<div class="pack-item"><span class="box">${svg(I.check, 3)}</span><span>${esc(item)}</span></div>`).join('')}
      </div>`).join('');
    return g;
  }

  /* ---------- result interactions ---------- */
  function wireResults() {
    $$('.day-top', out).forEach(t => t.addEventListener('click', () => t.parentElement.classList.toggle('open')));
    $$('.pack-item', out).forEach(p => p.addEventListener('click', () => p.classList.toggle('checked')));
    const pb = $('#printBtn'); if (pb) pb.addEventListener('click', () => window.print());
    const rb = $('#redoBtn'); if (rb) rb.addEventListener('click', () => $('#plan').scrollIntoView({ behavior: 'smooth' }));
    const cb = $('#copyBtn'); if (cb) cb.addEventListener('click', copyPlan);
  }

  function copyPlan() {
    const txt = out.innerText.replace(/\n{3,}/g, '\n\n');
    navigator.clipboard?.writeText(txt).then(() => toast('Plan copied to clipboard')).catch(() => toast('Press Ctrl/Cmd+C to copy'));
  }

  /* ============================================================
     FORM WIRING
     ============================================================ */
  function buildInterestChips() {
    const wrap = $('#interestChips');
    wrap.innerHTML = INTERESTS.map(([v, label, ic]) =>
      `<button type="button" class="chip" data-val="${v}">${svg(ic, 2.2)}${label}</button>`).join('');
    $$('.chip', wrap).forEach(c => c.addEventListener('click', () => c.classList.toggle('on')));
  }
  function buildDatalist() {
    const dl = $('#destSuggest');
    const names = ['Tokyo, Japan', 'Kyoto, Japan', 'Paris, France', 'Rome, Italy', 'Barcelona, Spain',
      'New York, USA', 'London, UK', 'Bangkok, Thailand', 'Bali, Indonesia', 'Lisbon, Portugal',
      'Dubai, UAE', 'Reykjavik, Iceland', 'Mexico City, Mexico'];
    dl.innerHTML = names.map(n => `<option value="${n}">`).join('');
  }
  function buildFeatures() {
    const feats = [
      [I.calendar, 'Sequenced days', 'Not just a list — a logical flow from morning highlights to evening eats, paced to your style.'],
      [I.wallet, 'Honest budgets', 'Realistic, costed estimates broken down by category, scaled to your tier and group size.'],
      [I.bed, 'Where to stay', 'Neighborhood picks matched to whether you want nightlife, calm, charm or convenience.'],
      [I.food, 'Eat like a local', 'The dishes to seek and the kinds of places locals actually go.'],
      [I.shield, 'Travel smart', 'Destination-specific safety tips, prioritized by what actually matters there.'],
      [I.bag, 'Pack right', 'A checklist tuned to your destination, season-sense, style and group.']
    ];
    $('#featGrid').innerHTML = feats.map(f =>
      `<div class="feat"><div class="f-ic">${svg(f[0])}</div><h4>${f[1]}</h4><p>${f[2]}</p></div>`).join('');
  }

  // segmented budget
  let budgetVal = 'moderate';
  function wireBudgetSeg() {
    $$('#budgetSeg .opt').forEach(o => {
      const set = () => { $$('#budgetSeg .opt').forEach(x => x.classList.remove('on')); o.classList.add('on'); budgetVal = o.dataset.val; };
      o.addEventListener('click', set);
      o.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(); } });
    });
  }

  function gather() {
    const destEl = $('#dest'), startEl = $('#start'), endEl = $('#end');
    let ok = true;
    const setErr = (id, bad) => { $('#' + id).closest('.field').classList.toggle('invalid', bad); if (bad) ok = false; };
    const dest = destEl.value.trim();
    setErr('dest', !dest);
    const sd = startEl.value ? new Date(startEl.value + 'T00:00') : null;
    const ed = endEl.value ? new Date(endEl.value + 'T00:00') : null;
    setErr('start', !sd);
    setErr('end', !ed || (sd && ed < sd));
    if (!ok) return null;

    let nDays = Math.round((ed - sd) / 86400000) + 1;
    if (nDays < 1) nDays = 1;
    if (nDays > 21) nDays = 21; // cap for sanity
    const interests = $$('#interestChips .chip.on').map(c => c.dataset.val);
    const groupKey = $('#group').value;
    const people = { solo: 1, couple: 2, friends: 4, family: 4 }[groupKey] || 1;
    const resolved = resolveDest(dest);

    return {
      destLabel: dest, resolved,
      startDate: sd, endDate: ed, nDays,
      budget: budgetVal, style: $('#style').value,
      groupKey, group: groupKey === 'family' ? 'family' : groupKey, people,
      interests, notes: $('#notes').value.trim()
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    const P = gather();
    if (!P) { toast('Please complete the highlighted fields'); return; }
    const btn = $('#buildBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Crafting your itinerary…';
    setTimeout(() => {
      render(P);
      btn.disabled = false;
      btn.innerHTML = svg(I.star) + ' Rebuild itinerary';
    }, 650);
  }

  /* ---------- demo ---------- */
  function loadDemo() {
    $('#dest').value = 'Tokyo, Japan';
    const t = new Date(); t.setDate(t.getDate() + 30);
    const e = new Date(t); e.setDate(e.getDate() + 4);
    $('#start').value = t.toISOString().slice(0, 10);
    $('#end').value = e.toISOString().slice(0, 10);
    $('#style').value = 'foodie';
    $('#group').value = 'couple';
    $$('#budgetSeg .opt').forEach(x => x.classList.toggle('on', x.dataset.val === 'moderate'));
    budgetVal = 'moderate';
    $$('#interestChips .chip').forEach(c => c.classList.toggle('on', ['food', 'history', 'local', 'photography'].includes(c.dataset.val)));
    $('#planner').dispatchEvent(new Event('submit'));
  }

  /* ---------- theme ---------- */
  function initTheme() {
    const saved = localStorage.getItem('tm-theme');
    const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(dark);
    $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') !== 'dark'));
  }
  function setTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('tm-theme', dark ? 'dark' : 'light');
    $('#themeIcon').innerHTML = dark
      ? '<path d="M21 12.8A8.5 8.5 0 1111.2 3a6.5 6.5 0 009.8 9.8z"/>'
      : '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>';
  }

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg) {
    $('#toastMsg').textContent = msg;
    const t = $('#toast'); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- reveal on scroll for landing ---------- */
  function revealObserver() {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
    $$('#feats .feat').forEach(f => { f.classList.add('reveal'); io.observe(f); });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------- init ---------- */
  function init() {
    // default dates: 30 days out, 5-day trip
    const t = new Date(); t.setDate(t.getDate() + 30);
    const e = new Date(t); e.setDate(e.getDate() + 4);
    $('#start').value = t.toISOString().slice(0, 10);
    $('#end').value = e.toISOString().slice(0, 10);
    $('#start').min = new Date().toISOString().slice(0, 10);

    buildInterestChips();
    buildDatalist();
    buildFeatures();
    wireBudgetSeg();
    initTheme();
    revealObserver();
    $('#planner').addEventListener('submit', onSubmit);
    $('#demoBtn').addEventListener('click', loadDemo);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
