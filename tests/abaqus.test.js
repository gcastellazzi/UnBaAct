import test from 'node:test';
import assert from 'node:assert/strict';
import { extrudeMesh, blockOutline, weightsAtDepth } from '../src/abaqus-mesh.js';
import { abaqusInput, abaqusModel } from '../src/abaqus.js';
import { hexCornerJacobian, wedgeVolume } from '../src/vendor/alotia-mesh.js';
import { settlementExample } from '../src/settlement-examples.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const scene={config:{boundary:'free',thickness:.3,materialDensity:1800,friction:.6,bounds:{left:0,right:4,bottom:0,top:3}},
  particles:[{id:1,shape:'rectangle',x:1,y:.5,width:2,height:1,load:120,loadX:30}]};

test('extrusion conserves volume, first moments and positive Jacobians for regular and concave outlines',()=>{
  for(const outline of [[[0,0],[2,0],[2,1],[0,1]],[[0,0],[2,0],[0,1]],[[0,0],[2,0],[2,1],[1,1],[1,2],[0,2]],[[0,0],[2,0],[1.6,1],[.1,.8]]]) {
    for(const refinement of [1,2,4]) {
      const m=extrudeMesh(outline,.3,{refinement,through:3});
      close(m.nodeWeights.reduce((a,b)=>a+b,0),m.volume);
      close(m.nodeWeights.reduce((a,w,i)=>a+w*m.nodes[i][1],0),0);
      for(const e of m.elements) assert.ok((e.type==='C3D8'?hexCornerJacobian: wedgeVolume)(e.ids.map(id=>m.nodes[id-1]))>0);
      assert.ok(m.exterior.length>0);
    }
  }
  const m=extrudeMesh([[0,0],[2,0],[2,1],[0,1]],.3);
  assert.ok(m.elements.every(e=>e.type==='C3D8'));
  close(m.nodeWeights.reduce((s,w,i)=>s+w*m.nodes[i][0],0),.6);
  close(m.nodeWeights.reduce((s,w,i)=>s+w*m.nodes[i][2],0),.3);
});
test('leaves conserve or repeat mass, preserve total concentrated loads and touch at their faces',()=>{
  for(const mode of ['divide','repeat']) {
    const m=abaqusModel(scene,{leaves:3,leafMode:mode});
    const blocks=m.parts.filter(p=>p.kind==='block'),factor=mode==='divide'?1:3;
    close(blocks.reduce((s,p)=>s+p.density*p.mesh.volume,0),1080*factor);
    close(blocks.reduce((s,p)=>s+p.loadZ,0),-120);
    close(blocks.reduce((s,p)=>s+p.loadX,0),30);
    close(Math.max(...blocks[0].mesh.nodes.map(p=>p[1])),Math.min(...blocks[1].mesh.nodes.map(p=>p[1])));
    assert.equal(new Set(blocks.map(p=>p.name)).size,3);
    close(m.totalDepth,.3*factor);
  }
  close(abaqusModel(scene,{leaves:3,gap:.01}).totalDepth,.32);
});
test('floor, cup and discrete supports fix only back faces, leave masonry free and preserve group friction',()=>{
  for(const boundary of ['free','cup','supports']) {
    const m=abaqusModel({...scene,config:{...scene.config,boundary,leftWall:true,rightWall:false}});
    assert.equal(m.parts.filter(p=>p.fixed).length,boundary==='free'?1:2);
    assert.ok(!m.parts[0].fixed);
    for(const p of m.parts.filter(p=>p.fixed)) {
      assert.ok(p.fixed.length<p.mesh.nodes.length);close(p.young/m.parts[0].young,1000);
    }
  }
  const result=abaqusInput({...scene,config:{...scene.config,groups:[{id:'stone',friction:.2}]},particles:[{...scene.particles[0],group:'stone'}]});
  assert.match(result.text,/\*Friction\n0.4\n/);
  assert.doesNotMatch(result.text,/P1_I\.NODES, [13],/);
  assert.match(abaqusInput(scene,{planar:true}).text,/P1_I.NODES, 2, 2, 0./);
});
test('all localized soil cases preserve stiffness and their complementary rigid patches',()=>{
  for(const zone of ['center','left','right']) for(const model of ['winkler','pasternak']) {
    const input=settlementExample('staggered',zone);input.config.elasticBase.model=model;
    const m=abaqusModel(input),b=m.base;
    assert.equal(m.parts.filter(p=>p.kind==='patch').length,zone==='center'?2:1);
    // Reconstruct the positive spring energy with auxiliary second differences.
    const u=Array.from({length:b.n},(_,i)=>Math.sin(i+.3));
    let energy=b.spring*u.reduce((s,v)=>s+v*v,0);
    for(let i=0;i<b.n-1;i++)energy+=b.shear*(u[i+1]-u[i])**2;
    for(let i=0;i<b.n-2;i++)energy+=b.p.EI/b.h**3*(u[i]-2*u[i+1]+u[i+2])**2;
    close(energy,b.K.reduce((s,row,i)=>s+u[i]*row.reduce((t,k,j)=>t+k*u[j],0),0));
    const result=abaqusInput(input);
    assert.match(result.text,/STRIPS, PATCHES/);assert.match(result.text,/type=SPRING1/);assert.match(result.text,/elset=BEND_1/);
    if(model==='pasternak') assert.match(result.text,/type=SPRING2/);
    assert.match(result.text,/type=DASHPOT1/);
  }
});
test('custom leaves and concentrated load selection preserve resultant and its exact eccentricity on diatoni',()=>{
  for(const loadLeaf of ['all',1,2,3]) {
    const m=abaqusModel(scene,{leaves:3,leafMode:'custom',leafThicknesses:[.1,.2,.15],loadLeaf,bondPercent:100});
    const p=m.parts[0];assert.equal(p.firstLeaf,1);assert.equal(p.lastLeaf,3);
    assert.equal(m.parts.filter(p=>p.kind==='block').length,1);close(p.loadZ,-120);
    const target=loadLeaf==='all'?0:m.layout.layers[loadLeaf-1].center;
    let resultant=0,moment=0;
    for(const load of p.loads) weightsAtDepth(p.mesh,load.depth).forEach((w,i)=>{
      resultant+=w*load.z;moment+=w*load.z*p.mesh.nodes[i][1];
    });
    close(resultant,-120);close(moment,-120*target);
    close(p.density*p.mesh.volume,1800*2*.45);
  }
  assert.throws(()=>abaqusModel(scene,{leaves:3,leafMode:'custom',leafThicknesses:[.1,.2]}),/Specify 3/);
  assert.throws(()=>abaqusModel(scene,{leaves:2,loadLeaf:3}),/existing leaf/);
});
test('seeded partial through stones cover every site exactly once per leaf with no double mass',()=>{
  const input=settlementExample();input.config.elasticBase=null;
  const opts={leaves:4,bondPercent:40,bondMode:'pair',bondSeed:73};
  const m=abaqusModel(input,opts), repeat=abaqusModel(input,opts);
  assert.deepEqual(m.layout,repeat.layout);
  const blocks=m.parts.filter(p=>p.kind==='block'), bonded=blocks.filter(p=>p.bonded);
  assert.equal(bonded.length,Math.round(input.particles.length*.4));
  assert.ok(new Set(bonded.map(p=>p.firstLeaf)).size>1);
  for(const s of input.particles) for(let leaf=1;leaf<=4;leaf++) assert.equal(blocks.filter(p=>p.block===s.id&&p.firstLeaf<=leaf&&p.lastLeaf>=leaf).length,1);
  const baseline=abaqusModel(input,{leaves:4});
  close(blocks.reduce((sum,p)=>sum+p.density*p.mesh.volume,0),baseline.parts.filter(p=>p.kind==='block').reduce((sum,p)=>sum+p.density*p.mesh.volume,0));
});
test('disks preserve analytic mass and irregular settlement blocks all mesh without tetrahedra',()=>{
  const m=abaqusModel({...scene,particles:[{id:1,shape:'disk',x:1,y:1,r:.5}]});
  close(m.parts[0].density*m.parts[0].mesh.volume,Math.PI*.25*.3*1800);
  const result=abaqusInput(settlementExample('irregular'));
  assert.ok(result.stats.hex>0);assert.ok(result.stats.wedge>0);assert.doesNotMatch(result.text,/C3D4/);
});
test('ties are duplicated within each leaf and tension stops use absolute rest length',()=>{
  const s={...scene,particles:[...scene.particles,{...scene.particles[0],id:2,x:3}],ties:[{a:1,b:2,anchorA:{x:0,y:0},anchorB:{x:0,y:0},length:2.1,tension:true}]};
  const m=abaqusModel(s,{leaves:2});assert.equal(m.ties.length,2);
  for(const t of m.ties) assert.equal(t.a.leaf,t.b.leaf);
  assert.match(abaqusInput(s).text,/\*Connector Stop, component=1\n, 2.1/);
  s.ties[0].tension=false;
  assert.match(abaqusInput(s).text,/\*Connector Motion, type=DISPLACEMENT\nTIE_1, 1, 0.1/);
});
test('invalid or empty models fail explicitly',()=>{
  assert.throws(()=>abaqusInput({particles:[]}),/Add blocks/);
  for(const options of [{leaves:1.5},{through:0},{young:NaN},{gap:-1},{refinement:3}]) assert.throws(()=>abaqusInput(scene,options));
  assert.throws(()=>blockOutline({shape:'polygon',x:0,y:0,vertices:[0,0,1,1,0,1,1,0]}),/crosses/);
});
test('deformed soil retains its reference level through a constant initial force',()=>{
  const scene=settlementExample('stacked','left');
  const m=abaqusModel(scene);
  scene.baseState=Array.from({length:m.base.n},()=>({y:m.base.p.top-m.base.p.depth/2-.01,vy:0}));
  const r=abaqusInput(scene);
  assert.match(r.text,/\*Cload, amplitude=SOIL_INITIAL/);
  const data=r.text.split('*Cload, amplitude=SOIL_INITIAL\n')[1].split('\n*')[0];
  close(data.trim().split('\n').reduce((sum,row)=>sum+Number(row.split(',')[2]),0),m.base.n*m.base.spring*.01);
});
