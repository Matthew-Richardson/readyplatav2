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
  script=script.slice(0, page === 'overview.html' ? script.lastIndexOf('    initCoderedOverlay(DOM);') : script.lastIndexOf('    // Initialize'));
  script=script.replace('        function refreshIncidents() {', '        globalThis.refreshForTest = refreshIncidents;\n        function refreshIncidents() {');
  script+='\n globalThis.testing = {initMap: typeof initMap === "function" ? initMap : null, loadIncidents: typeof loadIncidents === "function" ? loadIncidents : null, loadEvacuationZones: typeof loadEvacuationZones === "function" ? loadEvacuationZones : null, loadIncidentStatus: typeof loadIncidentStatus === "function" ? loadIncidentStatus : null}; })();';
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
    {features:[{attributes:{incident:'Current Incident',Live:1}},{attributes:{incident:'Current Incident',Live:1}}]},
    {features:[]}
  ]);
  // A chip only needs DOM methods used by createChip.
  h.context.document.createElement=()=>({dataset:{},append(){},addEventListener(){}});
  await h.api.loadIncidents();
  assert.equal(h.requests[0].searchParams.get('where'),'Live = 1');
  assert.equal(h.requests[0].searchParams.get('returnGeometry'),'false');
  assert.equal(h.requests[0].searchParams.get('outFields'),'incident,Live');
  assert.ok(h.requests[0].searchParams.get('_ts'));
  assert.equal(h.element('incidentCountBadge').textContent,1);
  assert.equal(h.element('incidentChips').children[0].children.length,1);
  await h.api.loadIncidents();
  assert.notEqual(h.requests[0].searchParams.get('_ts'),h.requests[1].searchParams.get('_ts'));
  assert.equal(h.element('incidentCountBadge').textContent,0);
  assert.equal(h.element('incidentChips').children.length,0);
});
test('service errors are not reported as no active incidents',async()=>{
  const h=harness('index.html',[{error:{message:'Service unavailable'}}]);
  await h.api.loadIncidents();
  assert.match(h.element('noIncidentsMsg.title').textContent,/Unable to load/);
});
test('cards query LIVE and support every editor status, escaping incident names',async()=>{
  const features=['Set','Go','Shelter-In-Place','Access Impact Area','Planning'].map(STATUS=>({attributes:{STATUS,zonename:'Zone <1>',Live:1,incident:"O'Brien"}}));
  const h=harness('evac.html',[{features}],"O'Brien");
  await h.api.loadEvacuationZones();
  assert.equal(h.requests[0].searchParams.get('where'),"Live = 1 AND incident='O''Brien'");
  for(const title of ['GO - Evacuate Now','SET - Pre-Evacuation','Shelter-In-Place','Access Impact Area','Planning'])assert.ok(h.element('evacRow').innerHTML.includes(title));
  assert.ok(h.element('evacRow').innerHTML.includes('Zone &lt;1&gt;'));
});
test('inactive incident URLs hide saved resource cards',async()=>{
  const h=harness('evac.html',[{features:[]}]);
  await h.api.loadIncidentStatus();
  assert.equal(h.requests.length,1);
  assert.match(h.requests[0].searchParams.get('where'),/^Live = 1 AND/);
  assert.match(h.element('incidentPanel').innerHTML,/No Active Incident/);
});
test('live incidents can load their matching resource cards',async()=>{
  const h=harness('evac.html',[{features:[{attributes:{Live:1,incident:'Current Incident'}}]},[{name:'Current Incident',road:'Current road information'}]]);
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

test('home rejects inactive, null and missing Live flags even if returned by the service',async()=>{
  const h=harness('index.html',[{features:[
    {attributes:{incident:'Inactive',Live:0}},
    {attributes:{incident:'Null flag',Live:null}},
    {attributes:{incident:'Missing flag'}},
    {attributes:{incident:null,Live:1}},
    {attributes:{incident:'Current Incident',Live:1}},
    {attributes:{incident:' current incident ',Live:1}}
  ]}]);
  h.context.document.createElement=()=>({dataset:{},append(){},addEventListener(){}});
  await h.api.loadIncidents();
  assert.equal(h.element('incidentCountBadge').textContent,1);
  assert.equal(h.element('incidentChips').children[0].children.length,1);
});
test('an older active response cannot overwrite a newer inactive response',async()=>{
  const h=harness('index.html',[]);
  let release;
  h.context.fetch=()=>new Promise(resolve=>{release=resolve;});
  const old=h.api.loadIncidents();
  h.context.fetch=async()=>({ok:true,json:async()=>({features:[]})});
  await h.api.loadIncidents();
  release({ok:true,json:async()=>({features:[{attributes:{incident:'Old incident',Live:1}}]})});
  await old;
  assert.equal(h.element('incidentCountBadge').textContent,0);
  assert.equal(h.element('incidentChips').children.length,0);
});

for (const page of ['evac.html','overview.html']) {
  test(page + ' removes inactive incidents and bypasses cached list requests', async()=>{
    const h=harness(page,[
      {features:[{attributes:{incident:'Current Incident',Live:1}},{attributes:{incident:'Inactive Incident',Live:0}}]},
      {features:[]}
    ], '');
    const pending={then(){return this;},catch(){return this;}};
    class Layer { constructor(options){Object.assign(this,options);} when(){return pending;} queryExtent(){return Promise.resolve({extent:null});} removeAll(){} addMany(){} }
    class Map { constructor(){this.allLayers={forEach(){}};} add(){} load(){return pending;} }
    class View { constructor(){this.ui={add(){}};} when(){return pending;} on(){} }
    const Graphic=class{}, Widget=class{}, Point=class{};
    h.context.window.innerWidth=1000;
    h.context.require=(names,callback)=>{
      if(page==='evac.html') callback(Map,View,Layer,Widget,Widget);
      else callback(Map,View,Layer,Layer,Graphic,Widget,Point);
    };
    h.context.document.createElement=()=>({dataset:{},append(){},addEventListener(){}});
    h.api.initMap();
    await h.context.refreshForTest();
    assert.equal(h.element('incidentCountBadge').textContent,1);
    assert.equal(h.element('incidentChips').children[0].children.length,1);
    assert.equal(h.requests[0].searchParams.get('returnGeometry'),'false');
    assert.equal(h.requests[0].searchParams.get('outFields'),'incident,Live');
    await h.context.refreshForTest();
    assert.equal(h.element('incidentCountBadge').textContent,0);
    assert.equal(h.element('incidentChips').children.length,0);
    assert.notEqual(h.requests[0].searchParams.get('_ts'),h.requests[1].searchParams.get('_ts'));
  });
}
test('inactive zone records cannot populate selected incident cards',async()=>{
  const h=harness('evac.html',[{features:[{attributes:{incident:'Current Incident',Live:0,STATUS:'Go',zonename:'Inactive zone'}}]}]);
  await h.api.loadEvacuationZones();
  assert.match(h.element('evacRow').innerHTML,/No Active Zones/);
  assert.ok(h.requests[0].searchParams.get('_ts'));
});
test('inactive resource responses are verified from actual flags',async()=>{
  const h=harness('evac.html',[{features:[{attributes:{incident:'Current Incident',Live:0}}]}]);
  await h.api.loadIncidentStatus();
  assert.match(h.element('incidentPanel').innerHTML,/No Active Incident/);
  assert.equal(h.requests.length,1);
});
