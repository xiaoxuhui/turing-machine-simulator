import {createServer} from 'vite';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const exe=process.argv[2];if(!exe)throw new Error('Usage: node scripts/verify-rule110-golly.mjs /path/to/bgolly');
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const {textWord}=await server.ssrLoadModule('/src/rule110-word.ts');
 const {compileToRule110}=await server.ssrLoadModule('/src/rule110-compiler.ts');
 const {exportRule110Macrocell,exportRule110Rle}=await server.ssrLoadModule('/src/rule110-golly.ts');
 const {rule110Rows}=await server.ssrLoadModule('/src/rule110.ts');
 const directory=path.resolve('.vite/rule110-golly-native');await mkdir(directory,{recursive:true});
 const compiled=compileToRule110({input:'11',blankSymbol:'_',initialState:'q0',haltStates:'H',acceptStates:'T',rejectStates:'F',rules:'q0,1->q0,1,R\nq0,_->H,1,N'});
 const cases=[['synthetic',{left:textWord('101'),center:textWord('10011001000001110110010000011101'),right:textWord('001101')}],['compiled',compiled]];
 const width=24,steps=12,report=[];
 for(const topology of ['unbounded','cylinder'])for(const [id,initial]of cases)for(const [format,make,y]of [['mc',exportRule110Macrocell,1],['rle',exportRule110Rle,0]]){
  const exported=make(initial,{origin:0n,width,steps,topology});const file=path.join(directory,id+'-'+topology+'.'+format);await writeFile(file,exported.text);const expected=[...rule110Rows(initial,0n,width,steps)].flatMap(row=>[...row]);
  const commands=[];for(let t=0;t<=steps;t++){if(t)commands.push('step 1');for(let x=0;x<width;x++)commands.push('get '+(Number(exported.originX)+steps+x)+' '+(y+t));}
  const result=spawnSync(exe,['-a','HashLife','--exec','-',file],{input:commands.join('\n')+'\n',encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(result.status,0,id+'/'+format+': '+result.stdout+' '+result.stderr+' '+result.error);const actual=[...result.stdout.matchAll(/At (-?\d+),(-?\d+) -> (\d+)/g)].map(m=>Number(m[3]));assert.deepEqual(actual,expected,id+'/'+format+' all cells/all generations');report.push({case:id,topology,rule:exported.rule,format,cellsChecked:actual.length,compressionNodes:exported.nodes});if(format==='rle'){const q=spawnSync(exe,['-a','QuickLife','--exec','-',file],{input:commands.join('\n')+'\n',encoding:'utf8',timeout:60000,windowsHide:true});assert.equal(q.status,0,q.stderr);const values=[...q.stdout.matchAll(/At (-?\d+),(-?\d+) -> (\d+)/g)].map(m=>Number(m[3]));assert.deepEqual(values,expected,id+'/QuickLife');report.push({case:id,topology,rule:exported.rule,format:'rle/QuickLife',cellsChecked:values.length});}
 }
 console.log(JSON.stringify({officialGollyEngine:true,rule:'W110',reports:report},null,2));
}finally{await server.close();}
