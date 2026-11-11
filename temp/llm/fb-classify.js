const fs = require("fs");
const task = JSON.parse(fs.readFileSync("D:/quaestio/temp/llm/french-beginners.task.json", "utf8"));
const valid = new Set(task.dots.map(d => d.code));
const byCode = Object.fromEntries(task.dots.map(d => [d.code, d.path]));

// id -> [code|null, confidence, why]
const D = {
  // 2020
  fb202001: [null, "high", "weather forecast/places theme, no module dot"],
  fb202002: [null, "low", "instructions context unclear, no theme evidence"],
  fb202003: ["HSC-M3-D9", "medium", "school context; why-question needs meaning"],
  fb202004: [null, "low", "announcement audience/offer, theme unclear"],
  fb202005: ["HSC-M4-D5", "medium", "leisure plans; listening for specific details"],
  fb202006: [null, "low", "announcement purpose/process, theme unclear"],
  fb202007: ["HSC-M3-D9", "medium", "job requirements; comprehending work-ad meaning"],
  fb202008: [null, "low", "decisions made, no theme identified"],
  fb202009: ["HSC-M4-D7", "medium", "schoolies with friend; inferring likelihood"],
  fb202010: ["HSC-M3-D9", "medium", "school transport; benefits comprehension"],
  fb202011: [null, "high", "forest/wildlife places theme, no module"],
  fb202012: ["HSC-M3-D9", "medium", "school canteens; explaining figurative meaning"],
  fb202013: [null, "high", "family/Christmas culture, no module dot"],
  fb202014: [null, "high", "phone repair consumer text, no module"],
  fb202015: ["HSC-M4-D1", "high", "email invitation to concert with friend"],
  fb202016: ["HSC-M3-D2", "high", "persuasive letter re friend's part-time job"],
  fb202017: [null, "high", "family holiday refusal, family theme"],
  fb202018: ["HSC-M6-D16", "medium", "not university next year; future plans extended text"],
  // 2021
  fb202101: [null, "low", "horoscope prediction, no module theme"],
  fb202102: [null, "low", "identify speaker only, no theme"],
  fb202103: ["HSC-M3-D9", "medium", "compare two professionals; job details"],
  fb202104: [null, "low", "helping Leo, theme unclear"],
  fb202105: [null, "medium", "social media feature, technology theme"],
  fb202106: [null, "low", "product advertisement, theme unclear"],
  fb202107: ["HSC-M4-D7", "low", "collection hobby; inferring significance"],
  fb202108: [null, "high", "unique flight, travel theme"],
  fb202109: ["HSC-M3-D9", "medium", "work from home; inferring likelihood"],
  fb202110: [null, "high", "messaging mother, family theme"],
  fb202111: [null, "high", "3D prosthetics, health/tech theme"],
  fb202112: [null, "high", "senior share housing, home/community theme"],
  fb202113: ["HSC-M3-D3", "medium", "principal email purpose; school context"],
  fb202114: [null, "medium", "new French words, language/culture theme"],
  fb202115: ["HSC-M3-D2", "high", "note to teacher re dropping subject"],
  fb202116: ["HSC-M4-D1", "medium", "message to best friend re car"],
  fb202117: ["HSC-M4-D1", "medium", "informal letter about weekend with friends"],
  fb202118: ["HSC-M4-D1", "medium", "letter re new leisure activity spending"],
  // 2022
  fb202201: [null, "low", "why leaving message, theme unclear"],
  fb202202: ["HSC-M3-D9", "medium", "school presentation notice; table details"],
  fb202203: [null, "low", "compare two venues/brands, theme unclear"],
  fb202204: ["HSC-M4-D7", "high", "party tonight; inferring likelihood"],
  fb202205: [null, "low", "attitude change, theme unclear"],
  fb202206: [null, "medium", "sneaker resale, retail/consumer theme"],
  fb202207: [null, "low", "e-sport message to parents, theme ambiguous"],
  fb202208: ["HSC-M6-D2", "high", "experiences shape future aspirations; listening"],
  fb202209: [null, "high", "destination interest, travel theme"],
  fb202210: [null, "low", "Paul's motivation for project, theme unclear"],
  fb202211: ["HSC-M3-D9", "medium", "swimming truck for rural schools; school theme"],
  fb202212: [null, "medium", "singer profile, culture/media theme"],
  fb202213: ["HSC-M6-D4", "high", "speech to school leavers about future paths"],
  fb202214: ["HSC-M3-D9", "medium", "100-year-old schoolgirl; education theme"],
  fb202215: [null, "high", "balcony holidays, travel theme"],
  fb202216: ["HSC-M3-D2", "high", "message outlining excursion details"],
  fb202217: [null, "high", "brother's birthday speech, family theme"],
  fb202218: [null, "high", "New Year's Eve celebration, holidays theme"],
  fb202219: ["HSC-M3-D5", "high", "email recounting last week at school"],
  // 2023
  fb202301: [null, "high", "buying ingredients, food/shopping theme"],
  fb202302: [null, "low", "advertisement audience, theme unclear"],
  fb202303: [null, "low", "complaint and friend suggestion, theme unclear"],
  fb202304: [null, "medium", "marathon news report, sport theme"],
  fb202305: [null, "low", "requests to Christophe, theme unclear"],
  fb202306: [null, "low", "identify location of conversation, no theme"],
  fb202307: [null, "low", "predict next utterance, no theme"],
  fb202308: [null, "low", "Rosie's attitude change, theme unclear"],
  fb202309: [null, "high", "landmark changes, places/community theme"],
  fb202310: [null, "low", "parents' opinions on Daniel's plans, mixed theme"],
  fb202311: [null, "high", "Paris honey/Notre Dame, places theme"],
  fb202312: [null, "high", "athlete profile, sport/culture theme"],
  fb202313: [null, "medium", "exchange diary, host family/holiday theme"],
  fb202314: [null, "high", "share-flat advertisement, housing theme"],
  fb202315: [null, "high", "baguette culture debate, culture theme"],
  fb202316: [null, "high", "postcard to family while travelling"],
  fb202317: ["HSC-M3-D2", "high", "diary re holiday job interview success"],
  fb202318: ["HSC-M3-D5", "high", "email about studying a school subject"],
  fb202319: ["HSC-M4-D1", "high", "email pros/cons of leisure activity"],
  // 2024
  fb202401: [null, "medium", "restaurant reservation slip, hospitality theme"],
  fb202402: [null, "high", "weather forecast Paris, places theme"],
  fb202403: ["HSC-M3-D9", "medium", "pastry chef career path; work theme"],
  fb202404: [null, "high", "police arrest, crime/news theme"],
  fb202405: [null, "medium", "community proposal debate, community theme"],
  fb202406: [null, "high", "tourist location experiences, travel theme"],
  fb202407: ["HSC-M3-D9", "high", "principal justifying school change"],
  fb202408: [null, "high", "fast-food adapting to France, culture theme"],
  fb202409: ["HSC-M6-D2", "high", "speakers' plans next year; listening"],
  fb202410: [null, "high", "space cat history, no module"],
  fb202411: [null, "high", "e-scooter ban, transport/community theme"],
  fb202412: [null, "medium", "student cost of living, food theme"],
  fb202413: ["HSC-M3-D9", "medium", "right to disconnect, work theme"],
  fb202414: [null, "high", "bedbugs epidemic, community/health theme"],
  fb202415: ["HSC-M4-D1", "high", "invitation to friend's birthday party"],
  fb202416: [null, "high", "new pet changes family life, family theme"],
  fb202417: ["HSC-M3-D5", "high", "school assembly speech about school memory"],
  fb202418: [null, "high", "speech at family gathering, family theme"],
  // 2025
  fb202501: [null, "low", "purpose of call, theme unclear"],
  fb202502: [null, "medium", "coffee purchase table, shopping theme"],
  fb202503: [null, "low", "match picture to description, no theme"],
  fb202504: [null, "high", "giving directions, places theme"],
  fb202505: ["HSC-M3-D9", "high", "Pierre's subject choices; school theme"],
  fb202506: ["HSC-M3-D9", "high", "ideal candidate for job; work theme"],
  fb202507: [null, "low", "personalities differ, theme unclear"],
  fb202508: [null, "low", "Gaston/Molly details, theme unclear"],
  fb202509: [null, "medium", "teacher and travel agent, travel theme"],
  fb202510: [null, "high", "flying taxis, transport/innovation theme"],
  fb202511: [null, "medium", "hospital volunteering, community theme"],
  fb202512: [null, "high", "intergenerational childcare, family/community theme"],
  fb202513: [null, "high", "winter desserts, food/culture theme"],
  fb202514: [null, "high", "house swapping holidays, travel theme"],
  fb202515: [null, "medium", "cousin evening plan, family/social theme"],
  fb202516: ["HSC-M4-D1", "high", "email to friend reflecting on shared day"],
  fb202517: ["HSC-M6-D16", "high", "email about university plans next year"],
  fb202518: ["HSC-M3-D5", "high", "school multicultural day plans email"],
};

const ids = task.questions.map(q => q.id);
const problems = [];
if (ids.length !== new Set(ids).size) problems.push("duplicate ids in task");
for (const id of ids) if (!(id in D)) problems.push("missing decision: " + id);
for (const id of Object.keys(D)) if (!ids.includes(id)) problems.push("extra decision: " + id);
for (const [id, v] of Object.entries(D)) {
  const [code, conf, why] = v;
  if (code !== null && !valid.has(code)) problems.push("invalid code " + code + " for " + id);
  if (!["high", "medium", "low"].includes(conf)) problems.push("bad conf " + id);
  if (why.trim().split(/\s+/).length > 12) problems.push("why too long: " + id);
}
if (problems.length) { console.log(problems.join("\n")); process.exit(1); }

const out = {};
for (const id of ids) {
  const [code, confidence, why] = D[id];
  out[id] = { code, confidence, why };
}
fs.writeFileSync("D:/quaestio/temp/llm/french-beginners.out.json", JSON.stringify(out, null, 1) + "\n");

// report
const mapped = { high: 0, medium: 0, low: 0 };
const nulls = { high: 0, medium: 0, low: 0 };
const modules = {};
const codes = {};
for (const v of Object.values(D)) {
  if (v[0] === null) { nulls[v[1]]++; continue; }
  mapped[v[1]]++;
  codes[v[0]] = (codes[v[0]] || 0) + 1;
  const p = byCode[v[0]].split(" / ");
  modules[p[0] + " / " + p[1]] = (modules[p[0] + " / " + p[1]] || 0) + 1;
}
console.log("total", ids.length);
console.log("mapped", ids.length - Object.values(nulls).reduce((a, b) => a + b, 0), mapped);
console.log("null", Object.values(nulls).reduce((a, b) => a + b, 0), nulls);
console.log("by module", modules);
console.log("by code", codes);
