// =====================================================================
// LINES — the routes the player can pick from in the frontend
// =====================================================================
// Each line is plain data handed to createEngine(canvas, line):
//
//   { id, name, route, terrain, bridge, trains }
//
// `route`, `terrain`, `bridge` and `trains` have exactly the shape the engine
// expects (see legacy/js/01-config.js). The built-in Dhaka - Khulna line is not
// listed here: the engine returns it as `engine.DEFAULT_LINE`, and the picker
// offers it alongside these.
//
// Stations are written once, in the registry below, and each line lists its
// stops in travel order as [code, km] pairs. Only `en`, `bn` and `km` are
// required: everything else falls back to STATION_DEFAULTS in the engine, and
// `km` is a cumulative distance used to space the stops (the engine stretches
// every leg to at least CONFIG.MIN_LEG px, so short real gaps still read well).
//
// The one exception is Dhaka - Sylhet: each of its 58 stops carries its own
// platform, roof, crowd and props, so that line is written out in full as
// SYLHET_ROUTE below and does not go through the registry.
//
// Each line also ships its own services (the `trains` array), each with its own
// booked stops and clock. Every service here, mails included, calls only at
// main stations: the little Dhaka suburban halts (Tejgaon, Banani, Cantonment)
// are passed, never booked.
//
// The 3x5 station-name font has no apostrophe or comma, so English names are
// written the way the original does: "COXS BAZAR", "TONGI JN.".

// --- station registry -------------------------------------------------
const ST = {};
const st = (code, en, bn, opts) => {
  ST[code] = { code, en, bn, ...opts };
};

// A terminal: big platform, city skyline behind it, a few porters about. The
// trip ends here, so everyone gets off and nobody is waiting to board.
const TERM = { major: true, backdrop: ['city'], extras: ['porter'],
               platform: [-60, 380], crowd: 0, alight: 12, idle: 2 };

// --- Dhaka hub, shared by every line ---
// Kamalapur starts every line: the long umbrella platform, a big crowd waiting
// to board and nobody getting off (the same numbers as the built-in line).
const ORIGIN = { major: true, backdrop: ['city'], extras: ['porter'],
                 platform: [-330, 650], roof: 'umbrella', crowd: 15, alight: 0, idle: 14 };
st('DHK', 'KAMALAPUR', 'কমলাপুর', ORIGIN);
st('TJG', 'TEJGAON', 'তেজগাঁও', { crowd: 5, alight: 2 });
st('BNI', 'BANANI', 'বনানী', { crowd: 4, alight: 2 });
st('DCN', 'DHAKA CANTONMENT', 'ঢাকা ক্যান্টনমেন্ট', { crowd: 7, alight: 4 });
st('DAP', 'DHAKA AIRPORT', 'ঢাকা বিমানবন্দর', { major: true, crowd: 8, alight: 4 });
st('TGI', 'TONGI JN.', 'টঙ্গী জংশন', { major: true });
st('GBP', 'JOYDEBPUR JN.', 'জয়দেবপুর জংশন', { major: true });

// --- east: Dhaka - Bhairab - Brahmanbaria - Akhaura ---
st('PBL', 'PUBAIL', 'পুবাইল');
st('AKL', 'ARIKHOLA', 'আড়িখোলা');
st('GSF', 'GHORASHAL FLAG', 'ঘোড়াশাল ফ্ল্যাগ');
st('GSR', 'GHORASHAL', 'ঘোড়াশাল');
st('JND', 'JINARDI', 'জিনারদী');
st('NSD', 'NARSINGDI', 'নরসিংদী', { major: true, stallName: 'RIFAT TEA STALL' });
st('AMG', 'AMIRGANJ', 'আমিরগঞ্জ');
st('KNB', 'KHANABARI', 'খানাবাড়ী');
st('HTB', 'HATUBHANGA', 'হাটুভাঙ্গা');
st('MTK', 'METHIKANDA', 'মেথিকান্দা');
st('SRD', 'SREENIDHI', 'শ্রীনিধি');
st('DKT', 'DAULATKANDI', 'দৌলতকান্দি');
st('BRB', 'BHAIRAB BAZAR JN.', 'ভৈরব বাজার জংশন', { major: true });
st('ASG', 'ASHUGANJ', 'আশুগঞ্জ');
st('TSH', 'TALSAHAR', 'তালশহর');
st('BBA', 'BRAHMANBARIA', 'ব্রাহ্মণবাড়িয়া', { major: true });
st('PGC', 'PAGHACHANG', 'পাঘাচং');
st('BTS', 'BHATSHALA', 'ভাতশালা');
st('AKH', 'AKHAURA JN.', 'আখাউড়া জংশন', { major: true });

// --- Comilla - Laksam - Feni - Chattogram ---
st('GGS', 'GANGASAGAR', 'গঙ্গাসাগর');
st('KSB', 'KASBA', 'কসবা');
st('MDB', 'MANDOBAG', 'মন্দভাগ');
st('CMA', 'COMILLA', 'কুমিল্লা', { major: true });
st('MMT', 'MAINAMATI', 'ময়নামতি');
st('LSM', 'LAKSAM JN.', 'লাকসাম জংশন', { major: true });
st('NGL', 'NANGALKOT', 'নাঙ্গলকোট');
st('GUB', 'GUNABATI', 'গুনবতী');
st('FNI', 'FENI JN.', 'ফেনী জংশন', { major: true });
st('FZP', 'FAZILPUR', 'ফজলপুর');
st('MUH', 'MUHURIGANJ', 'মুহুরীগঞ্জ');
st('MRS', 'MIRSHARAI', 'মিরসরাই');
st('BYH', 'BARAIYARHAT', 'বাড়ৈয়াড়হাট');
st('STD', 'SITAKUNDA', 'সীতাকুণ্ড');
st('FJH', 'FAUJDARHAT JN.', 'ফৌজদারহাট জংশন');
st('PHT', 'PAHARTALI', 'পাহাড়তলী');
st('CTG', 'CHATTOGRAM', 'চট্টগ্রাম', TERM);

// --- Noakhali and Chandpur branches (off Laksam) ---
st('SNM', 'SONAIMURI', 'সোনাইমুড়ী');
st('MZD', 'MAIZDI', 'মাইজদী');
st('MZC', 'MAIZDI COURT', 'মাইজদী কোর্ট');
st('NKL', 'NOAKHALI', 'নোয়াখালী', TERM);
st('HZG', 'HAZIGANJ', 'হাজীগঞ্জ');
st('MRH', 'MEHER', 'মেহের');
st('MDR', 'MADHU ROAD', 'মধু রোড');
st('STL', 'SHAHTOLI', 'শাহতলী');
st('CNP', 'CHANDPUR', 'চাঁদপুর', TERM);

// --- Dohazari - Cox's Bazar ---
st('DOH', 'DOHAZARI', 'দোহাজারী', { major: true });
st('PTN', 'PATIYA', 'পটিয়া');
st('SKN', 'SATKANIA', 'সাতকানিয়া');
st('DLH', 'DULAHAZRA', 'দুলাহাজরা');
st('CKR', 'CHAKARIA', 'চকরিয়া');
st('EDG', 'EDGAON', 'ঈদগাঁও');
st('RMU', 'RAMU', 'রামু');
st('CXB', 'COXS BAZAR', 'কক্সবাজার', TERM);

// --- west: Dhaka - Tangail - Jamuna Bridge ---
st('KLH', 'KALIAKOIR', 'কালিয়াকৈর');
st('KRT', 'KOROTIA', 'করটিয়া');
st('MZP', 'MIRZAPUR', 'মির্জাপুর');
st('MHR', 'MOHERA', 'মোহেরা');
st('HMN', 'HEMNAGAR', 'হেমনগর');
st('BHP', 'BHUIYANPUR', 'ভূঞাপুর');
st('IBA', 'IBRAHIMABAD', 'ইব্রাহিমাবাদ');
st('BBE', 'BANGABANDHU BRIDGE EAST', 'বঙ্গবন্ধু সেতু পূর্ব', { major: true });
st('BBW', 'BANGABANDHU BRIDGE WEST', 'বঙ্গবন্ধু সেতু পশ্চিম', { major: true });
st('SGB', 'SIRAJGANJ BAZAR', 'সিরাজগঞ্জ বাজার');
st('JMT', 'JAMTOIL', 'জামতৈল');
st('RPR', 'RAIPUR', 'রায়পুর');
st('ULP', 'ULLAPARA', 'উল্লাপাড়া', { major: true });
st('KHP', 'KALIA HORIPUR', 'কালিয়া হরিপুর');
st('LMP', 'LAHIRI MOHONPUR', 'লাহিড়ী মোহনপুর');

// --- Rajshahi side: Bogra, Santahar, Natore ---
st('TRL', 'TALORA', 'তালোড়া');
st('BGR', 'BOGRA', 'বগুড়া', { major: true });
st('SNR', 'SANTAHAR JN.', 'সান্তাহার জংশন', { major: true });
st('NTR', 'NATORE', 'নাটোর');
st('ABP', 'ABDULPUR JN.', 'আব্দুলপুর জংশন', { major: true });
st('RJH', 'RAJSHAHI', 'রাজশাহী', TERM);

// --- north-west: Joypurhat, Parbatipur, Rangpur / Dinajpur ---
st('JPH', 'JOYPURHAT', 'জয়পুরহাট', { major: true });
st('AKP', 'AKKELPUR', 'আক্কেলপুর');
st('PBP', 'PARBATIPUR JN.', 'পার্বতীপুর জংশন', { major: true });
st('RNG', 'RANGPUR', 'রংপুর', TERM);
st('DNP', 'DINAJPUR', 'দিনাজপুর', TERM);

// --- Mymensingh - Jamalpur ---
st('MCH', 'MOUCHAK', 'মৌচাক');
st('SRP', 'SRIPUR', 'শ্রীপুর');
st('RJP', 'RAJENDRAPUR', 'রাজেন্দ্রপুর');
st('GAF', 'GAFARGAON', 'গফরগাঁও');
st('MYM', 'MYMENSINGH JN.', 'ময়মনসিংহ জংশন', { major: true });
st('ISL', 'ISLAMPUR BAZAR', 'ইসলামপুর বাজার');
st('JMP', 'JAMALPUR TOWN JN.', 'জামালপুর টাউন জংশন', { major: true });
st('DWB', 'DEWANGANJ BAZAR', 'দেওয়ানগঞ্জ বাজার', TERM);

// --- south-west: Padma Bridge - Barishal ---
st('GND', 'GENDARIA', 'গেন্ডারিয়া');
st('KRN', 'KERANIGANJ', 'কেরানীগঞ্জ');
st('NMT', 'NIMTALA', 'নিমতলা');
st('MWA', 'MAWA', 'মাওয়া');
st('PDM', 'PADMA', 'পদ্মা');
st('SHB', 'SHIBCHAR', 'শিবচর');
st('BGA', 'BHANGA JN.', 'ভাঙ্গা জংশন', { major: true });
st('KSH', 'KASHIANI JN.', 'কাশিয়ানী জংশন', { major: true });
st('MKS', 'MUKSUDPUR', 'মুকসুদপুর');
st('BAR', 'BARISHAL', 'বরিশাল', TERM);

// Bigger stations draw a fuller platform. Junctions and big towns are marked
// `major` in the registry, so they get a crowd above the ordinary stop's
// STATION_DEFAULTS (4/3/3); the terminals and Kamalapur keep the crowds above.
const BUSY = { crowd: 7, alight: 4, idle: 3 };
for (const s of Object.values(ST))
  if (s.major && s.crowd === undefined) Object.assign(s, BUSY);

// --- the east halts every Dhaka-bound east train passes (for reuse) ---
const EAST_HALTS = [
  ['PBL', 26], ['AKL', 30], ['GSF', 34], ['GSR', 37], ['JND', 42],
  ['NSD', 50], ['AMG', 56], ['KNB', 61], ['HTB', 65], ['MTK', 69],
  ['SRD', 73], ['DKT', 77], ['BRB', 82], ['ASG', 88], ['TSH', 93],
  ['BBA', 100], ['PGC', 109], ['BTS', 118], ['AKH', 127],
];
// the west halts every westbound train passes, up to the Bogra junction
const WEST_HALTS = [
  ['KLH', 40], ['KRT', 46], ['MZP', 54], ['MHR', 60], ['HMN', 66],
  ['BHP', 72], ['IBA', 78], ['BBE', 84], ['BBW', 90], ['SGB', 100],
  ['JMT', 108], ['RPR', 118], ['ULP', 132], ['KHP', 140], ['LMP', 148],
];

// --- the Meghna bridge just past Bhairab, and the Jamuna crossing ---
const MEGHNA = { at: ['BRB', 600], spans: 6, span: 120 };
const JAMUNA = { at: ['BBE', 250], spans: 3, span: 90 };

// --- build a line from a stop list (never mutates the shared data) ---
function mkLine({ id, name, bnName, stops, terrain, bridge, trains }) {
  return {
    id,
    name,
    bnName,
    route: stops.map(([code, km]) => {
      const s = ST[code];
      if (!s) throw new Error(`lines.js: line "${id}" uses unknown station "${code}"`);
      return { ...s, km };
    }),
    terrain: terrain.map(s => ({ ...s, at: s.at ? [...s.at] : undefined })),
    bridge: { ...bridge, at: [...bridge.at] },
    trains,
  };
}

// --- a line written out in full, for routes whose stations are its own ---
// Same shape as mkLine's result; it deep-copies so the engine can annotate the
// route objects (it stamps `dist` on them) without touching the source data.
function literalLine({ id, name, bnName, route, terrain, bridge, trains }) {
  return {
    id,
    name,
    bnName,
    route: route.map(s => ({ ...s })),
    terrain: terrain.map(s => ({ ...s, at: s.at ? [...s.at] : undefined })),
    bridge: { ...bridge, at: [...bridge.at] },
    trains: trains.map(t => ({ ...t, stops: [...t.stops] })),
  };
}

// The Dhaka - Sylhet line, as the engine used to carry it: every stop with its
// own roof, platform and crowd, the Meghna bridge at Bhairab, and the tea
// gardens and hills behind Sreemangal and Kulaura.
const SYLHET_ROUTE = [
  // --- Dhaka city ---
  { en: 'KAMALAPUR', bn: 'কমলাপুর', code: 'DHK', km: 0, major: true,
    platform: [-330, 650], roof: 'umbrella', crowd: 15, alight: 0, idle: 14,
    backdrop: ['city'], extras: ['porter'] },
  { en: 'TEJGAON', bn: 'তেজগাঁও', code: 'TJG', km: 4, crowd: 5, alight: 2 },
  { en: 'BANANI', bn: 'বনানী', code: 'BNI', km: 8, crowd: 4, alight: 2 },
  { en: 'CANTONMENT', bn: 'ঢাকা ক্যান্টনমেন্ট', code: 'DCN', km: 12,
    platform: [-60, 400], crowd: 7, alight: 4 },
  { en: 'AIRPORT', bn: 'ঢাকা বিমানবন্দর', code: 'DAP', km: 17, major: true,
    platform: [-60, 400], crowd: 8, alight: 4 },
  { en: 'TONGI JN.', bn: 'টঙ্গী জংশন', code: 'TGI', km: 22, major: true,
    roofColor: 'blue', platform: [-70, 380], crowd: 7, alight: 4, idle: 4 },
  // --- the old Dacca line down to Bhairab ---
  { en: 'PUBAIL', bn: 'পুবাইল', code: 'PBL', km: 26, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'ARIKHOLA', bn: 'আড়িখোলা', code: 'AKL', km: 30, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'GHORASHAL FLAG', bn: 'ঘোড়াশাল ফ্ল্যাগ', code: 'GSF', km: 34, roof: 'shelter', crowd: 2, alight: 1, idle: 1 },
  { en: 'GHORASHAL', bn: 'ঘোড়াশাল', code: 'GSR', km: 37, roof: 'shelter', crowd: 4, alight: 2, idle: 2 },
  { en: 'JINARDI', bn: 'জিনারদী', code: 'JND', km: 42, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'NARSINGDI', bn: 'নরসিংদী', code: 'NSD', km: 50, major: true, roofColor: 'blue',
    crowd: 6, alight: 4, stallName: 'RIFAT TEA STALL' },
  { en: 'AMIRGANJ', bn: 'আমিরগঞ্জ', code: 'AMG', km: 56, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'KHANABARI', bn: 'খানাবাড়ী', code: 'KNB', km: 61, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'HATUBHANGA', bn: 'হাটুভাঙ্গা', code: 'HTB', km: 65, roof: 'shelter', crowd: 2, alight: 1, idle: 1 },
  { en: 'METHIKANDA', bn: 'মেথিকান্দা', code: 'MTK', km: 69, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'SREENIDHI', bn: 'শ্রীনিধি', code: 'SRD', km: 73, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'DAULATKANDI', bn: 'দৌলতকান্দি', code: 'DKT', km: 77, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'BHAIRAB BAZAR JN.', bn: 'ভৈরব বাজার জংশন', code: 'BRB', km: 82, major: true,
    platform: [-90, 400], roofColor: 'red', crowd: 6, alight: 4, idle: 4, extras: ['fish'] },
  // --- on towards Akhaura ---
  { en: 'ASHUGANJ', bn: 'আশুগঞ্জ', code: 'ASG', km: 88, roof: 'shelter', crowd: 4, alight: 3, idle: 2 },
  { en: 'TALSAHAR', bn: 'তালশহর', code: 'TSH', km: 93, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'BRAHMANBARIA', bn: 'ব্রাহ্মণবাড়িয়া', code: 'BBA', km: 100, major: true,
    platform: [-70, 380], crowd: 6, alight: 4, idle: 3 },
  { en: 'PAGHACHANG', bn: 'পাঘাচং', code: 'PGC', km: 109, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'BHATSHALA', bn: 'ভাতশালা', code: 'BTS', km: 118, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'AKHAURA JN.', bn: 'আখাউড়া জংশন', code: 'AKH', km: 127, major: true,
    platform: [-80, 400], roofColor: 'blue', crowd: 6, alight: 4, idle: 3 },
  // --- the Sylhet line: Akhaura to Sreemangal ---
  { en: 'AZAMPUR', bn: 'আজমপুর', code: 'AZP', km: 132, crowd: 4, alight: 3, idle: 2 },
  { en: 'SINGERBIL', bn: 'সিঙ্গারবিল', code: 'SGB', km: 137, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'MERASANI', bn: 'মেরাসানি', code: 'MRS', km: 142, roof: 'shelter', crowd: 2, alight: 1, idle: 1 },
  { en: 'MUKUNDAPUR', bn: 'মুকুন্দপুর', code: 'MKD', km: 147, crowd: 4, alight: 3, idle: 2 },
  { en: 'HARASHPUR', bn: 'হরষপুর', code: 'HRP', km: 152, crowd: 4, alight: 3, idle: 2 },
  { en: 'KASIMNAGAR', bn: 'কাশিমনগর', code: 'KMN', km: 157, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'MONTOLA', bn: 'মনতলা', code: 'MNT', km: 162, crowd: 4, alight: 3, idle: 2 },
  { en: 'SHAHPUR', bn: 'শাহপুর', code: 'SHP', km: 167, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'TALIAPARA', bn: 'তেলিয়াপাড়া', code: 'TLP', km: 172, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'ITAKHULA', bn: 'ইটাখোলা', code: 'ITK', km: 177, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'NUAPARA', bn: 'নোয়াপাড়া', code: 'NUP', km: 182, crowd: 4, alight: 3, idle: 2 },
  { en: 'CHHATIAN', bn: 'ছাতিয়াইন', code: 'CTN', km: 187, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'SHAHAJIBAZAR', bn: 'শাহজিবাজার', code: 'SJB', km: 192, crowd: 4, alight: 3, idle: 2 },
  { en: 'SUTANG', bn: 'সুতাং', code: 'STG', km: 197, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'SHAISTAGANJ JN.', bn: 'শায়েস্তাগঞ্জ জংশন', code: 'SAJ', km: 202, roofColor: 'blue',
    crowd: 5, alight: 3, idle: 3 },
  { en: 'LASKARPUR', bn: 'লস্করপুর', code: 'LSP', km: 208, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'SATIAJURI', bn: 'সাটিয়াজুড়ি', code: 'STJ', km: 214, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'RASHIDPUR', bn: 'রশিদপুর', code: 'RDP', km: 220, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'SATGAON', bn: 'সাতগাঁও', code: 'SGN', km: 227, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'SREEMANGAL', bn: 'শ্রীমঙ্গল', code: 'SMG', km: 234, major: true,
    platform: [4, 318], roof: 'shelter', crowd: 4, alight: 3, idle: 2 },
  // --- through the tea gardens to Kulaura ---
  { en: 'BHANUGACH', bn: 'ভানুগাছ', code: 'BHC', km: 240, roof: 'shelter', crowd: 4, alight: 3, idle: 2 },
  { en: 'SHAMSERNAGAR', bn: 'শমশেরনগর', code: 'SMR', km: 246, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'MUNO', bn: 'মনু', code: 'MNU', km: 252, roof: 'shelter', crowd: 2, alight: 1, idle: 1 },
  { en: 'TILAGAON', bn: 'টিলাগাঁও', code: 'TLG', km: 258, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'LONGLA', bn: 'লংলা', code: 'LGL', km: 264, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'KULAURA JN.', bn: 'কুলাউড়া জংশন', code: 'KUL', km: 272, major: true,
    roofColor: 'blue', crowd: 5, alight: 3, idle: 3,
    extras: ['chests'] },                                  // tea chests from the gardens around
  // --- the hills, then down to Sylhet ---
  { en: 'SAKAPAN', bn: 'ছকাপন', code: 'SKP', km: 279, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'BARAMCHAL', bn: 'বরমচাল', code: 'BRM', km: 286, crowd: 4, alight: 3, idle: 2 },
  { en: 'BHATARA BAZAR', bn: 'ভাটেরা বাজার', code: 'BTB', km: 292, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'MAIJGAON', bn: 'মাইজগাঁও', code: 'MJG', km: 298, crowd: 4, alight: 3, idle: 2 },
  { en: 'FENCHUGANJ', bn: 'ফেঞ্চুগঞ্জ', code: 'FCG', km: 305, crowd: 4, alight: 3, idle: 2 },
  { en: 'MUGLABAZAR', bn: 'মোগলাবাজার', code: 'MGB', km: 312, roof: 'shelter', crowd: 3, alight: 2, idle: 2 },
  { en: 'SYLHET', bn: 'সিলেট', code: 'SYL', km: 319, major: true,
    platform: [-60, 380], crowd: 0, alight: 12, idle: 2 },
];

const SYLHET_TRAINS = [
  { no: '709/710', en: 'PARABAT EXPRESS', bn: 'পারাবত এক্সপ্রেস', start: 6.34, end: 13.0,
    stops: ['DAP', 'BRB', 'BBA', 'AZP', 'NUP', 'SAJ', 'SMG', 'BHC', 'KUL', 'MJG'] },
  { no: '717/718', en: 'JAYANTIKA EXPRESS', bn: 'জয়ন্তিকা এক্সপ্রেস', start: 11.25, end: 19.0,
    stops: ['DAP', 'ASG', 'BBA', 'AZP', 'MKD', 'HRP', 'MNT', 'NUP', 'SJB', 'SAJ', 'SMG', 'BHC', 'KUL', 'MJG'] },
  { no: '739/740', en: 'UPABAN EXPRESS', bn: 'উপবন এক্সপ্রেস', start: 16.5, end: 23.5,
    stops: ['DAP', 'NSD', 'BRB', 'AZP', 'SAJ', 'SMG', 'BHC', 'SMR', 'KUL', 'BRM', 'MJG'] },
  { no: '773/774', en: 'KALNI EXPRESS', bn: 'কলনী এক্সপ্রেস', start: 14.92, end: 21.5,
    stops: ['DAP', 'NSD', 'BRB', 'BBA', 'AZP', 'HRP', 'SAJ', 'SMG', 'SMR', 'KUL', 'MJG'] },
  { no: '09/10', en: 'SURMA MAIL', bn: 'সুরমা মেইল', start: 21.0, end: 33.17, all: true, stops: [] },
];

const SYLHET_TERRAIN = [
  { id: 'village' },                      // Kamalapur onwards: paddy, ponds, tin roofs
  { id: 'river', at: ['BRB', -260] },     // the Meghna at Bhairab, and the bridge
  { id: 'kash',  at: ['BRB', 1400] },     // sandy chars white with kash phool
  { id: 'tea',   at: ['SMG', -420] },     // Sreemangal and Kulaura tea gardens
  { id: 'hills', at: ['KUL', 400] },      // misty hills on the approach to Sylhet
];

// =====================================================================
// The lines
// =====================================================================
export const LINES = [
  literalLine({
    id: 'dhaka-sylhet',
    name: 'Dhaka – Sylhet',
    bnName: 'ঢাকা থেকে সিলেট',
    route: SYLHET_ROUTE,
    terrain: SYLHET_TERRAIN,
    bridge: MEGHNA,
    trains: SYLHET_TRAINS,
  }),

  mkLine({
    id: 'dhaka-chattogram',
    name: 'Dhaka – Chattogram',
    bnName: 'ঢাকা থেকে চট্টগ্রাম',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17], ['TGI', 22],
      ...EAST_HALTS,
      ['GGS', 134], ['KSB', 141], ['MDB', 147], ['CMA', 154], ['MMT', 160],
      ['LSM', 180], ['NGL', 190], ['GUB', 199], ['FNI', 210], ['FZP', 217],
      ['MUH', 224], ['MRS', 240], ['BYH', 248], ['STD', 275], ['FJH', 296],
      ['PHT', 310], ['CTG', 320],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['BRB', -260] },
      { id: 'kash', at: ['BRB', 1400] },
      { id: 'village', at: ['CMA', -500] },
      { id: 'hills', at: ['MRS', 0] },
    ],
    bridge: MEGHNA,
    trains: [
      { no: '701/702', en: 'SUBORNO EXPRESS', bn: 'সুবর্ণ এক্সপ্রেস', start: 6.0, end: 12.0,
        stops: ['DAP', 'BRB', 'BBA', 'AKH', 'CMA', 'LSM', 'FNI'] },
      { no: '703/704', en: 'MOHANAGAR PROVATI', bn: 'মহানগর প্রবাহতী', start: 7.0, end: 13.0,
        stops: ['DAP', 'NSD', 'BRB', 'AKH', 'CMA', 'LSM', 'FNI'] },
      { no: '741/742', en: 'TURNA EXPRESS', bn: 'তূর্ণা এক্সপ্রেস', start: 23.0, end: 29.0,
        stops: ['DAP', 'BRB', 'BBA', 'AKH', 'LSM', 'FNI'] },
      { no: '787/788', en: 'SONAR BANGLA EXPRESS', bn: 'সোনার বাংলা এক্সপ্রেস', start: 16.0, end: 22.0,
        stops: ['DAP', 'BRB', 'AKH', 'CMA', 'LSM', 'FNI'] },
      { no: '133/134', en: 'KARNAPHULI EXPRESS', bn: 'কর্ণফুলী এক্সপ্রেস', start: 9.0, end: 18.0,
        stops: ['DAP', 'TGI', 'NSD', 'BRB', 'BBA', 'AKH', 'CMA', 'LSM', 'FNI'] },
    ],
  }),

  mkLine({
    id: 'dhaka-rajshahi',
    name: 'Dhaka – Rajshahi',
    bnName: 'ঢাকা থেকে রাজশাহী',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17],
      ['TGI', 22], ['GBP', 30],
      ...WEST_HALTS,
      ['TRL', 166], ['BGR', 178], ['SNR', 190], ['NTR', 210], ['ABP', 222],
      ['RJH', 245],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['BBE', -100] },
      { id: 'kash', at: ['BBW', 200] },
      { id: 'village', at: ['SNR', -400] },
    ],
    bridge: JAMUNA,
    trains: [
      { no: '753/754', en: 'SILK CITY EXPRESS', bn: 'সিল্ক সিটি এক্সপ্রেস', start: 7.5, end: 14.0,
        stops: ['DAP', 'BBW', 'ULP', 'BGR', 'SNR', 'NTR'] },
      { no: '759/760', en: 'PADMA EXPRESS', bn: 'পদ্মা এক্সপ্রেস', start: 15.0, end: 21.5,
        stops: ['DAP', 'BBW', 'ULP', 'BGR', 'SNR', 'NTR'] },
      { no: '769/770', en: 'BANALATA EXPRESS', bn: 'বনলতা এক্সপ্রেস', start: 6.5, end: 13.0,
        stops: ['DAP', 'BBW', 'ULP', 'SNR', 'NTR'] },
      { no: '23/24', en: 'RAJSHAHI MAIL', bn: 'রাজশাহী মেইল', start: 20.0, end: 30.0,
        stops: ['DAP', 'TGI', 'GBP', 'BBE', 'BBW', 'ULP', 'BGR', 'SNR', 'NTR', 'ABP'] },
    ],
  }),

  mkLine({
    id: 'dhaka-rangpur',
    name: 'Dhaka – Rangpur',
    bnName: 'ঢাকা থেকে রংপুর',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17],
      ['TGI', 22], ['GBP', 30],
      ...WEST_HALTS,
      ['TRL', 166], ['BGR', 178], ['SNR', 190], ['JPH', 205], ['AKP', 214],
      ['PBP', 230], ['RNG', 248],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['BBE', -100] },
      { id: 'kash', at: ['BBW', 200] },
      { id: 'village', at: ['SNR', -400] },
    ],
    bridge: JAMUNA,
    trains: [
      { no: '771/772', en: 'RANGPUR EXPRESS', bn: 'রংপুর এক্সপ্রেস', start: 8.0, end: 18.0,
        stops: ['DAP', 'BBW', 'ULP', 'BGR', 'SNR', 'JPH', 'PBP'] },
      { no: '751/752', en: 'LALMONI EXPRESS', bn: 'লালমনি এক্সপ্রেস', start: 22.0, end: 33.0,
        stops: ['DAP', 'BBW', 'ULP', 'BGR', 'SNR', 'JPH', 'PBP'] },
      { no: '797/798', en: 'KURIGRAM EXPRESS', bn: 'কুড়িগ্রাম এক্সপ্রেস', start: 10.0, end: 21.0,
        stops: ['DAP', 'BBW', 'ULP', 'SNR', 'JPH', 'PBP'] },
    ],
  }),

  mkLine({
    id: 'dhaka-dinajpur',
    name: 'Dhaka – Dinajpur',
    bnName: 'ঢাকা থেকে দিনাজপুর',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17],
      ['TGI', 22], ['GBP', 30],
      ...WEST_HALTS,
      ['TRL', 166], ['BGR', 178], ['SNR', 190], ['JPH', 205], ['AKP', 214],
      ['PBP', 230], ['DNP', 250],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['BBE', -100] },
      { id: 'kash', at: ['BBW', 200] },
      { id: 'village', at: ['SNR', -400] },
    ],
    bridge: JAMUNA,
    trains: [
      { no: '705/706', en: 'EKOTA EXPRESS', bn: 'একতা এক্সপ্রেস', start: 13.0, end: 25.0,
        stops: ['DAP', 'BBW', 'ULP', 'BGR', 'SNR', 'JPH', 'PBP'] },
      { no: '757/758', en: 'DRUTOJAN EXPRESS', bn: 'দ্রুতযান এক্সপ্রেস', start: 7.0, end: 19.0,
        stops: ['DAP', 'BBW', 'ULP', 'SNR', 'JPH', 'PBP'] },
    ],
  }),

  mkLine({
    id: 'dhaka-mymensingh',
    name: 'Dhaka – Mymensingh – Jamalpur',
    bnName: 'ঢাকা থেকে ময়মনসিংহ',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17],
      ['TGI', 22], ['GBP', 30], ['MCH', 38], ['SRP', 46], ['RJP', 54],
      ['GAF', 66], ['MYM', 84], ['ISL', 104], ['JMP', 118], ['DWB', 132],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['TGI', 900] },
      { id: 'village', at: ['GAF', -400] },
    ],
    bridge: { at: ['TGI', 940], spans: 2, span: 90 },
    trains: [
      { no: '745/746', en: 'BRAHMAPUTRA EXPRESS', bn: 'ব্রহ্মপুত্র এক্সপ্রেস', start: 7.0, end: 12.0,
        stops: ['DAP', 'TGI', 'GBP', 'GAF', 'MYM', 'JMP'] },
      { no: '737/738', en: 'TISTA EXPRESS', bn: 'তিস্তা এক্সপ্রেস', start: 15.0, end: 21.0,
        stops: ['DAP', 'TGI', 'GAF', 'MYM', 'ISL', 'JMP'] },
    ],
  }),

  mkLine({
    id: 'dhaka-noakhali',
    name: 'Dhaka – Noakhali',
    bnName: 'ঢাকা থেকে নোয়াখালী',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17], ['TGI', 22],
      ...EAST_HALTS,
      ['GGS', 134], ['KSB', 141], ['MDB', 147], ['CMA', 154], ['MMT', 160],
      ['LSM', 180], ['SNM', 190], ['MZD', 198], ['MZC', 202], ['NKL', 208],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['BRB', -260] },
      { id: 'kash', at: ['BRB', 1400] },
      { id: 'village', at: ['CMA', -500] },
    ],
    bridge: MEGHNA,
    trains: [
      { no: '711/712', en: 'UPAKUL EXPRESS', bn: 'উপকূল এক্সপ্রেস', start: 7.0, end: 14.0,
        stops: ['DAP', 'BRB', 'BBA', 'AKH', 'CMA', 'LSM', 'MZD'] },
      { no: '17/18', en: 'NOAKHALI EXPRESS', bn: 'নোয়াখালী এক্সপ্রেস', start: 21.0, end: 30.0,
        stops: ['DAP', 'TGI', 'NSD', 'BRB', 'BBA', 'AKH', 'CMA', 'LSM', 'MZD'] },
    ],
  }),

  mkLine({
    id: 'dhaka-chandpur',
    name: 'Dhaka – Chandpur',
    bnName: 'ঢাকা থেকে চাঁদপুর',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17], ['TGI', 22],
      ...EAST_HALTS,
      ['GGS', 134], ['KSB', 141], ['MDB', 147], ['CMA', 154], ['MMT', 160],
      ['LSM', 180], ['HZG', 190], ['MRH', 196], ['MDR', 201], ['STL', 205],
      ['CNP', 212],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['BRB', -260] },
      { id: 'kash', at: ['BRB', 1400] },
      { id: 'village', at: ['CMA', -500] },
      { id: 'river', at: ['CNP', -700] },
    ],
    bridge: MEGHNA,
    trains: [
      { no: '729/730', en: 'MEGHNA EXPRESS', bn: 'মেঘনা এক্সপ্রেস', start: 6.5, end: 12.0,
        stops: ['DAP', 'BRB', 'AKH', 'CMA', 'LSM', 'HZG'] },
      { no: '19/20', en: 'CHANDPUR EXPRESS', bn: 'চাঁদপুর এক্সপ্রেস', start: 16.0, end: 23.0,
        stops: ['DAP', 'TGI', 'NSD', 'BRB', 'BBA', 'AKH', 'CMA', 'LSM', 'HZG'] },
    ],
  }),

  mkLine({
    id: 'dhaka-coxs-bazar',
    name: 'Dhaka – Cox\u2019s Bazar',
    bnName: 'ঢাকা থেকে কক্সবাজার',
    stops: [
      ['DHK', 0], ['TJG', 4], ['BNI', 8], ['DCN', 12], ['DAP', 17], ['TGI', 22],
      ...EAST_HALTS,
      ['GGS', 134], ['KSB', 141], ['MDB', 147], ['CMA', 154], ['MMT', 160],
      ['LSM', 180], ['NGL', 190], ['GUB', 199], ['FNI', 210], ['FZP', 217],
      ['MUH', 224], ['MRS', 240], ['BYH', 248], ['STD', 275], ['FJH', 296],
      ['PHT', 310], ['CTG', 320],
      ['DOH', 336], ['PTN', 344], ['SKN', 356], ['DLH', 368], ['CKR', 380],
      ['EDG', 392], ['RMU', 404], ['CXB', 418],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['BRB', -260] },
      { id: 'kash', at: ['BRB', 1400] },
      { id: 'village', at: ['CMA', -500] },
      { id: 'hills', at: ['MRS', 0] },
    ],
    bridge: MEGHNA,
    trains: [
      { no: '839/840', en: 'COXS BAZAR EXPRESS', bn: 'কক্সবাজার এক্সপ্রেস', start: 6.0, end: 15.0,
        stops: ['DAP', 'BRB', 'AKH', 'CMA', 'LSM', 'FNI', 'CTG', 'CKR', 'RMU'] },
      { no: '841/842', en: 'SAIKAT EXPRESS', bn: 'সৈকত এক্সপ্রেস', start: 22.0, end: 32.0,
        stops: ['DAP', 'BRB', 'BBA', 'AKH', 'LSM', 'FNI', 'CTG', 'SKN', 'CKR'] },
      { no: '25/26', en: 'BAZAR MAIL', bn: 'বাজার মেইল', start: 8.0, end: 21.0,
        stops: ['DAP', 'TGI', 'NSD', 'BRB', 'BBA', 'AKH', 'CMA', 'LSM', 'FNI', 'CTG', 'DOH', 'CKR'] },
    ],
  }),

  mkLine({
    id: 'dhaka-barishal',
    name: 'Dhaka – Barishal',
    bnName: 'ঢাকা থেকে বরিশাল',
    stops: [
      ['DHK', 0], ['GND', 3], ['KRN', 6], ['NMT', 12], ['MWA', 24],
      ['PDM', 34], ['SHB', 44], ['BGA', 58], ['KSH', 74], ['MKS', 86],
      ['BAR', 120],
    ],
    terrain: [
      { id: 'village' },
      { id: 'river', at: ['PDM', -300] },
      { id: 'village', at: ['KSH', -300] },
      { id: 'river', at: ['BAR', -700] },
    ],
    bridge: { at: ['PDM', 120], spans: 5, span: 120 },
    trains: [
      { no: '821/822', en: 'KIRTANKHOLA EXPRESS', bn: 'কীর্তনখোলা এক্সপ্রেস', start: 6.5, end: 12.5,
        stops: ['MWA', 'BGA', 'KSH', 'MKS'] },
      { no: '827/828', en: 'BARISHAL EXPRESS', bn: 'বরিশাল এক্সপ্রেস', start: 15.5, end: 22.0,
        stops: ['MWA', 'BGA', 'KSH'] },
    ],
  }),
];

export default LINES;
