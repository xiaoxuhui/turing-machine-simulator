/* Adapted from xiaoxuhui/logic-circuit.
MIT License

Copyright (c) 2026 xiaoxuhui

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

  'use strict';

  const STEP_KEY = 2 ** 28;
  const MAX_NODES = 8_000_000;

  class World {
    constructor(points) {
      this.children = new Uint32Array(4096);
      this.levels = new Uint8Array(1024);
      this.full = new Uint32Array(1024);
      this.table = new Uint32Array(2048);
      this.partial = new Map();
      this.count = 2;
      this.empty = [0];
      this.generation = 0;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x,y] of points) {
        minX = Math.min(minX,x); minY = Math.min(minY,y);
        maxX = Math.max(maxX,x); maxY = Math.max(maxY,y);
      }
      if (!points.length) minX = minY = maxX = maxY = 0;
      const level = Math.max(3, Math.ceil(Math.log2(Math.max(maxX-minX,maxY-minY)+1))+1);
      const half = 2 ** (level-1);
      this.x = Math.floor((minX+maxX)/2)-half;
      this.y = Math.floor((minY+maxY)/2)-half;
      this.root = this.seed(points,0,points.length,level,this.x,this.y);
      this.bounds = { minX, minY, maxX, maxY };
    }

    hash(a,b,c,d) {
      const h = Math.imul(a,0x85ebca6b) ^ Math.imul(b,0xc2b2ae35) ^ Math.imul(c,0x27d4eb2d) ^ Math.imul(d,0x165667b1);
      return (h ^ h >>> 16) & (this.table.length-1);
    }

    join(a,b,c,d) {
      let slot = this.hash(a,b,c,d), id;
      while ((id=this.table[slot])) {
        const q=id*4, cells=this.children;
        if(cells[q]===a&&cells[q+1]===b&&cells[q+2]===c&&cells[q+3]===d)return id;
        slot=(slot+1)&(this.table.length-1);
      }
      if(this.count>=MAX_NODES)throw Error('当前图案的演化缓存已满，可以重置后继续模拟。');
      id=this.count++;
      if(id===this.levels.length){
        const children=new Uint32Array(this.children.length*2),levels=new Uint8Array(id*2),full=new Uint32Array(id*2);
        children.set(this.children);levels.set(this.levels);full.set(this.full);
        this.children=children;this.levels=levels;this.full=full;
      }
      const q=id*4,cells=this.children;
      cells[q]=a;cells[q+1]=b;cells[q+2]=c;cells[q+3]=d;
      this.levels[id]=this.levels[a]+1;
      this.table[slot]=id;
      if(this.count*10>this.table.length*7){
        this.table=new Uint32Array(this.table.length*2);
        const cells=this.children,mask=this.table.length-1;
        for(let item=2;item<this.count;item++){
          const q=item*4;let at=this.hash(cells[q],cells[q+1],cells[q+2],cells[q+3]);
          while(this.table[at])at=(at+1)&mask;
          this.table[at]=item;
        }
      }
      return id;
    }

    blank(level) {
      while(this.empty.length<=level){const q=this.empty.at(-1);this.empty.push(this.join(q,q,q,q));}
      return this.empty[level];
    }

    seed(points, start, end, level, x, y) {
      if(start===end)return this.blank(level);
      if(level===0)return 1;
      const half=2**(level-1);
      const partition=(first,last,axis,limit)=>{
        for(let i=first;i<last;i++)if(points[i][axis]<limit){const p=points[i];points[i]=points[first];points[first++]=p;}
        return first;
      };
      const bottom=partition(start,end,1,y+half);
      const topRight=partition(start,bottom,0,x+half),bottomRight=partition(bottom,end,0,x+half);
      return this.join(this.seed(points,start,topRight,level-1,x,y),this.seed(points,topRight,bottom,level-1,x+half,y),
        this.seed(points,bottom,bottomRight,level-1,x,y+half),this.seed(points,bottomRight,end,level-1,x+half,y+half));
    }

    center(id) {
      const q=this.children,i=id*4;
      return this.join(q[q[i]*4+3],q[q[i+1]*4+2],q[q[i+2]*4+1],q[q[i+3]*4]);
    }

    surround(id) {
      const level=this.levels[id],e=this.blank(level-1),q=this.children,i=id*4;
      return this.join(this.join(e,e,e,q[i]),this.join(e,e,q[i+1],e),this.join(e,q[i+2],e,e),this.join(q[i+3],e,e,e));
    }

    evolve(id, steps) {
      // A level-n square can evolve its central half by up to 2^(n-2) generations.
      if(!steps)return this.center(id);
      const level=this.levels[id];
      if(id===this.blank(level))return this.empty[level-1];
      const limit=2**(level-2),whole=steps===limit,key=id*STEP_KEY+steps;
      const hit=whole?this.full[id]:this.partial.get(key);
      if(hit)return hit;
      const q=this.children,i=id*4,a=q[i]*4,b=q[i+1]*4,c=q[i+2]*4,d=q[i+3]*4;
      let result;
      if(level===2){
        const grid=[q[a],q[a+1],q[b],q[b+1],q[a+2],q[a+3],q[b+2],q[b+3],q[c],q[c+1],q[d],q[d+1],q[c+2],q[c+3],q[d+2],q[d+3]];
        const cell=j=>{
          const n=grid[j-5]+grid[j-4]+grid[j-3]+grid[j-1]+grid[j+1]+grid[j+3]+grid[j+4]+grid[j+5];
          return Number(n===3||(n===2&&grid[j]));
        };
        result=this.join(cell(5),cell(6),cell(9),cell(10));
      }else{
        const first=steps>limit/2?limit/2:0,next=steps-first;
        const m0=this.evolve(a/4,first),m1=this.evolve(this.join(q[a+1],q[b],q[a+3],q[b+2]),first),m2=this.evolve(b/4,first);
        const m3=this.evolve(this.join(q[a+2],q[a+3],q[c],q[c+1]),first),m4=this.evolve(this.center(id),first),m5=this.evolve(this.join(q[b+2],q[b+3],q[d],q[d+1]),first);
        const m6=this.evolve(c/4,first),m7=this.evolve(this.join(q[c+1],q[d],q[c+3],q[d+2]),first),m8=this.evolve(d/4,first);
        result=this.join(this.evolve(this.join(m0,m1,m3,m4),next),this.evolve(this.join(m1,m2,m4,m5),next),
          this.evolve(this.join(m3,m4,m6,m7),next),this.evolve(this.join(m4,m5,m7,m8),next));
      }
      if(whole)this.full[id]=result;
      else this.partial.set(key,result);
      return result;
    }

    advance(steps) {
      let {root,x,y}=this;
      // Keep the complete live region at least `steps` cells from the edge of the result.
      while(2**(this.levels[root]-2)<=steps||this.surround(this.center(root))!==root){
        const half=2**(this.levels[root]-1);
        root=this.surround(root);x-=half;y-=half;
      }
      this.root=this.evolve(this.surround(root),steps);
      this.x=x;this.y=y;this.generation+=steps;
    }

    get(x,y) {
      let id=this.root,level=this.levels[id];
      x-=this.x;y-=this.y;
      if(x<0||y<0||x>=2**level||y>=2**level)return 0;
      while(level){const half=2**(--level),dx=Number(x>=half),dy=Number(y>=half);id=this.children[id*4+dx+2*dy];x-=dx*half;y-=dy*half;}
      return id;
    }

    set(x,y,value) {
      while (x < this.x || y < this.y || x >= this.x + 2**this.levels[this.root] || y >= this.y + 2**this.levels[this.root]) {
        const half = 2**(this.levels[this.root]-1); this.root=this.surround(this.root); this.x-=half; this.y-=half;
      }
      const write=(id,level,left,top)=>{
        if(!level)return value;
        const half=2**(level-1),dx=Number(x>=left+half),dy=Number(y>=top+half),i=id*4;
        const q=Array.from(this.children.subarray(i,i+4));
        q[dx+2*dy]=write(q[dx+2*dy],level-1,left+dx*half,top+dy*half);
        return this.join(...q);
      };
      this.root=write(this.root,this.levels[this.root],this.x,this.y);
    }

    view({ left, top, right, bottom, block }) {
      const points=[],q=this.children,empty=this.empty;
      const scan=(id,level,x,y,size)=>{
        if(id===empty[level]||x>=right||x+size<=left||y>=bottom||y+size<=top)return;
        if(size<=block){points.push(x,y);return;}
        const half=size/2,i=id*4;
        scan(q[i],level-1,x,y,half);scan(q[i+1],level-1,x+half,y,half);
        scan(q[i+2],level-1,x,y+half,half);scan(q[i+3],level-1,x+half,y+half,half);
      };
      const level=this.levels[this.root];
      scan(this.root,level,this.x,this.y,2**level);
      return Float64Array.from(points);
    }
  }


export { World };
