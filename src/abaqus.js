import { blockOutline, extrudeMesh, weightsAtDepth } from './abaqus-mesh.js';
import { baseSystem } from './elastic-base.js';
import { masonry3DLayout } from './masonry-3d.js';

export const ABAQUS_DEFAULTS = { leaves:1, leafMode:'divide', gap:0, planar:false,
  refinement:2, through:2, circleSegments:32, young:30e9, poisson:.2, supportRatio:1000, duration:1,
  loadLeaf:'all', bondPercent:0, bondMode:'full', bondSeed:42 };
const number=(v)=>{
  if(!Number.isFinite(v)) throw Error('Non-finite value in Abaqus model.');
  return Number(v.toPrecision(12)).toString();
};
const rows=(ids)=>Array.from({length:Math.ceil(ids.length/12)},(_,i)=>ids.slice(i*12,i*12+12).join(', '));
const rect=(left,right,bottom,top)=>[[left,bottom],[right,bottom],[right,top],[left,top]];
const friction=(c,s)=>c.groups?.find(g=>g.id===s.group)?.friction??c.friction;

export function abaqusModel(scene, options={}) {
  const o={...ABAQUS_DEFAULTS,...options}, c={boundary:'cup',friction:.45,gravity:9.81,thickness:1,materialDensity:1,leftWall:true,rightWall:true,...scene.config};
  const range=(key,min,max,integer=false)=>{
    if(!Number.isFinite(o[key])||o[key]<min||o[key]>max||(integer&&!Number.isInteger(o[key]))) throw Error(`Invalid Abaqus ${key}.`);
  };
  range('leaves',1,20,true); range('through',1,32,true); range('young',1,1e15); range('poisson',0,.49);
  range('supportRatio',10,1e6); range('gap',0,10); range('duration',.001,1e6); range('circleSegments',8,48,true);
  range('bondPercent',0,100); range('bondSeed',0,4294967295,true);
  if(!['divide','repeat','custom'].includes(o.leafMode)||![1,2,4,8].includes(o.refinement)||!['full','pair'].includes(o.bondMode)) throw Error('Invalid Abaqus mesh or leaves mode.');
  if(o.loadLeaf!=='all'&&(!Number.isInteger(o.loadLeaf)||o.loadLeaf<1||o.loadLeaf>o.leaves)) throw Error('Choose an existing leaf for the applied load.');
  if(!scene.particles?.length) throw Error('Add blocks before exporting Abaqus.');
  if(!(c.thickness>0&&c.materialDensity>0&&c.gravity>=0) || ![c.thickness,c.materialDensity,c.gravity,c.friction].every(Number.isFinite)) throw Error('Invalid scene material or gravity.');
  const layout=masonry3DLayout(scene.particles,c.thickness,o);
  const {solidThickness,totalDepth}=layout;
  const parts=[], byBlock=new Map(), warnings=[];
  let nodes=0, elements=0;
  const add=(outline,depth,meta={})=>{
    const mesh=extrudeMesh(outline,depth,{refinement:o.refinement,through:o.through*(meta.lastLeaf?meta.lastLeaf-meta.firstLeaf+1:1),offset:meta.offset??0});
    nodes+=mesh.nodes.length; elements+=mesh.elements.length;
    if(nodes>500000||elements>300000) throw Error('Export exceeds 500,000 nodes or 300,000 solid elements. Reduce refinement or leaves.');
    const part={name:`P${parts.length+1}`,mesh,mu:c.friction,density:c.materialDensity,young:o.young,...meta};
    if(!Number.isFinite(part.mu)||part.mu<0) throw Error('Invalid contact friction.');
    parts.push(part);return part;
  };
  for(const body of layout.bodies) {
    const {spec:s,index}=body;
    if(![s.x,s.y,s.angle??0,s.load??0,s.loadX??0,s.actionForce?.x??0,s.actionForce?.y??0].every(Number.isFinite)) throw Error(`Invalid block ${index+1}.`);
    const loads=layout.layers.slice(body.firstLeaf-1,body.lastLeaf).filter(l=>o.loadLeaf==='all'||o.loadLeaf===l.index)
      .map(l=>({depth:l.center,x:(s.loadX??0)*(o.loadLeaf==='all'?l.thickness/solidThickness:1),z:-(s.load??0)*(o.loadLeaf==='all'?l.thickness/solidThickness:1)}));
    const actionX=(s.actionForce?.x??0)*body.depth/c.thickness,actionZ=(s.actionForce?.y??0)*body.depth/c.thickness;
    const p=add(blockOutline(s,o.circleSegments),body.depth,{...body,kind:'block',block:s.id??index+1,
      mu:friction(c,s),loads,actionX,actionZ,loadX:loads.reduce((sum,l)=>sum+l.x,actionX),loadZ:loads.reduce((sum,l)=>sum+l.z,actionZ)});
    // Preserve the particle mass when the browser supplies it (Rapier may remove
    // sliver collider pieces). Also preserve analytic disk mass after faceting.
    if(s.mass>0) p.density=s.mass*body.depth/c.thickness/p.mesh.volume;
    else if(s.shape==='disk') p.density=c.materialDensity*Math.PI*s.r*s.r*body.depth/p.mesh.volume;
    for(let leaf=body.firstLeaf;leaf<=body.lastLeaf;leaf++) byBlock.set(`${leaf}:${p.block}`,p);
  }
  const b={left:1,right:11,bottom:0,top:8,...c.bounds}, w=b.right-b.left;
  if(!(w>0&&b.top>b.bottom)) throw Error('Invalid scene bounds.');
  const support=(outline,label,axis,value,kind='support')=>{
    const p=add(outline,totalDepth,{kind,label,young:o.young*o.supportRatio});
    p.fixed=p.mesh.nodes.flatMap((v,i)=>Math.abs(v[axis]-value)<1e-8?[i+1]:[]);
    if(!p.fixed.length) throw Error('Support has no fixed back face.');
    return p;
  };
  let base=null;
  if(c.elasticBase) {
    base=baseSystem(c.elasticBase,c.thickness);
    base.factor=solidThickness/c.thickness;
    // A single transfer layer spans all leaves. Gaps contain no extra soil mass
    // or spring stiffness: the 2D law scales with material thickness only.
    base.parts=Array.from({length:base.n},(_,i)=>{
      const y=scene.baseState?.[i]?.y??base.p.top-base.p.depth/2;
      if(!Number.isFinite(y)) throw Error('Invalid foundation position.');
      const p=add(rect(base.left+i*base.h,base.left+(i+1)*base.h,y-base.p.depth/2,y+base.p.depth/2),totalDepth,
        {kind:'strip',label:`Elastic strip ${i+1}`,young:o.young*o.supportRatio,density:base.p.density*solidThickness/totalDepth});
      p.initialU=y-(base.p.top-base.p.depth/2);return p;
    });
    for(const patch of base.rigid) support(rect(patch.left,patch.right,base.p.top-.4,base.p.top),patch.label,2,base.p.top-.4,'patch');
  } else support(rect(b.left,b.right,b.bottom-.4,b.bottom),'Floor',2,b.bottom-.4);
  if(c.boundary==='cup') {
    if(c.leftWall) support(rect(b.left-.4,b.left,b.bottom,b.top),'Left wall',0,b.left-.4);
    if(c.rightWall) support(rect(b.right,b.right+.4,b.bottom,b.top),'Right wall',0,b.right+.4);
  } else if(c.boundary==='supports') {
    if(c.leftWall) support(rect(b.left+w*.1-.3,b.left+w*.1+.3,b.bottom,b.bottom+2),'Left support',2,b.bottom);
    if(c.rightWall) support(rect(b.right-w*.1-.3,b.right-w*.1+.3,b.bottom,b.bottom+2),'Right support',2,b.bottom);
  } else if(!['free','open'].includes(c.boundary)) throw Error('Unknown boundary configuration.');
  const ties=[];
  for(let leaf=1;leaf<=o.leaves;leaf++) for(const t of scene.ties??[]) {
    const a=byBlock.get(`${leaf}:${t.a}`),b=byBlock.get(`${leaf}:${t.b}`);
    if(!a||!b||a===b||!(t.length>0)) throw Error('Invalid tie endpoints or length.');
    const anchor=(p,v)=>{
      if(!v||![v.x,v.y].every(Number.isFinite)) throw Error('Invalid tie anchor.');
      const angle=p.spec.angle??0;
      return [p.spec.x+Math.cos(angle)*v.x-Math.sin(angle)*v.y,layout.layers[leaf-1].center,p.spec.y+Math.sin(angle)*v.x+Math.cos(angle)*v.y];
    };
    ties.push({a,b,p:anchor(a,t.anchorA),q:anchor(b,t.anchorB),length:t.length,tension:!!t.tension});
  }
  if(scene.particles.some(p=>p.shape==='disk')) warnings.push(`Disks are faceted with ${o.circleSegments} sides; their mass is preserved.`);
  warnings.push('Fresh analysis at the exported geometry: velocities, contact stresses and accumulated simulation history are not transferred.');
  if(base) warnings.push('Elastic transfer strips retain the app stiffness matrix, damping and vertical-only motion.');
  if(ties.length) warnings.push('Tie anchors use distributing couplings to each block; leaves have separate ties.');
  if(layout.bondedSites&&o.gap) warnings.push('Through stones fill the intervening gaps, adding actual masonry volume and mass.');
  return {o,c,parts,base,ties,nodes,elements,layout,leafThickness:layout.thicknesses[0],totalDepth,solidThickness,warnings};
}

export function abaqusInput(scene, options={}) {
  const m=abaqusModel(scene,options), {o,c,parts,base,ties}=m;
  const out=['*Heading','UnBaAct - extruded masonry with frictional support bodies',
    '** Units: m, kg, N, s, Pa. X=app x; Y=depth; Z=app y.',
    '** aLoTiA settings: Standard implicit quasi-static dynamics, hard normal contact, Coulomb friction.',
    `** Leaves=${o.leaves}; mode=${o.leafMode}; thicknesses=${m.layout.thicknesses.map(number).join(', ')}; envelope depth=${number(m.totalDepth)}`,
    `** Applied loads: ${o.loadLeaf==='all'?'all leaves, proportional to thickness':`leaf ${o.loadLeaf}`}; total applied force preserved.`,
    `** Bonded sites=${m.layout.bondedSites}/${scene.particles.length}; mode=${o.bondMode}; seed=${o.bondSeed}`,
    '** Independent blocks; through stones replace the corresponding leaf copies. No masonry node is fixed to its support.',
    ...m.warnings.map(w=>`** ${w}`),'*Preprint, echo=NO, model=NO, history=NO, contact=NO'];
  for(const p of parts) {
    out.push(`** ${p.kind==='block'?`Block ${p.block}, leaves ${p.firstLeaf}-${p.lastLeaf}`:p.label}`,`*Part, name=${p.name}`,'*Node');
    p.mesh.nodes.forEach((v,i)=>out.push(`${i+1}, ${v.map(number).join(', ')}`));
    for(const type of ['C3D8','C3D6']) {
      const es=p.mesh.elements.map((e,i)=>({...e,id:i+1})).filter(e=>e.type===type);
      if(es.length) out.push(`*Element, type=${type}, elset=SOLID`,...es.map(e=>`${e.id}, ${e.ids.join(', ')}`));
    }
    out.push('*Nset, nset=NODES, generate',`1, ${p.mesh.nodes.length}, 1`);
    if(p.fixed) out.push('*Nset, nset=FIXED',...rows(p.fixed));
    out.push('*Surface, type=ELEMENT, name=EXTERIOR',...p.mesh.exterior.map(f=>`${f.element}, ${f.side}`));
    out.push(`*Solid Section, elset=SOLID, material=M_${p.name}`,'','*End Part',`*Material, name=M_${p.name}`,
      '*Density',number(p.density),'*Elastic',`${number(p.young)}, ${number(o.poisson)}`);
  }
  out.push('*Assembly, name=ASSEMBLY');
  for(const p of parts) out.push(`*Instance, name=${p.name}_I, part=${p.name}`,'*End Instance');
  const ref=(p,id=1)=>`${p.name}_I.${id}`;
  const groups=new Map();
  for(const p of parts) {
    const key=number(p.mu);
    if(!groups.has(key)) groups.set(key,{name:`FRIC_${groups.size+1}`,parts:[]});
    groups.get(key).parts.push(p);
  }
  const surface=(name,list)=>{
    if(!list.length) return;
    out.push(`*Surface, type=ELEMENT, name=${name}`);
    for(const p of list) for(const f of p.mesh.exterior) out.push(`${p.name}_I.${f.element}, ${f.side}`);
  };
  for(const g of groups.values()) surface(g.name,g.parts);
  surface('SUPPORTS',parts.filter(p=>p.fixed));
  surface('PATCHES',parts.filter(p=>p.kind==='patch'));
  if(base) surface('STRIPS',base.parts);
  let element=0,assemblyNode=0;
  const spring=(name,a,b,k)=>{
    out.push(`*Element, type=${b?'SPRING2':'SPRING1'}, elset=${name}`,`${++element}, ${a}${b?`, ${b}`:''}`,
      `*Spring, elset=${name}`,b?'3, 3':'3',number(k));
  };
  if(base) {
    // Positive energy terms reproduce the app K exactly: k*u^2, G*(Du)^2,
    // EI*(D2u)^2. Auxiliary coordinates avoid artificial negative springs.
    for(let i=0;i<base.n;i++) {
      const p=base.parts[i];
      for(let id=2;id<=p.mesh.nodes.length;id++) out.push('*Equation','2',`${ref(p,id)}, 3, 1., ${ref(p)}, 3, -1.`);
      spring(`SOIL_${i+1}`,ref(p),null,base.spring*base.factor);
      if(base.damping>0) out.push(`*Element, type=DASHPOT1, elset=DAMP_${i+1}`,`${++element}, ${ref(p)}`,
        `*Dashpot, elset=DAMP_${i+1}`,'3',number(base.damping*base.factor));
      if(i+1<base.n&&base.shear) spring(`SHEAR_${i+1}`,ref(p),ref(base.parts[i+1]),base.shear*base.factor);
      if(i+2<base.n&&base.p.EI) {
        const id=++assemblyNode;
        out.push('*Node',`${id}, ${p.mesh.nodes[0].map(number).join(', ')}`,'*Equation','4',
          `${id}, 3, 1., ${ref(p)}, 3, -1., ${ref(base.parts[i+1])}, 3, 2., ${ref(base.parts[i+2])}, 3, -1.`);
        spring(`BEND_${i+1}`,id,null,base.p.EI/base.h**3*base.factor);
      }
    }
  }
  // A reference at each physical anchor distributes forces and moments to the
  // deformable block without tying its nodes rigidly to one another.
  ties.forEach((t,i)=>{
    t.name=`TIE_${i+1}`; t.element=++element;
    const first=assemblyNode+1;assemblyNode+=2;
    out.push('*Node',`${first}, ${t.p.map(number).join(', ')}`,`${first+1}, ${t.q.map(number).join(', ')}`);
    for(const [end,p] of [[0,t.a],[1,t.b]]) out.push(`*Surface, type=NODE, name=${t.name}_S${end}`,
      `${p.name}_I.NODES, 1.`,`*Coupling, constraint name=${t.name}_C${end}, ref node=${first+end}, surface=${t.name}_S${end}`,'*Distributing, coupling=CONTINUUM, rotational coupling=CONTINUUM','1, 6');
    out.push(`*Element, type=CONN3D2, elset=${t.name}`,`${t.element}, ${first}, ${first+1}`,
      `*Connector Section, elset=${t.name}${t.tension?`, behavior=${t.name}_BEHAVIOR`:''}`,'AXIAL');
  });
  out.push('*End Assembly');
  ties.forEach(t=>{if(t.tension) out.push(`*Connector Behavior, name=${t.name}_BEHAVIOR`,'*Connector Stop, component=1',`, ${number(t.length)}`);});
  const assignments=[], gs=[...groups.entries()];
  for(let i=0;i<gs.length;i++) for(let j=i;j<gs.length;j++) {
    const name=`CONTACT_${i+1}_${j+1}`;
    out.push(`*Surface Interaction, name=${name}`,'*Friction',number((+gs[i][0]+ +gs[j][0])/2),'*Surface Behavior, pressure-overclosure=HARD');
    assignments.push(`${gs[i][1].name}, ${gs[j][1].name}, ${name}`);
  }
  out.push('*Contact','*Contact Inclusions, ALL EXTERIOR','*Contact Exclusions');
  if(parts.some(p=>p.fixed)) out.push('SUPPORTS, SUPPORTS');
  if(base) {
    out.push('STRIPS, STRIPS');
    if(base.rigid.length) out.push('STRIPS, PATCHES');
  }
  out.push('*Contact Property Assignment',', , CONTACT_1_1',...assignments);
  out.push('*Boundary');
  for(const p of parts) {
    if(p.fixed) out.push(`${p.name}_I.FIXED, 1, 3, 0.`);
    else if(p.kind==='strip') out.push(`${p.name}_I.NODES, 1, 2, 0.`);
    else if(o.planar) out.push(`${p.name}_I.NODES, 2, 2, 0.`);
  }
  // At least one support exists unless the elastic layer spans the entire base.
  // Avoid an empty *Boundary card in the latter case (strips supply it).
  if(base) out.push('*Amplitude, name=SOIL_INITIAL',`0., 1., ${number(o.duration)}, 1.`);
  out.push('*Amplitude, name=LOAD_RAMP, definition=SMOOTH STEP',`0., 0., ${number(o.duration)}, 1.`,
    '*Step, name=Gravity_and_applied_loads, nlgeom=YES, inc=1000',`*Dynamic, application=QUASI-STATIC${ties.length?', impact=NO':''}`,
    `${number(o.duration*.01)}, ${number(o.duration)}, ${number(o.duration*1e-8)}, ${number(o.duration*.05)}`);
  if(c.gravity) {
    out.push('*Dload, amplitude=LOAD_RAMP');
    for(const p of parts) if(!p.fixed) out.push(`${p.name}_I.SOLID, GRAV, ${number(c.gravity)}, 0., 0., -1.`);
  }
  const loads=[];
  for(const p of parts) if(p.kind==='block') {
    const fx=p.mesh.nodeWeights.map(v=>p.actionX*v/p.mesh.volume),fz=p.mesh.nodeWeights.map(v=>p.actionZ*v/p.mesh.volume);
    for(const load of p.loads) if(load.x||load.z) weightsAtDepth(p.mesh,load.depth).forEach((w,i)=>{fx[i]+=w*load.x;fz[i]+=w*load.z;});
    fx.forEach((v,i)=>{if(v)loads.push(`${ref(p,i+1)}, 1, ${number(v)}`);});
    fz.forEach((v,i)=>{if(v)loads.push(`${ref(p,i+1)}, 3, ${number(v)}`);});
  }
  if(loads.length) out.push('*Cload, amplitude=LOAD_RAMP',...loads);
  if(base) {
    const preload=base.K.map(row=>-row.reduce((sum,k,j)=>sum+k*base.parts[j].initialU,0)*base.factor);
    if(preload.some(v=>v!==0)) {
      out.push('** Initial soil force at the exported strip positions.','*Cload, amplitude=SOIL_INITIAL');
      preload.forEach((v,i)=>{if(v)out.push(`${ref(base.parts[i])}, 3, ${number(v)}`);});
    }
  }
  const bilateral=ties.filter(t=>!t.tension);
  if(bilateral.length) out.push('*Connector Motion, type=DISPLACEMENT',...bilateral.map(t=>`${t.name}, 1, ${number(t.length-Math.hypot(...t.p.map((v,i)=>v-t.q[i])))}`));
  out.push('*Output, field, frequency=1','*Node Output','U, RF','*Element Output, directions=YES','S, E',
    '*Contact Output','CSTRESS, CDISP','*Output, history, frequency=1','*Energy Output','ALLIE, ALLKE, ALLWK, ALLFD','*End Step','');
  const stats={blocks:parts.filter(p=>p.kind==='block').length,supports:parts.filter(p=>p.fixed).length,
    strips:base?.n??0,nodes:m.nodes+assemblyNode,elements:m.elements,bondedSites:m.layout.bondedSites,
    hex:parts.reduce((s,p)=>s+p.mesh.elements.filter(e=>e.type==='C3D8').length,0),wedge:parts.reduce((s,p)=>s+p.mesh.elements.filter(e=>e.type==='C3D6').length,0),
    leafThickness:m.leafThickness,leafThicknesses:m.layout.thicknesses,totalDepth:m.totalDepth};
  return {text:out.join('\n'),stats,warnings:m.warnings};
}
