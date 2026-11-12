const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function harness(page, replies, incident = 'Current Incident') {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {textContent:'', innerHTML:'', children:[], classList:{add(){},remove(){}},
      replaceChildren(...nodes){this.children=nodes;}, querySelector(){return element(id+'.title');}, addEventListener(){}});
    return elements.get(id);
  };
  const requests=[];
  const context = vm.createContext({ URL, URLSearchParams, console:{...console,error(){}}, setTimeout(){}, setInterval(){},
    location:{search:'?incident='+encodeURIComponent(incident),href:'https://example.com/evac.html'},
    document:{addEventListener(){},title:'',getElementById:element,createDocumentFragment:()=>({children:[],appendChild(node){this.children.push(node);}})},
    fetch:async url=>{requests.push(new URL(url, 'https://example.com/'));const next=replies.shift();if(next instanceof Error)throw next;return {ok:true,json:async()=>next};}
  });
  context.window=context;
  vm.runInContext(fs.readFileSync(path.join(root,'shared.js'),'utf8'),context);
  let script = [...fs.readFileSync(path.join(root,page),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1];
  script=script.slice(0,script.lastIndexOf('    // Initialize'));
  script+='\n globalThis.testing = {loadIncidents: typeof loadIncidents === "function" ? loadIncidents : null, loadEvacuationZones: typeof loadEvacuationZones === "function" ? loadEvacuationZones : null, loadIncidentStatus: typeof loadIncidentStatus === "function" ? loadIncidentStatus : null}; })();';
  vm.runInContext(script,context);
  return {context, elements, element, requests, api:context.testing};
}
test('all copied page scripts parse',()=>{
  for(const file of fs.readdirSync(root).filter(p=>p.endsWith('.html'))){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    for(const [,script] of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script,{filename:file});
  }
});
test('home queries live zones and replaces incident chips on refresh',async()=>{
  const h=harness('index.html',[
    {features:[{attributes:{incident:'Current Incident'}},{attributes:{incident:'Current Incident'}}]},
    {features:[]}
  ]);
  // A chip only needs DOM methods used by createChip.
  h.context.document.createElement=()=>({dataset:{},append(){},addEventListener(){}});
  await h.api.loadIncidents();
  assert.equal(h.requests[0].searchParams.get('where'),'Live = 1');
  assert.equal(h.element('incidentCountBadge').textContent,1);
  assert.equal(h.element('incidentChips').children[0].children.length,1);
  await h.api.loadIncidents();
  assert.equal(h.element('incidentCountBadge').textContent,0);
  assert.equal(h.element('incidentChips').children.length,0);
});
test('service errors are not reported as no active incidents',async()=>{
  const h=harness('index.html',[{error:{message:'Service unavailable'}}]);
  await h.api.loadIncidents();
  assert.match(h.element('noIncidentsMsg.title').textContent,/Unable to load/);
});
test('cards query LIVE and support every editor status, escaping incident names',async()=>{
  const features=['Set','Go','Shelter-In-Place','Access Impact Area','Planning'].map(STATUS=>({attributes:{STATUS,zonename:'Zone <1>'}}));
  const h=harness('evac.html',[{features}],"O'Brien");
  await h.api.loadEvacuationZones();
  assert.equal(h.requests[0].searchParams.get('where'),"Live = 1 AND incident='O''Brien'");
  for(const title of ['GO - Evacuate Now','SET - Pre-Evacuation','Shelter-In-Place','Access Impact Area','Planning'])assert.ok(h.element('evacRow').innerHTML.includes(title));
  assert.ok(h.element('evacRow').innerHTML.includes('Zone &lt;1&gt;'));
});
test('inactive incident URLs hide saved resource cards',async()=>{
  const h=harness('evac.html',[{count:0}]);
  await h.api.loadIncidentStatus();
  assert.equal(h.requests.length,1);
  assert.match(h.requests[0].searchParams.get('where'),/^Live = 1 AND/);
  assert.match(h.element('incidentPanel').innerHTML,/No Active Incident/);
});
test('live incidents can load their matching resource cards',async()=>{
  const h=harness('evac.html',[{count:1},[{name:'Current Incident',road:'Current road information'}]]);
  await h.api.loadIncidentStatus();
  assert.equal(h.requests.length,2);
  assert.match(h.element('incidentPanel').innerHTML,/Current road information/);
});
test('map query layers and live lists use the visibility filter and refresh',()=>{
  for(const file of ['overview.html','evac.html']){
    const s=fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(s.includes("definitionExpression: 'Live = 1'"));
    assert.ok(s.includes("where: 'Live = 1'"));
    assert.ok(s.includes('setInterval(refreshIncidents, 60000)'));
    assert.ok(s.includes('Live = 1 AND ${CONFIG.incidentField}'));
  }
});
