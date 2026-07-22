const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { DatabaseSync } = require("node:sqlite");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "Codex-PhotogalleryV1-CollectionRecycle-"));
const photos = path.join(root, "photos"), trash = path.join(root, "trash"), data = path.join(root, "data");
const port = 49200 + Math.floor(Math.random() * 500);
function file(relative) { const target=path.join(photos,relative); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,"test"); }
file("Parent/Leaf/a.jpg"); file("Parent/Leaf/b.mp4"); file("Parent/WithTxt/a.jpg"); file("Parent/WithTxt/readme.txt"); file("Parent/Container/Sub/a.jpg"); file("Parent/Heic/a.heic");
let child;
const base=`http://127.0.0.1:${port}`;
async function request(url, options={}) { const response=await fetch(base+url,{...options,headers:{Origin:base,"Content-Type":"application/json",...(options.headers||{})}}); let body={}; try{body=await response.json();}catch{} return {response,body}; }
async function waitFor(predicate, timeout=10000) { const started=Date.now(); while(Date.now()-started<timeout){ if(await predicate()) return; await new Promise(r=>setTimeout(r,80)); } throw new Error("Timed out"); }
function start() { child=spawn(process.execPath,[path.join(__dirname,"..","server.js")],{env:{...process.env,NODE_ENV:"test",PORT:String(port),HOST:"127.0.0.1",PHOTOS_DIR:photos,TRASH_DIR:trash,DATA_DIR:data,REMOTE_ADMIN_ENABLED:"1",REMOTE_ADMIN_CIDRS:"lan:192.168.31.0/24,zerotier:192.168.192.0/24",REMOTE_ADMIN_ORIGINS:base,COLLECTION_RECYCLE_TEST_INTERVAL_MS:"100",DAILY_INDEX_SCAN_ENABLED:"0",ENABLE_IMAGE_PREVIEW_GENERATION:"0"},stdio:["ignore","pipe","pipe"],windowsHide:true}); }
async function stop(){ if(!child)return; child.kill(); await new Promise(r=>child.once("close",r)); child=null; }

(async()=>{ try {
  start(); await waitFor(async()=>{try{return (await fetch(base+"/api/config")).ok}catch{return false}});
  let result=await request("/api/scan",{method:"POST",body:"{}"}); assert.equal(result.response.status,200);
  await waitFor(async()=> (await request("/api/scan/status")).body.status === "completed",20000);
  result=await request("/api/admin/capabilities",{headers:{"X-Forwarded-For":"10.10.10.10"}}); assert.equal(result.body.scope,"local"); assert.equal(result.body.sourceAddress,"127.0.0.1");
  assert.equal(result.body.canRunImageLookup,true); assert.equal(result.body.canRunSimilarityIndex,true); assert.equal(result.body.canRunVideoCompatibilityCheck,true);
  const badOrigin=await fetch(base+"/api/scan",{method:"POST",headers:{Origin:"http://evil.invalid"}}); assert.equal(badOrigin.status,403);
  for (const [url,method] of [["/api/image-hash-lookup","POST"],["/api/perceptual-index/start","POST"],["/api/video-compatibility/scan/start","POST"],["/api/video-compatible/stop","POST"],["/api/video-compatible?id=missing","GET"]]) {
    const denied=await fetch(base+url,{method,headers:{Origin:"http://evil.invalid"}}); assert.equal(denied.status,403,`${url} must use the shared admin authorizer`);
  }
  assert.equal((await request("/api/collection-recycle/status?collectionId=Parent%2FLeaf")).body.eligible,true);
  assert.equal((await request("/api/collection-recycle/status?collectionId=Parent")).body.eligible,false);
  assert.equal((await request("/api/collection-recycle/status?collectionId=Parent%2FWithTxt")).body.reason,"contains-non-media");
  assert.equal((await request("/api/collection-recycle/status?collectionId=Parent%2FHeic")).body.eligible,true);
  result=await request("/api/collection-recycle/mark",{method:"POST",body:JSON.stringify({collectionId:"Parent/Leaf"})}); assert.equal(result.response.status,200);
  assert.ok(Date.parse(result.body.item.scheduledAt)-Date.parse(result.body.item.markedAt)>=3600000);
  await stop(); start(); await waitFor(async()=>{try{return (await request("/api/collection-recycle/status?collectionId=Parent%2FLeaf")).body.item?.status==="pending"}catch{return false}});
  result=await request("/api/collection-recycle/cancel",{method:"POST",body:JSON.stringify({collectionId:"Parent/Leaf"})}); assert.equal(result.body.cancelled,1);
  fs.mkdirSync(path.join(trash,"Parent","Leaf"),{recursive:true});
  result=await request("/api/collection-recycle/mark",{method:"POST",body:JSON.stringify({collectionId:"Parent/Leaf"})}); assert.equal(result.response.status,200);
  const db=new DatabaseSync(path.join(data,"gallery.db")); db.prepare("UPDATE collection_recycle_queue SET scheduled_at=? WHERE id=?").run(new Date(Date.now()-1000).toISOString(),result.body.item.id); db.close();
  await waitFor(()=>!fs.existsSync(path.join(photos,"Parent","Leaf")),10000);
  assert.ok(fs.readdirSync(path.join(trash,"Parent")).some(name=>name.startsWith("Leaf.__recycle_")));
  const queue=(await request("/api/collection-recycle/queue?pageSize=10")).body; assert.ok(queue.items.some(item=>item.status==="conflict-renamed"));
  console.log("COLLECTION_RECYCLE_TEST=PASS");
} finally { await stop(); fs.rmSync(root,{recursive:true,force:true}); console.log(`TEMP_ROOT_EXISTS=${fs.existsSync(root)}`); } })().catch(error=>{console.error(error);process.exitCode=1});
