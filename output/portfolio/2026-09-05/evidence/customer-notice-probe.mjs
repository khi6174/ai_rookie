import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
const server=await createServer({configFile:false,cacheDir:'tmp/portfolio-review/vite-cache',optimizeDeps:{noDiscovery:true,include:[],entries:[]},server:{middlewareMode:true,watch:null},appType:'custom'});
try {
 const op=await server.ssrLoadModule('/src/application/operations/index.ts');
 const {bundledDailyOperationsPackage:pack}=await server.ssrLoadModule('/src/adapters/fixtures/syntheticOperationsPackage.ts');
 const snapshot=await op.createDailyOperationsSnapshot(pack,{createdAt:'2026-07-27T00:00:00.000Z'});
 const fleet=op.evaluateOperationsFleet(snapshot);
 let findings=[];
 for(const item of fleet.supportQueue){
  let ws=op.initializeOperationsDecision(op.createOperationsDecisionWorkspace(snapshot,fleet),snapshot,fleet,item.decisionId);
  const art=ws.decisions[0];
  const transfer=art.candidates.find(c=>c.actions.some(a=>a.type==='TRANSFER_STOPS') && art.evaluations.some(e=>e.candidateId===c.candidateId&&e.feasibility.status==='FEASIBLE'));
  if(!transfer)continue;
  ws=op.selectOperationsDecisionCandidate(ws,{decisionId:item.decisionId,candidateId:transfer.candidateId});
  for(const req of ws.decisions[0].decision.consentRequirements.filter(x=>x.required)) ws=op.respondToOperationsDecision(ws,{decisionId:item.decisionId,courierId:req.courierId,response:'CONSENTED'});
  const applied=op.approveAndApplyOperationsDecision(ws,item.decisionId);
  const notices=Object.values(applied.workspace.store.customerNoticeDrafts);
  const action=transfer.actions.find(a=>a.type==='TRANSFER_STOPS');
  const moved=action.stopIds.map(id=>{const before=snapshot.fixture.stops.find(s=>s.stopId===id);const after=applied.workspace.store.activePlan.stops.find(s=>s.stopId===id);return {id,beforeEta:before.expectedArrivalAt,afterEta:after.expectedArrivalAt,beforePlan:before.planId,afterPlan:after.planId,noticePresent:notices.some(n=>n.stopId===id)};});
  findings.push({status:applied.status,source:action.sourceCourierId,recipient:action.recipientCourierId,moved,noticeCount:notices.length,firstNotice:notices[0]&&{updatedEta:notices[0].updatedEta,message:notices[0].message,localTime:new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(notices[0].updatedEta))}});
  break;
 }
 await writeFile('tmp/portfolio-review/customer-notice-probe.json',JSON.stringify(findings,null,2));
 console.log(JSON.stringify(findings,null,2));
} finally {await server.close();}

