const fs = require('fs');
const task = require('./geography.task.json');
const codes = new Set(task.dots.map(d => d.code));

// id -> [code, confidence, why]
const m = {
  geo202001: ['HSC-M3-T3-D11', 'medium', 'Spatial dimension/pattern of an economic activity'],
  geo202002: ['HSC-M4-T2-D2', 'medium', 'Decentralisation as human process reshaping places'],
  geo202003: ['HSC-M4-T2-D2', 'low', 'Cartoon on urban dynamics: suburbanisation/consolidation'],
  geo202004: ['HSC-M2-T3-D9', 'high', 'Read average summer rainfall from climate graph'],
  geo202005: ['HSC-M5-T1-D10', 'high', 'Controlling pest species as ecosystem management strategy'],
  geo202006: ['HSC-M2-T2-D2', 'high', 'Primary fieldwork data collection technique'],
  geo202007: ['HSC-M2-T1-D11', 'high', 'Advantage of choropleth over statistics table'],
  geo202008: ['HSC-M5-T1-D2', 'high', 'Consumer level in food chain; energy flow'],
  geo202009: ['HSC-M2-T1-D7', 'high', 'Average speed from map distance and time'],
  geo202010: ['HSC-M2-T1-D1', 'high', 'Read latitude and longitude of earthquake'],
  geo202011: [null, 'low', 'Scale-versus-detail tradeoff not in any dot'],
  geo202012: ['HSC-M2-T1-D8', 'high', 'Bearing between two map features'],
  geo202013: ['HSC-M2-T1-D8', 'high', 'Watercourse flow direction from map'],
  geo202014: ['HSC-M2-T1-D4', 'high', 'Gradient of walking trail as ratio'],
  geo202015: ['HSC-M2-T1-D8', 'high', 'Sight line/visibility between spot elevations'],
  geo202016: ['HSC-M2-T5-D6', 'high', 'Grid reference where photograph was taken'],
  geo202017: ['HSC-M2-T3-D9', 'medium', 'Read tertiary employment percentage from graph'],
  geo202018: ['HSC-M4-T1-D5', 'high', 'World city identified from urban hierarchy'],
  geo202019: ['HSC-M2-T3-D8', 'high', 'Proportional increase calculation on migrant data'],
  geo202020: ['HSC-M2-T5-D2', 'low', 'Sun position and time give photograph direction'],
  geo202021: ['HSC-M2-T3-D9', 'medium', 'Graph colony data then explain trend'],
  geo202022: ['HSC-M5-T2-D3', 'medium', 'Human impacts on Karijini ecosystems'],
  geo202023: ['HSC-M4-T1-D5', 'medium', 'World cities as economic/cultural authority'],
  geo202024: ['HSC-M3-T3-D12', 'medium', 'Influences on nature of economic activity'],
  geo202025: ['HSC-M5-T1-D6', 'high', 'Vulnerability and resilience of ecosystems at risk'],
  geo202026: ['HSC-M4-T3-D4', 'high', 'Responses to challenges of mega cities'],
  geo202027: [null, 'medium', 'Local enterprise internal linkages/flows absent from syllabus'],
  geo202301: ['HSC-M2-T3-D9', 'high', 'Identify graph type from source'],
  geo202302: ['HSC-M3-T3-D12', 'medium', 'Sociocultural factor influencing economic activity'],
  geo202303: ['HSC-M2-T3-D9', 'medium', 'Calculate five-year waste totals from source'],
  geo202304: ['HSC-M3-T1-D5', 'high', 'UN Sustainable Development Goal targets and action'],
  geo202305: ['HSC-M5-T1-D11', 'medium', 'Indigenous cultural tours as ecosystem management'],
  geo202306: ['HSC-M5-T1-D2', 'high', 'Carbon flow path through ecosystem'],
  geo202307: ['HSC-M4-T3-D1', 'medium', 'New York culture of place expresses city character'],
  geo202308: ['HSC-M2-T5-D6', 'medium', 'Orient photograph to map to find bearing'],
  geo202309: ['HSC-M4-T2-D2', 'medium', 'Cause of contemporary counterurbanisation'],
  geo202310: ['HSC-M2-T1-D10', 'high', 'Density of schools within area reference'],
  geo202311: ['HSC-M2-T1-D2', 'medium', 'Elevation of pond read from contours'],
  geo202312: ['HSC-M2-T1-D7', 'high', 'Walking time from distance and speed'],
  geo202313: ['HSC-M2-T1-D4', 'high', 'Gradient from lookout to point'],
  geo202314: ['HSC-M2-T1-D9', 'medium', 'Area of river versus land using scale'],
  geo202315: ['HSC-M2-T3-D8', 'medium', 'Net forest loss as absolute change'],
  geo202316: ['HSC-M2-T3-D9', 'medium', 'Read predicted revenue growth from graph'],
  geo202317: ['HSC-M2-T1-D1', 'high', 'Latitude and longitude of police department'],
  geo202318: ['HSC-M2-T1-D8', 'high', 'Feature along SSW bearing from point'],
  geo202319: ['HSC-M2-T5-D1', 'high', 'Estimate scale of aerial photograph'],
  geo202320: ['PRE-M3-T3-D2', 'low', 'Long-term natural processes changing vegetation cover'],
  geo202321: ['HSC-M2-T3-D7', 'high', 'Complete and plot ternary graph data'],
  geo202322: ['HSC-M3-T3-D8', 'medium', 'Sustainability criteria applied to enterprise activity'],
  geo202323: ['HSC-M5-T2-D2', 'medium', 'Biophysical interactions and management effects on resilience'],
  geo202324: ['HSC-M4-T3-D3', 'high', 'Challenges of living in developing mega cities'],
  geo202325: ['HSC-M3-T1-D7', 'low', 'Technological influence on sustainability topics'],
  geo202326: ['HSC-M3-T3-D8', 'medium', 'Impacts used to evaluate global economic activity'],
  geo202327: ['HSC-M4-T1-D5', 'medium', 'Character and function of world cities'],
  geo202328: ['HSC-M5-T2-D3', 'medium', 'Human-induced negative impacts on ecosystems'],
  geo202401: ['HSC-M2-T5-D8', 'medium', 'Identify photograph type from visual source'],
  geo202402: ['HSC-M3-T1-D1', 'medium', 'Ecological pillar of sustainability for enterprise'],
  geo202403: ['HSC-M4-T1-D5', 'high', 'Factors influencing world city status'],
  geo202404: ['HSC-M2-T1-D13', 'low', 'Count settlement types shown on map'],
  geo202405: ['HSC-M4-T2-D2', 'medium', 'Counterurbanisation and decentralisation dynamics'],
  geo202406: ['HSC-M2-T3-D1', 'high', 'Percentage increase in GDP contribution'],
  geo202407: ['HSC-M2-T1-D7', 'high', 'Flight time from map distance and speed'],
  geo202408: ['HSC-M2-T1-D8', 'high', 'Aspect of slope at grid reference'],
  geo202409: ['HSC-M2-T1-D8', 'high', 'Visibility from trig station to points'],
  geo202410: [null, 'low', 'Enterprise type suited to island not covered'],
  geo202411: ['HSC-M5-T1-D6', 'high', 'Habitat fragmentation increases ecosystem vulnerability'],
  geo202412: [null, 'low', 'Cause of road gap inferred from imagery, no dot'],
  geo202413: ['HSC-M2-T1-D1', 'medium', 'Locate coordinates then read elevation'],
  geo202414: ['HSC-M2-T1-D12', 'high', 'Pressure patterns on weather map'],
  geo202415: ['HSC-M2-T1-D12', 'high', 'Wind speed/direction trend on weather map'],
  geo202416: ['HSC-M5-T1-D2', 'high', 'Energy loss along food chain'],
  geo202417: ['HSC-M4-T1-D6', 'medium', 'Predicted urban growth changes global city hierarchy'],
  geo202418: ['HSC-M2-T5-D1', 'high', 'Order sources from smallest to largest scale'],
  geo202419: ['HSC-M2-T5-D7', 'medium', 'Ratio along transect between two points'],
  geo202420: ['HSC-M2-T5-D6', 'high', 'Grid reference of photo point on map'],
  geo202421: ['HSC-M2-T1-D5', 'medium', 'Complete cross-section from topographic map'],
  geo202422: ['HSC-M5-T2-D2', 'medium', 'Biogeographical succession as ecosystem process'],
  geo202423: ['HSC-M3-T3-D12', 'medium', 'Market preference influence on economic activity'],
  geo202424: ['HSC-M4-T3-D2', 'medium', 'Urban dynamic changing residential land location'],
  geo202425: ['HSC-M3-T3-D12', 'low', 'Locational/environmental/global changes affecting enterprise'],
  geo202426: ['HSC-M5-T1-D10', 'high', 'Compare ecosystem management strategies for sustainability'],
  geo202427: ['HSC-M4-T3-D4', 'medium', 'Character of mega city shapes responses'],
};

const out = {};
const missing = [];
for (const q of task.questions) {
  if (!m[q.id]) { missing.push(q.id); continue; }
  const [code, confidence, why] = m[q.id];
  if (code !== null && !codes.has(code)) throw new Error('bad code ' + q.id + ' ' + code);
  if (why.split(/\s+/).length > 12) throw new Error('why too long ' + q.id);
  out[q.id] = { code, confidence, why };
}
const extra = Object.keys(m).filter(id => !task.questions.some(q => q.id === id));
if (missing.length) throw new Error('missing ids: ' + missing.join(','));
if (extra.length) throw new Error('extra ids: ' + extra.join(','));
fs.writeFileSync('./geography.out.json', JSON.stringify(out, null, 1));
console.log('written', Object.keys(out).length, 'of', task.questions.length);
