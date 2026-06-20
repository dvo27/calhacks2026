import type { Stop, Candidate, Post } from './types';

export const EXAMPLE_STOPS: Stop[] = [
  { id: 's1', name: 'Verve Coffee', address: '833 S Spring St', cat: 'food', price: 8, dur: 30 },
  { id: 's2', name: 'The Grove', address: '189 The Grove Dr', cat: 'shopping', price: 0, dur: 60 },
  { id: 's3', name: 'LACMA', address: '5905 Wilshire Blvd', cat: 'attractions', price: 18, dur: 90 },
  { id: 's4', name: 'Night + Market', address: '9043 Sunset Blvd', cat: 'food', price: 28, dur: 60 },
  { id: 's5', name: 'The Abbey', address: '692 N Robertson Blvd', cat: 'nightlife', price: 20, dur: 75 },
  { id: 's6', name: 'Griffith Observatory', address: '2800 E Observatory Rd', cat: 'attractions', price: 0, dur: 60 },
];

// SVG route point sets for RouteMap — [x, y] in SVG viewport coords
export const MINI_ROUTES: Record<string, [number, number][]> = {
  plan: [[30,120],[70,90],[110,60],[150,75],[190,50],[230,70]],
  silverlake: [[40,100],[100,70],[160,90],[220,60]],
  museum: [[50,110],[130,70],[210,90]],
  beach: [[20,130],[80,100],[140,70],[200,50],[260,80]],
};

export const CANDIDATES: Record<string, Candidate[]> = {
  coffee: [
    { id: 'c1', name: 'Verve Coffee', address: '833 S Spring St', cat: 'food', price: 8, dur: 30, rating: 4.7, reviewCount: 1240, tags: ['specialty', 'pour-over'] },
    { id: 'c2', name: 'Go Get Em Tiger', address: '230 N Larchmont Blvd', cat: 'food', price: 7, dur: 25, rating: 4.6, reviewCount: 890, tags: ['cozy', 'local'] },
    { id: 'c3', name: 'Intelligentsia', address: '3922 Sunset Blvd', cat: 'food', price: 8, dur: 30, rating: 4.5, reviewCount: 2100, tags: ['specialty', 'Silver Lake'] },
  ],
  brunch: [
    { id: 'b1', name: 'Sqirl', address: '720 N Virgil Ave', cat: 'food', price: 22, dur: 60, rating: 4.4, reviewCount: 3400, tags: ['ricotta toast', 'jam'] },
    { id: 'b2', name: 'Pine & Crane', address: '1521 Griffith Park Blvd', cat: 'food', price: 18, dur: 50, rating: 4.6, reviewCount: 1800, tags: ['Taiwanese', 'Silver Lake'] },
  ],
  museum: [
    { id: 'm1', name: 'LACMA', address: '5905 Wilshire Blvd', cat: 'attractions', price: 18, dur: 90, rating: 4.6, reviewCount: 8900, tags: ['art', 'free Fridays'] },
    { id: 'm2', name: 'The Broad', address: '221 S Grand Ave', cat: 'attractions', price: 0, dur: 75, rating: 4.7, reviewCount: 6200, tags: ['contemporary', 'free'] },
    { id: 'm3', name: 'MOCA Grand', address: '250 S Grand Ave', cat: 'attractions', price: 15, dur: 60, rating: 4.4, reviewCount: 3100, tags: ['modern art', 'DTLA'] },
  ],
  shopping: [
    { id: 'sh1', name: 'The Grove', address: '189 The Grove Dr', cat: 'shopping', price: 0, dur: 60, rating: 4.5, reviewCount: 12000, tags: ['outdoor mall', 'farmers market'] },
    { id: 'sh2', name: 'Melrose Trading Post', address: '7850 Melrose Ave', cat: 'shopping', price: 3, dur: 60, rating: 4.3, reviewCount: 2400, tags: ['vintage', 'Sunday flea'] },
  ],
  dinner: [
    { id: 'd1', name: 'Night + Market', address: '9043 Sunset Blvd', cat: 'food', price: 28, dur: 60, rating: 4.6, reviewCount: 4100, tags: ['Thai', 'WeHo'] },
    { id: 'd2', name: 'Hayato', address: '1320 E 7th St', cat: 'food', price: 65, dur: 90, rating: 4.9, reviewCount: 820, tags: ['omakase', 'Arts District'] },
    { id: 'd3', name: 'Rosaliné', address: '8479 Melrose Ave', cat: 'food', price: 38, dur: 75, rating: 4.5, reviewCount: 2300, tags: ['Peruvian', 'WeHo'] },
  ],
  drinks: [
    { id: 'dr1', name: 'The Abbey', address: '692 N Robertson Blvd', cat: 'nightlife', price: 20, dur: 75, rating: 4.4, reviewCount: 6700, tags: ['WeHo', 'patio'] },
    { id: 'dr2', name: 'Good Times at Davey Wayne\'s', address: '1611 N El Centro Ave', cat: 'nightlife', price: 18, dur: 90, rating: 4.3, reviewCount: 3200, tags: ['70s', 'Hollywood'] },
  ],
  park: [
    { id: 'p1', name: 'Griffith Observatory', address: '2800 E Observatory Rd', cat: 'attractions', price: 0, dur: 60, rating: 4.8, reviewCount: 22000, tags: ['views', 'free', 'hike'] },
    { id: 'p2', name: 'Runyon Canyon', address: '2000 N Fuller Ave', cat: 'attractions', price: 0, dur: 75, rating: 4.4, reviewCount: 9800, tags: ['hike', 'views', 'Hollywood Hills'] },
  ],
};

export const SUGGEST_ACTS = [
  'Coffee', 'Brunch', 'Museum', 'Shopping', 'Dinner', 'Drinks', 'Park', 'Beach',
];

export const FEED_POSTS: Post[] = [
  {
    id: 'eli-silverlake',
    author: 'Eli',
    authorInitial: 'E',
    authorColor: 'linear-gradient(135deg,#FF5A36,#6B5CE0)',
    title: 'Silver Lake food crawl',
    mapKey: 'silverlake',
    drive: '38m', budget: '$61', gas: '$4', miles: '21mi',
    tags: ['#foodie', '#silverlake', '#dtla'],
    stops: [
      { name: 'Sqirl', address: '720 N Virgil Ave' },
      { name: 'Intelligentsia', address: '3922 Sunset Blvd' },
      { name: 'Pine & Crane', address: '1521 Griffith Park Blvd' },
      { name: 'Night + Market', address: '9043 Sunset Blvd' },
    ],
    likes: 128, comments: 14, saves: 32,
  },
  {
    id: 'sofia-museum',
    author: 'Sofia',
    authorInitial: 'S',
    authorColor: 'linear-gradient(135deg,#5AC8C0,#2E7DA8)',
    title: 'Rainy museum day',
    mapKey: 'museum',
    drive: '25m', budget: '$42', gas: '$3', miles: '12mi',
    tags: ['#art', '#museum', '#rainy'],
    stops: [
      { name: 'The Broad', address: '221 S Grand Ave' },
      { name: 'MOCA Grand', address: '250 S Grand Ave' },
      { name: 'LACMA', address: '5905 Wilshire Blvd' },
    ],
    likes: 89, comments: 7, saves: 21,
  },
  {
    id: 'marcus-beach',
    author: 'Marcus',
    authorInitial: 'M',
    authorColor: 'linear-gradient(135deg,#9BE15D,#3FA34D)',
    title: 'PCH beach day',
    mapKey: 'beach',
    drive: '1h 12m', budget: '$54', gas: '$8', miles: '96mi',
    tags: ['#beach', '#PCH', '#malibu'],
    stops: [
      { name: 'Malibu Farm', address: 'Malibu Pier' },
      { name: 'El Matador Beach', address: '32350 Pacific Coast Hwy' },
      { name: 'Neptune\'s Net', address: '42505 Pacific Coast Hwy' },
    ],
    likes: 203, comments: 31, saves: 67,
  },
];
