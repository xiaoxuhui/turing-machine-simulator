import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const executable=process.argv[2];
if(!executable)throw new Error('Usage: node scripts/verify-life-golly.mjs /path/to/bgolly');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
 const {compileMachineLife,readLifeMachine}=await server.ssrLoadModule('/src/life-machine.ts');
 const {lifeRLE}=await server.ssrLoadModule('/src/life-format.ts');
 const {LIFE_SHAPES}=await server.ssrLoadModule('/src/life.ts');
 const pattern=compileMachineLife({input:'',blankSymbol:'_',initialState:'q0',haltStates:'H',acceptStates:'T',rejectStates:'F',rules:'q0,_->H,1,N'},0,0);
 const directory=path.resolve('.vite/life-qa');await mkdir(directory,{recursive:true});const file=path.join(directory,'machine-native.rle');
 await writeFile(file,lifeRLE(pattern));
 const commands=[];for(let tick=0;tick<3;tick++){
  if(tick)commands.push('step '+pattern.machine.period);
  for(const p of pattern.ports)for(const [dx,dy]of LIFE_SHAPES.lwss)commands.push('get '+(p.x+dx)+' '+(p.y+dy));
 }
 const result=spawnSync(executable,['-a','HashLife','--exec','-',file],{input:commands.join('\n')+'\n',encoding:'utf8',windowsHide:true,timeout:90000,maxBuffer:2e6});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr+'\n'+result.error);
 const cells=[...result.stdout.matchAll(/At (-?\d+),(-?\d+) -> (\d+)/g)].map(m=>Number(m[3]));
 assert.equal(cells.length,pattern.ports.length*9*3);
 const decoded=[];let position=0;
 for(let tick=0;tick<3;tick++){
  const values=Object.fromEntries(pattern.ports.map(p=>{const ship=cells.slice(position,position+9);position+=9;return[p.id,Number(ship.every(Boolean))];}));
  decoded.push(readLifeMachine(pattern.machine,{generation:tick*pattern.machine.period,values}));
 }
 assert.equal(decoded[0].status,'运行中');assert.deepEqual(decoded[0].tape,['_']);
 for(const value of decoded.slice(1)){assert.equal(value.status,'停机');assert.equal(value.state,'H');assert.deepEqual(value.tape,['1']);}
 console.log(JSON.stringify({officialGollyEngine:true,rule:'B3/S23',period:pattern.machine.period,liveCells:pattern.cells.length,registerSamples:decoded},null,2));
} finally {await server.close();}
