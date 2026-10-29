// The built-in Cyprus rides. Plain data (no React) so server code – e.g. the
// share-index.json route handler – can import it too. Re-exported by useEditorState.
import type { RouteConfig } from '@/hooks/useEditorState';

export const ROUTES: RouteConfig[] = [
  {
    id: 'route-1',
    name: 'Agios Georgios → Polis',
    cities: [
      { id: '2', name: 'Agios Georgios', country: 'Cyprus', lat: 34.8838031, lng: 32.3446892 },
      { id: '3', name: 'Pano Arodes', country: 'Cyprus', lat: 34.9244925, lng: 32.4196612 },
      { id: '4', name: 'Ineia', country: 'Cyprus', lat: 34.963983, lng: 32.3824113 },
      { id: '5', name: 'Androlikou', country: 'Cyprus', lat: 34.9882794, lng: 32.3788797 },
      { id: '6', name: 'Polis', country: 'Cyprus', lat: 35.0246073, lng: 32.4127148 },
    ],
    videoId: '5EgtgRoC8NI',
    durationSeconds: 34 * 60 + 16, // 34:16
    routeColor: '#CCFF00',
  },
  {
    id: 'route-2',
    name: 'Polis → Pomos',
    cities: [
      { id: 'r2-1', name: 'Polis Chrysochous', country: 'Cyprus', lat: 35.0393148, lng: 32.4042644 },
      { id: 'r2-2', name: 'Polis East', country: 'Cyprus', lat: 35.041072, lng: 32.4174365 },
      { id: 'r2-3', name: 'Polis Outskirts', country: 'Cyprus', lat: 35.0394087, lng: 32.4246033 },
      { id: 'r2-4', name: 'Chrysochous Valley', country: 'Cyprus', lat: 35.0378529, lng: 32.4335303 },
      { id: 'r2-5', name: 'Chrysochous Bay', country: 'Cyprus', lat: 35.0630401, lng: 32.4641189 },
      { id: 'r2-6', name: 'Agia Marina', country: 'Cyprus', lat: 35.127973, lng: 32.5163844 },
      { id: 'r2-7', name: 'Pomos', country: 'Cyprus', lat: 35.151795, lng: 32.5391915 },
    ],
    videoId: 'xBqcc3zJVBU',
    durationSeconds: 31 * 60 + 25, // 31:25
    routeColor: '#CCFF00',
  },
  {
    id: 'route-3',
    name: 'Kouklia → Agios Nikolaos',
    cities: [
      { id: 'r3-1', name: 'Kouklia', country: 'Cyprus', lat: 34.7149022, lng: 32.5501062 },
      { id: 'r3-2', name: 'Nikokleia', country: 'Cyprus', lat: 34.7311708, lng: 32.5807008 },
      { id: 'r3-3', name: 'Kidasi', country: 'Cyprus', lat: 34.8254251, lng: 32.7260753 },
      { id: 'r3-4', name: 'Pretori', country: 'Cyprus', lat: 34.8376584, lng: 32.7366831 },
      { id: 'r3-5', name: 'Kato Archimandrita', country: 'Cyprus', lat: 34.8441119, lng: 32.7391511 },
      { id: 'r3-6', name: 'Agios Nikolaos', country: 'Cyprus', lat: 34.868518, lng: 32.7655225 },
    ],
    videoId: 'z65BD4UIwzQ',
    durationSeconds: 30 * 60 + 1, // 30:01
    routeColor: '#CCFF00',
  },
  {
    id: 'route-4',
    name: 'Salamiou → Mandria',
    cities: [
      { id: 'r4-1', name: 'Salamiou', country: 'Cyprus', lat: 34.8388912, lng: 32.6926334 },
      { id: 'r4-2', name: 'WP2', country: 'Cyprus', lat: 34.8402633, lng: 32.689599 },
      { id: 'r4-3', name: 'WP3', country: 'Cyprus', lat: 34.841061, lng: 32.6918165 },
      { id: 'r4-4', name: 'WP4', country: 'Cyprus', lat: 34.8431958, lng: 32.6977263 },
      { id: 'r4-5', name: 'WP5', country: 'Cyprus', lat: 34.857967, lng: 32.7290852 },
      { id: 'r4-6', name: 'WP6', country: 'Cyprus', lat: 34.8443473, lng: 32.7424511 },
      { id: 'r4-7', name: 'WP7', country: 'Cyprus', lat: 34.8728506, lng: 32.7962794 },
      { id: 'r4-8', name: 'WP8', country: 'Cyprus', lat: 34.8710617, lng: 32.8117429 },
      { id: 'r4-9', name: 'WP9', country: 'Cyprus', lat: 34.8697019, lng: 32.8267944 },
      { id: 'r4-10', name: 'Mandria', country: 'Cyprus', lat: 34.8697574, lng: 32.8289984 },
    ],
    videoId: 'nPGyzPP7-o0',
    durationSeconds: 1679, // ~28 minutes
    routeColor: '#CCFF00',
  },
  {
    id: 'route-5',
    name: 'Kouklia → Salamiou',
    cities: [
      { id: 'r5-1', name: 'Kouklia', country: 'Cyprus', lat: 34.7173647, lng: 32.5556329 },
      { id: 'r5-2', name: 'WP2', country: 'Cyprus', lat: 34.7206934, lng: 32.5609284 },
      { id: 'r5-3', name: 'WP3', country: 'Cyprus', lat: 34.7312048, lng: 32.5718749 },
      { id: 'r5-4', name: 'WP4', country: 'Cyprus', lat: 34.8396497, lng: 32.6909006 },
      { id: 'r5-5', name: 'WP5', country: 'Cyprus', lat: 34.8394256, lng: 32.6931351 },
      { id: 'r5-6', name: 'Salamiou', country: 'Cyprus', lat: 34.8398585, lng: 32.6981934 },
    ],
    videoId: 'egt_6nv4W0U',
    durationSeconds: 1388, // ~23 minutes
    routeColor: '#CCFF00',
  },
  {
    id: 'route-6',
    name: 'Kathikas → Lysos',
    cities: [
      { id: 'wp6-0', name: 'Kathikas', country: 'Cyprus', lat: 34.9124625, lng: 32.4256641 },
      { id: 'wp6-1', name: 'WP 1', country: 'Cyprus', lat: 34.9137808, lng: 32.4263643 },
      { id: 'wp6-2', name: 'WP 2', country: 'Cyprus', lat: 34.925198, lng: 32.4381723 },
      { id: 'wp6-3', name: 'WP 3', country: 'Cyprus', lat: 34.9435348, lng: 32.4465716 },
      { id: 'wp6-4', name: 'WP 4', country: 'Cyprus', lat: 34.9522976, lng: 32.4487758 },
      { id: 'wp6-5', name: 'WP 5', country: 'Cyprus', lat: 34.9520524, lng: 32.450501 },
      { id: 'wp6-6', name: 'WP 6', country: 'Cyprus', lat: 34.9529159, lng: 32.451033 },
      { id: 'wp6-7', name: 'WP 7', country: 'Cyprus', lat: 34.9575986, lng: 32.4507197 },
      { id: 'wp6-8', name: 'WP 8', country: 'Cyprus', lat: 34.964114, lng: 32.4563567 },
      { id: 'wp6-9', name: 'Lysos', country: 'Cyprus', lat: 34.9954017, lng: 32.5117372 }
    ],
    videoId: 'mxQj61ZXZ9k',
    durationSeconds: 26 * 60 + 25, // 26:25
    routeColor: '#CCFF00',
  },
  {
    id: 'route-7',
    name: 'Pegeia → Kathikas',
    videoId: 'E0QOwjdIuzY',
    durationSeconds: 17 * 60 + 20, // 17:20
    routeColor: '#CCFF00',
    cities: [
      { id: 'wp7-0', name: 'Pegeia', country: 'Cyprus', lat: 34.8510744, lng: 32.3838098 },
      { id: 'wp7-1', name: 'WP 1', country: 'Cyprus', lat: 34.8533107, lng: 32.3853003 },
      { id: 'wp7-2', name: 'WP 2', country: 'Cyprus', lat: 34.859841, lng: 32.3934698 },
      { id: 'wp7-3', name: 'WP 3', country: 'Cyprus', lat: 34.8622366, lng: 32.4056227 },
      { id: 'wp7-4', name: 'WP 4', country: 'Cyprus', lat: 34.8720869, lng: 32.4121196 },
      { id: 'wp7-5', name: 'WP 5', country: 'Cyprus', lat: 34.8874491, lng: 32.4224393 },
      { id: 'wp7-6', name: 'WP 6', country: 'Cyprus', lat: 34.8895975, lng: 32.4241108 },
      { id: 'wp7-7', name: 'WP 7', country: 'Cyprus', lat: 34.8964556, lng: 32.4282424 },
      { id: 'wp7-8', name: 'WP 8', country: 'Cyprus', lat: 34.9041933, lng: 32.429519 },
      { id: 'wp7-9', name: 'Kathikas', country: 'Cyprus', lat: 34.9124377, lng: 32.4256776 }
    ]
  }
,
  {
    id: 'route-8',
    name: 'Paphos → Agios Georgios',
    videoId: '_FN0eryH4N8',
    durationSeconds: 23 * 60 + 59, // 23:59
    routeColor: '#CCFF00',
    cities: [
      { id: 'wp8-0', name: 'Paphos', country: 'Cyprus', lat: 34.7758272, lng: 32.4097781 },
      { id: 'wp8-1', name: 'WP 1', country: 'Cyprus', lat: 34.7768358, lng: 32.4072865 },
      { id: 'wp8-2', name: 'Agios Georgios', country: 'Cyprus', lat: 34.9028965, lng: 32.3179217 }
    ]
  }
,
  {
    id: 'route-9',
    name: 'Kouklia → Pissouri',
    videoId: '9uLRToTIAyc',
    durationSeconds: 11 * 60 + 27, // 11:27
    routeColor: '#CCFF00',
    forceStraight: true,
    cities: [
      { id: 'wp9-0', name: 'Kouklia', country: 'Cyprus', lat: 34.6869276, lng: 32.5833376 },
      { id: 'wp9-coast-0', name: 'B6 Coast', country: 'Cyprus', lat: 34.6836693, lng: 32.5900656 },
      { id: 'wp9-coast-1', name: 'B6 Coast', country: 'Cyprus', lat: 34.6813675, lng: 32.597004 },
      { id: 'wp9-coast-2', name: 'B6 Coast', country: 'Cyprus', lat: 34.6776829, lng: 32.6014331 },
      { id: 'wp9-coast-3', name: 'B6 Coast', country: 'Cyprus', lat: 34.6758136, lng: 32.6058904 },
      { id: 'wp9-coast-4', name: 'B6 Coast', country: 'Cyprus', lat: 34.6747775, lng: 32.6070251 },
      { id: 'wp9-coast-5', name: 'B6 Coast', country: 'Cyprus', lat: 34.671904, lng: 32.6087928 },
      { id: 'wp9-coast-6', name: 'B6 Coast', country: 'Cyprus', lat: 34.6706664, lng: 32.6112801 },
      { id: 'wp9-coast-7', name: 'B6 Coast', country: 'Cyprus', lat: 34.6697417, lng: 32.6139378 },
      { id: 'wp9-coast-8', name: 'B6 Coast', country: 'Cyprus', lat: 34.6687662, lng: 32.6157427 },
      { id: 'wp9-coast-9', name: 'B6 Coast', country: 'Cyprus', lat: 34.6676091, lng: 32.620985 },
      { id: 'wp9-coast-10', name: 'B6 Coast', country: 'Cyprus', lat: 34.6668182, lng: 32.6234482 },
      { id: 'wp9-coast-11', name: 'B6 Coast', country: 'Cyprus', lat: 34.6648989, lng: 32.6263743 },
      { id: 'wp9-coast-12', name: 'B6 Coast', country: 'Cyprus', lat: 34.664982, lng: 32.627462 },
      { id: 'wp9-coast-13', name: 'B6 Coast', country: 'Cyprus', lat: 34.6657993, lng: 32.6293202 },
      { id: 'wp9-coast-14', name: 'B6 Coast', country: 'Cyprus', lat: 34.6659537, lng: 32.631082 },
      { id: 'wp9-coast-15', name: 'B6 Coast', country: 'Cyprus', lat: 34.6650325, lng: 32.6352572 },
      { id: 'wp9-coast-16', name: 'B6 Coast', country: 'Cyprus', lat: 34.6621268, lng: 32.6398727 },
      { id: 'wp9-coast-17', name: 'B6 Coast', country: 'Cyprus', lat: 34.6605023, lng: 32.6430472 },
      { id: 'wp9-coast-18', name: 'B6 Coast', country: 'Cyprus', lat: 34.6587041, lng: 32.6494061 },
      { id: 'wp9-coast-19', name: 'B6 Coast', country: 'Cyprus', lat: 34.66178, lng: 32.6538307 },
      { id: 'wp9-coast-20', name: 'B6 Coast', country: 'Cyprus', lat: 34.6654814, lng: 32.6570713 },
      { id: 'wp9-coast-21', name: 'B6 Coast', country: 'Cyprus', lat: 34.6675416, lng: 32.6613914 },
      { id: 'wp9-coast-22', name: 'B6 Coast', country: 'Cyprus', lat: 34.6705996, lng: 32.6686268 },
      { id: 'wp9-coast-23', name: 'B6 Coast', country: 'Cyprus', lat: 34.6716193, lng: 32.6722723 },
      { id: 'wp9-coast-24', name: 'B6 Coast', country: 'Cyprus', lat: 34.6726465, lng: 32.6848285 },
      { id: 'wp9-coast-25', name: 'B6 Coast', country: 'Cyprus', lat: 34.6733988, lng: 32.6917852 },
      { id: 'wp9-coast-26', name: 'B6 Coast', country: 'Cyprus', lat: 34.6740148, lng: 32.6950356 },
      { id: 'wp9-2', name: 'Pissouri', country: 'Cyprus', lat: 34.674622, lng: 32.6962141 }
    ]
  },
  {
    id: 'route-10',
    name: 'Kelokedara → Kidasi',
    cities: [
      { id: 'r10-1', name: 'Kelokedara', country: 'Cyprus', lat: 34.8777649, lng: 32.4831292 },
      { id: 'r10-2', name: 'Kidasi (West)', country: 'Cyprus', lat: 34.9248352, lng: 32.5843096 },
      { id: 'r10-3', name: 'Kidasi', country: 'Cyprus', lat: 34.9248475, lng: 32.5890359 }
    ],
    videoId: 'Febo-2Vx-Vs',
    durationSeconds: 931,
    routeColor: '#CCFF00',
    forceStraight: false
  },
  {
    // 2nd ride Kouklia → Pissouri (Google-Maps route, "avoid highways"): starts in Kouklia village,
    // then the same B6 coastal road as route-9 – waypoints on the B6 keep OSRM off the A6.
    id: 'route-11',
    name: 'Kouklia → Pissouri (Fahrt 2)',
    videoId: 'bZq5qBMWcIE',
    durationSeconds: 14 * 60 + 1, // 14:01
    routeColor: '#CCFF00',
    cities: [
      { id: 'r11-1', name: 'Kouklia', country: 'Cyprus', lat: 34.7167461, lng: 32.5456297 },
      { id: 'r11-2', name: 'B6', country: 'Cyprus', lat: 34.6869276, lng: 32.5833376 },
      { id: 'r11-3', name: 'B6 Coast', country: 'Cyprus', lat: 34.671904, lng: 32.6087928 },
      { id: 'r11-4', name: 'B6 Coast', country: 'Cyprus', lat: 34.6648989, lng: 32.6263743 },
      { id: 'r11-5', name: 'B6 Coast', country: 'Cyprus', lat: 34.6605023, lng: 32.6430472 },
      { id: 'r11-6', name: 'B6 Coast', country: 'Cyprus', lat: 34.6675416, lng: 32.6613914 },
      { id: 'r11-7', name: 'B6 Coast', country: 'Cyprus', lat: 34.6733988, lng: 32.6917852 },
      { id: 'r11-8', name: 'Pissouri', country: 'Cyprus', lat: 34.6746021, lng: 32.6963737 },
    ],
  }
];
