'use strict';

// =====================================================================
// 1. CONFIG
// =====================================================================
const W = 320, H = 180;                 // internal resolution

const CONFIG = {
  STEP: 1 / 60,                         // fixed simulation timestep (s)
  MAX_FRAME: 0.25,                      // clamp long frames (tab switches)
  FAST_FACTOR: 4,                       // hold F to fast-forward

  CRUISE_SPEED: 80,                     // world px per second
  ACCEL_TIME: 7,                        // s, 0 -> cruise
  BRAKE_TIME: 6,                        // s, cruise -> 0 (nominal)
  PX_PER_KM: 20,                        // route km -> world px (compressed)
  MIN_LEG: 620,                         // shortest gap between two stops, world px
  TERRAIN_BLEND: 300,                   // world px over which one landscape fades into the next

  // station stop sequence (seconds)
  SETTLE_TIME: 0.8,                     // brakes settle before doors open
  DOOR_TIME: 0.7,                       // doors slide open / closed
  BOARD_TIMEOUT: 18,                    // safety cap on the boarding phase
  FLAG_TIME: 2.2,                       // guard waves the green flag
  HORN_TIME: 1.6,                       // horn, then depart

  // DRIVE mode: the player drives with one combined lever, -5 (emergency
  // brake) .. -1 brake steps, 0 coast, 1 .. 8 power notches
  DRIVE: {
    NOTCHES: 8, BRAKES: 4,
    ACCEL: 15, KNEE: 45,                // px/s² at full power; tractive effort fades above KNEE px/s
    REV_SPEED: 18,                      // px/s max reverse speed (slow shunting crawl)
    DRAG: [0.5, 0.00035],               // rolling + air resistance: c0 + c1 * v²
    BRAKE: 4.5, EMERGENCY: 28,          // px/s² per brake step, emergency brake
    CRANK_TIME: 2.2, SHUTDOWN_TIME: 2.5,
    COMFORT_ACCEL: 16,                  // px/s² passengers put up with
    FIRST_DEP: 32, DWELL: 16, SLACK: 6, // timetable: s to first departure, per stop, per leg
    SCHED_SPEED: 84,                    // px/s the timetable assumes on open line
    ON_TIME: 8,                         // game minutes either side that count as on time
  },

  // time of day follows the trip. These are the defaults; applyTrain() in
  // section 8 overwrites them with the chosen service's real timetable.
  HOUR_START: 5.6, HOUR_END: 20.4,
  HOUR_EASE: 3,                         // max game hours per second when time jumps (skip, T)

  // weather: light monsoon spells (seeded, so every trip gets the same ones)
  RAIN_GAP: [35, 80],                   // s of dry weather between spells
  RAIN_SPELL: [14, 28],                 // s a spell lasts
  LIGHTNING_RATE: 0.05,                 // strikes per second while it pours

  TRAIN_FRONT_X: 273,                   // screen x of the headlight
  LOCO_W: 46, CAR_W: 39, CAR_GAP: 2, CAR_COUNT: 5,
  WHEEL_R: 3.5, WHEEL_FRAMES: 6,
  BN_SIZE: 11,                          // px size Bangla text is rasterised at

  // particle pools [normal, low quality]; nothing is allocated while running
  SMOKE_MAX: [70, 40], RAIN_MAX: [180, 100], SPLASH_MAX: [60, 30],
  SPARK_MAX: [70, 36], FIREFLY_MAX: [40, 20], BIRD_MAX: [8, 5], FLUFF_MAX: [60, 30],
  LOW_QUALITY_MS: 11,                   // average frame cost that switches to low quality
};

// The React build wraps these 13 files in createEngine(canvas, options); the
// standalone reference site under legacy/ loads them as plain scripts with no
// such thing, so fall back to an empty object. (typeof guards the reference.)
const OPT = typeof options === 'undefined' ? {} : options;

// Identifies the built-in line: the React layer shows this in its route picker
// and can add more lines of its own (see src/lines.js).
const LINE_INFO = { id: 'dhaka-khulna', name: 'Dhaka – Khulna', bnName: 'ঢাকা থেকে খুলনা' };

// The route, in travel order: the real Dhaka (Kamalapur) - Khulna line, with
// every halt the intercity and mail trains serve. To add a station, add an
// entry: only en, bn, code and km are required, everything else falls back to
// STATION_DEFAULTS.
//   en / bn   English and Bangla names shown on the board and banner
//   code      three letters: the route map and the service stop lists use them
//   km        distance from Kamalapur along the line (approximate, real)
//   major     print the code on the route map (junctions and big towns)
//   platform  [left, right] screen x of the platform while stopped here
//   roof      'umbrella' | 'canopy' | 'shelter'
//   crowd     passengers waiting to board, alight: passengers getting off
//   idle      extra people standing around
//   backdrop  extra scenery from BACKDROPS drawn near the station (the
//             landscape along the line itself comes from TERRAIN below)
//   extras    station-specific props / characters ('porter', 'fish', 'chests')
//   stallName a name board over that stop's tea stall ('RIFAT TEA STALL')
const ROUTE = OPT.route || [
  // --- Dhaka city ---
  { en: 'KAMALAPUR', bn: 'কমলাপুর', code: 'DHK', km: 0, major: true, platform: [-330, 650],
    roof: 'umbrella', crowd: 15, alight: 0, idle: 14, backdrop: ['city'], extras: ['porter'] },
  { en: 'TEJGAON', bn: 'তেজগাঁও', code: 'TJG', km: 4, crowd: 5, alight: 2 },
  { en: 'BANANI', bn: 'বনানী', code: 'BNI', km: 8, crowd: 4, alight: 2 },
  { en: 'DHAKA CANTONMENT', bn: 'ঢাকা ক্যান্টনমেন্ট', code: 'DCN', km: 12, crowd: 7, alight: 4 },
  { en: 'DHAKA AIRPORT', bn: 'ঢাকা বিমানবন্দর', code: 'DAP', km: 17, major: true, crowd: 8,
    alight: 4 },
  { en: 'TONGI JN.', bn: 'টঙ্গী জংশন', code: 'TGI', km: 22, major: true, crowd: 7, alight: 4,
    idle: 3 },
  { en: 'JOYDEBPUR JN.', bn: 'জয়দেবপুর জংশন', code: 'GBP', km: 30, major: true, crowd: 7,
    alight: 4, idle: 3 },
  // --- west from Dhaka, over the Jamuna Bridge ---
  { en: 'KALIAKOIR', bn: 'কালিয়াকৈর', code: 'KLH', km: 40 },
  { en: 'KOROTIA', bn: 'করটিয়া', code: 'KRT', km: 46 },
  { en: 'MIRZAPUR', bn: 'মির্জাপুর', code: 'MZP', km: 54 },
  { en: 'MOHERA', bn: 'মোহেরা', code: 'MHR', km: 60 },
  { en: 'HEMNAGAR', bn: 'হেমনগর', code: 'HMN', km: 66 },
  { en: 'BHUIYANPUR', bn: 'ভূঞাপুর', code: 'BHP', km: 72 },
  { en: 'IBRAHIMABAD', bn: 'ইব্রাহিমাবাদ', code: 'IBA', km: 78 },
  { en: 'BANGABANDHU BRIDGE EAST', bn: 'বঙ্গবন্ধু সেতু পূর্ব', code: 'BBE', km: 84, major: true,
    crowd: 7, alight: 4, idle: 3 },
  { en: 'BANGABANDHU BRIDGE WEST', bn: 'বঙ্গবন্ধু সেতু পশ্চিম', code: 'BBW', km: 90, major: true,
    crowd: 7, alight: 4, idle: 3 },
  // --- the west bank: Sirajganj down to Ullapara ---
  { en: 'SIRAJGANJ BAZAR', bn: 'সিরাজগঞ্জ বাজার', code: 'SGB', km: 100 },
  { en: 'JAMTOIL', bn: 'জামতৈল', code: 'JMT', km: 108 },
  { en: 'RAIPUR', bn: 'রায়পুর', code: 'RPR', km: 118 },
  { en: 'ULLAPARA', bn: 'উল্লাপাড়া', code: 'ULP', km: 132, major: true, crowd: 7, alight: 4,
    idle: 3 },
  { en: 'KALIA HORIPUR', bn: 'কালিয়া হরিপুর', code: 'KHP', km: 140 },
  { en: 'LAHIRI MOHONPUR', bn: 'লাহিড়ী মোহনপুর', code: 'LMP', km: 148 },
  // --- Ishwardi, Kushtia ---
  { en: 'ISHWARDI JN.', bn: 'ঈশ্বরদী জংশন', code: 'ISW', km: 168, major: true, crowd: 7,
    alight: 4, idle: 3 },
  { en: 'PAKSHI', bn: 'পাকশী', code: 'PKI', km: 174 },
  { en: 'PORADAH JN.', bn: 'পোরাদহ জংশন', code: 'PRD', km: 182, major: true, crowd: 7, alight: 4,
    idle: 3 },
  { en: 'KUSHTIA', bn: 'কুষ্টিয়া', code: 'KST', km: 188 },
  { en: 'KUSHTIA COURT', bn: 'কুষ্টিয়া কোর্ট', code: 'KSC', km: 191 },
  { en: 'JAGATI', bn: 'জগতি', code: 'JGT', km: 196 },
  { en: 'BHERAMARA', bn: 'ভেড়ামারা', code: 'BHR', km: 200 },
  // --- Jessore, then Khulna ---
  { en: 'DARSHANA JN.', bn: 'দর্শনা জংশন', code: 'DRJ', km: 214, major: true, crowd: 7,
    alight: 4, idle: 3 },
  { en: 'ALAMDANGA', bn: 'আলমডাঙ্গা', code: 'ALD', km: 220 },
  { en: 'CHUADANGA', bn: 'চুয়াডাঙ্গা', code: 'CHD', km: 228 },
  { en: 'MUBARAKGANJ', bn: 'মোবারকগঞ্জ', code: 'MUB', km: 238 },
  { en: 'JESSORE JN.', bn: 'যশোর জংশন', code: 'JSR', km: 250, major: true, crowd: 7, alight: 4,
    idle: 3 },
  { en: 'JHIKARGACHA', bn: 'ঝিকরগাছা', code: 'JHK', km: 260 },
  { en: 'NABHARAN', bn: 'নাভারণ', code: 'NAB', km: 268 },
  { en: 'PHULTALA', bn: 'ফুলতলা', code: 'PHL', km: 278 },
  { en: 'KHULNA JN.', bn: 'খুলনা জংশন', code: 'KHJ', km: 284, major: true, crowd: 7, alight: 4,
    idle: 3 },
  { en: 'KHULNA', bn: 'খুলনা', code: 'KHL', km: 290, major: true, platform: [-60, 380], crowd: 0,
    alight: 12, idle: 2, backdrop: ['city'], extras: ['porter'] },
];
const STATION_DEFAULTS = { platform: [-40, 360], roof: 'canopy', roofColor: 'green',
                           crowd: 4, alight: 3, idle: 3, backdrop: [], extras: [] };

// The services: the real intercity and mail trains on the Dhaka - Khulna route.
// The player picks one on the title card. Each has its own booked stops (by
// station code) — every other halt is passed without stopping — and its own
// clock: start/end are the hours of the trip, so the sky follows the real
// timetable (end may run past 24 for the overnight mail). `all` stops
// everywhere, which is what a mail train does.
const TRAINS = OPT.trains || [
  { no: '725/726', en: 'SUNDARBAN EXPRESS', bn: 'সুন্দরবন এক্সপ্রেস', start: 6.5, end: 14.0,
    stops: ['DAP', 'BBW', 'ULP', 'ISW', 'KST', 'JSR'] },
  { no: '763/764', en: 'CHITRA EXPRESS', bn: 'চিত্রা এক্সপ্রেস', start: 9.0, end: 17.0,
    stops: ['DAP', 'BBW', 'ULP', 'ISW', 'KST', 'DRJ', 'JSR'] },
  { no: '15/16', en: 'KHULNA MAIL', bn: 'খুলনা মেইল', start: 20.5, end: 31.0,
    stops: ['DAP', 'TGI', 'GBP', 'BBE', 'BBW', 'ULP', 'ISW', 'PRD', 'KST', 'DRJ', 'JSR', 'KHJ'] },
];

// The landscape between the stations, in travel order. Each section starts
// at [station code, world px from that station]; neighbouring sections
// cross-fade over CONFIG.TERRAIN_BLEND px. What a section paints and spawns
// in the far, mid and foreground layers is defined in SECTIONS.
const TERRAIN = OPT.terrain || [
  { id: 'village' },
  { id: 'river', at: ['BBE', -100] },
  { id: 'kash', at: ['BBW', 200] },
  { id: 'village', at: ['ISW', -400] },
  { id: 'river', at: ['KHL', -900] },
];
// Steel truss railway bridge over the Jamuna, at Bangabandhu Bridge East
const BRIDGE = OPT.bridge || { at: ['BBE', 250], spans: 3, span: 90 };

// Scroll speed of each parallax layer relative to the track
const PARALLAX = { clouds: 0.05, far: 0.2, mid: 0.5, track: 1.0, fg: 1.3 };

// Screen y where each layer / sprite is drawn
const LAYER_Y = { clouds: 6, far: 60, mid: 84, poles: 92,
                  track: 140, fg: 146, loco: 116, car: 121, wheel: 144 };

// Near-side platform geometry (screen y). People stand with their feet
// between WALK_MIN and WALK_MAX; doors span DOOR_TOP..DOOR_FLOOR.
const PLAT = { TOP: 148, EDGE_Y: 152, WALK_MIN: 154, WALK_MAX: 169,
               DOOR_TOP: 125, DOOR_FLOOR: 136,
               STALL_X: 280, STALL_Y: 163, BOARD_X: 132 };

// Palette lighting by hour of day: [hour, lighting]. Between two different
// lightings the world cross-fades with an ordered dither; the sky, the
// colour tint and the glow of lamps follow the hour smoothly on top.
const LIGHT_KEYS = [[0, 'night'], [4.6, 'night'], [5.4, 'dusk'], [6.4, 'dusk'], [7.4, 'day'],
                    [17.0, 'day'], [17.9, 'dusk'], [18.9, 'dusk'], [19.9, 'night'], [24, 'night']];
// The time-of-day button / T key cycles these; AUTO follows the trip
const TIME_MODES = [['AUTO', null], ['DAY', 12], ['DUSK', 18.3], ['NIGHT', 22.5]];
