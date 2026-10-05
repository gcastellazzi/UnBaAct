// Generate reviewable decks; Abaqus is optional and is not needed by the app.
import { mkdir, writeFile } from 'node:fs/promises';
import { abaqusInput } from '../src/abaqus.js';
import { settlementExample } from '../src/settlement-examples.js';
const output=new URL('../tmp/abaqus/',import.meta.url);await mkdir(output,{recursive:true});
const block={id:1,shape:'rectangle',x:.5,y:.5,width:1,height:1,load:100};
const simple={config:{boundary:'free',thickness:.3,materialDensity:1800,friction:.6,gravity:9.81,bounds:{left:0,right:1,bottom:0,top:2}},particles:[block]};
const elastic=structuredClone(simple);
elastic.config.elasticBase={...settlementExample().config.elasticBase,left:0,right:1,zone:'full',segments:6,model:'pasternak'};
const mixed=settlementExample('irregular','center');
const tied=structuredClone(simple);
tied.particles=Array.from({length:3},(_,i)=>({...block,id:i+1,x:(i+.5)/3,width:1/3,load:i===0?100:0}));
tied.ties=[0,1].map(i=>({a:i+1,b:i+2,anchorA:{x:0,y:0},anchorB:{x:0,y:0},length:1/3,tension:i===0}));
mixed.config.boundary='cup';mixed.config.leftWall=true;mixed.config.rightWall=false;mixed.config.elasticBase.model='pasternak';
mixed.ties=[{a:mixed.particles[0].id,b:mixed.particles[1].id,anchorA:{x:0,y:0},anchorB:{x:0,y:0},
  length:Math.hypot(mixed.particles[1].x-mixed.particles[0].x,mixed.particles[1].y-mixed.particles[0].y),tension:true},
  {a:mixed.particles[2].id,b:mixed.particles[3].id,anchorA:{x:0,y:0},anchorB:{x:0,y:0},
  length:Math.hypot(mixed.particles[3].x-mixed.particles[2].x,mixed.particles[3].y-mixed.particles[2].y)}];
for(const [name,scene,opt] of [['gravity',simple,{planar:true}],['elastic',elastic,{planar:true,duration:2}],
  ['eccentric',simple,{leaves:3,leafMode:'custom',leafThicknesses:[.1,.2,.15],bondPercent:100,loadLeaf:1}],
  ['tied',tied,{leaves:3,bondPercent:100,bondMode:'pair',loadLeaf:1}],
  ['mixed',mixed,{leaves:3,leafMode:'custom',leafThicknesses:[.1,.2,.15],bondPercent:35,bondMode:'pair',loadLeaf:2}]]) {
  const r=abaqusInput(scene,opt);await writeFile(new URL(`${name}.inp`,output),r.text);console.log(name,r.stats);
}
