const {chromium}=require('D:/soft/game-hub/node_modules/playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const server=http.createServer((req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/turing-machine-simulator(?=\/)/,'');const p=path.resolve(root,'.'+name);if(!p.startsWith(root+path.sep))throw Error('path');const body=fs.readFileSync(p),t={'.js':'application/javascript','.html':'text/html','.css':'text/css'};res.writeHead(200,{'Content-Type':t[path.extname(p)]||'application/octet-stream'});res.end(body);}catch{res.writeHead(404).end()}});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const raw='q0,_->q1,_,R\nq1,□->HALT,1,N', key='turing-machine-simulator.campaign.v1', saved=JSON.stringify({version:1,completedLevelIds:[],drafts:{'write-one':raw}});
 await page.addInitScript(({key,saved})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,saved)},{key,saved});
 await page.goto(`http://127.0.0.1:${server.address().port}/campaign.html?level=write-one`);
 await page.waitForSelector('#rulesEditor');assert.equal(await page.locator('#rulesEditor').inputValue(),raw);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),saved);
 assert.match(await page.locator('#editorError').textContent(),/原草稿已保留/);await page.locator('#transferRules').click();assert.match(await page.locator('#rulesTransferStatus').textContent(),/原草稿已保留/);
 await page.reload();assert.equal(await page.locator('#rulesEditor').inputValue(),raw);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),saved);assert.deepEqual(errors,[]);
 console.log('PASS: conflicting legacy draft stays byte-for-byte, warns and cannot transfer unsafely');
 }finally{await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
