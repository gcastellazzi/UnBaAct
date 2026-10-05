import { validateContour, polygonArea } from './geometry.js';
import { earClip, hexVolume, wedgeVolume, hexCornerJacobian } from './vendor/alotia-mesh.js';

const cross = (a,b,c) => (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
const midpoint = (a,b) => a.map((v,k)=>(v+b[k])/2);
export const FACE_NODES = {
  C3D8: [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],
  C3D6: [[0,1,2],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]],
};

export function blockOutline(s, circleSegments=32) {
  let p;
  if (s.shape === 'disk') p = Array.from({length:circleSegments}, (_,i)=>[s.r*Math.cos(i*2*Math.PI/circleSegments),s.r*Math.sin(i*2*Math.PI/circleSegments)]);
  else if (s.shape === 'polygon') p = Array.from({length:s.vertices.length/2},(_,i)=>s.vertices.slice(i*2,i*2+2));
  else if (s.shape === 'triangle') p = [[0,s.r*1.25],[-s.r,-s.r*.75],[s.r,-s.r*.75]];
  else {
    const w=s.shape==='square'?2*s.r:s.width??4*s.r, h=s.shape==='square'?2*s.r:s.height??2*s.r;
    p=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
  }
  const c=Math.cos(s.angle??0), t=Math.sin(s.angle??0);
  return validateContour(p.map(([x,y])=>({x:s.x+c*x-t*y,y:s.y+t*x+c*y}))).map(p=>[p.x,p.y]);
}

// Pair adjacent triangles only when their union is a strictly convex quad.
// All refinements split every edge identically, so there are no hanging nodes.
function cellsOf(points) {
  if(points.length===4 && points.every((p,i)=>cross(p,points[(i+1)%4],points[(i+2)%4])>1e-12)) return [points];
  const triangles=earClip(points), used=new Set(), cells=[];
  for(let i=0;i<triangles.length;i++) {
    if(used.has(i)) continue;
    let best;
    for(let j=i+1;j<triangles.length;j++) {
      if(used.has(j)) continue;
      const edges=[];
      for(const tri of [triangles[i],triangles[j]]) for(let k=0;k<3;k++) edges.push([tri[k],tri[(k+1)%3]]);
      const border=edges.filter(([a,b])=>!edges.some(([c,d])=>a===d&&b===c));
      if(border.length!==4) continue;
      const ids=[border[0][0]];
      for(let k=0;k<3;k++) ids.push(border.find(([a])=>a===ids.at(-1))[1]);
      const quad=ids.map(id=>points[id]);
      const quality=Math.min(...quad.map((a,k)=>{
        const b=quad[(k+1)%4],c=quad[(k+2)%4];
        return cross(a,b,c)/(Math.hypot(a[0]-b[0],a[1]-b[1])*Math.hypot(b[0]-c[0],b[1]-c[1]));
      }));
      if(quality>1e-6 && (!best||quality>best.quality)) best={j,quad,quality};
    }
    used.add(i);
    if(best) { used.add(best.j); cells.push(best.quad); }
    else cells.push(triangles[i].map(id=>points[id]));
  }
  return cells;
}
function refineCell(p) {
  const mid=p.map((a,i)=>midpoint(a,p[(i+1)%p.length]));
  if(p.length===3) return [[p[0],mid[0],mid[2]],[mid[0],p[1],mid[1]],[mid[2],mid[1],p[2]],[mid[0],mid[1],mid[2]]];
  const center=midpoint(mid[0],mid[2]);
  return p.map((a,i)=>[a,mid[i],center,mid[(i+3)%4]]);
}

export function extrudeMesh(outline, thickness, {refinement=2, through=2, offset=0}={}) {
  if(![1,2,4,8].includes(refinement) || !Number.isInteger(through) || through<1 || through>640 || !(thickness>0)) throw Error('Invalid extrusion mesh settings.');
  const points=validateContour(outline.map(([x,y])=>({x,y}))).map(p=>[p.x,p.y]);
  let cells=cellsOf(points);
  for(let n=1;n<refinement;n*=2) cells=cells.flatMap(refineCell);
  const nodes=[], elements=[], seen=new Map(), nodeWeights=[];
  const node=(p)=>{
    const key=p.map(v=>v.toPrecision(13)).join(',');
    if(!seen.has(key)) {seen.set(key,nodes.length+1);nodes.push(p);nodeWeights.push(0);}
    return seen.get(key);
  };
  let volume=0;
  for(const cell of cells) for(let k=0;k<through;k++) {
    // Reversed depth order makes the CCW x-z profile right handed in x-y-z.
    const ids=[k+1,k].flatMap(layer=>cell.map(([x,z])=>node([x,offset-thickness/2+layer*thickness/through,z])));
    const type=cell.length===4?'C3D8':'C3D6', p=ids.map(id=>nodes[id-1]);
    const v=type==='C3D8'?hexVolume(p):wedgeVolume(p);
    if(!(v>0) || (type==='C3D8'&&!(hexCornerJacobian(p)>0))) throw Error('Degenerate or inverted extrusion element. Correct the block outline.');
    elements.push({type,ids,volume:v}); volume+=v;
    // Consistent integral of shape functions: 2x2 in-plane quadrature for quads,
    // exact area/3 for triangles. Splitting equally through depth is exact.
    const weights=new Array(cell.length).fill(0);
    if(cell.length===3) weights.fill(v/6);
    else for(const xi of [-1/Math.sqrt(3),1/Math.sqrt(3)]) for(const eta of [-1/Math.sqrt(3),1/Math.sqrt(3)]) {
      const signs=[[-1,-1],[1,-1],[1,1],[-1,1]];
      const N=signs.map(([a,b])=>(1+a*xi)*(1+b*eta)/4);
      const dx=signs.map(([a,b])=>a*(1+b*eta)/4), de=signs.map(([a,b])=>b*(1+a*xi)/4);
      const sum=(d,c)=>d.reduce((s,w,i)=>s+w*cell[i][c],0);
      const J=sum(dx,0)*sum(de,1)-sum(dx,1)*sum(de,0);
      N.forEach((w,i)=>weights[i]+=w*J*thickness/through/2);
    }
    ids.forEach((id,i)=>nodeWeights[id-1]+=weights[i%cell.length]);
  }
  const expected=polygonArea(points.map(([x,y])=>({x,y})))*thickness;
  if(Math.abs(volume-expected)>expected*1e-8) throw Error('Mesh does not conserve block volume.');
  const faces=new Map();
  elements.forEach((e,i)=>FACE_NODES[e.type].forEach((face,k)=>{
    const ids=face.map(j=>e.ids[j]),key=[...ids].sort((a,b)=>a-b).join(',');
    if(faces.has(key)) faces.get(key).count++;
    else faces.set(key,{element:i+1,side:`S${k+1}`,ids,count:1});
  }));
  return {nodes,elements,volume,nodeWeights,exterior:[...faces.values()].filter(f=>f.count===1)};
}

// Apply a resultant at an exact depth, including its out-of-plane moment on a
// through stone. Linear interpolation uses adjacent depth planes; in-plane
// weights are the consistent area integrals, so the resultant acts at the COM.
export function weightsAtDepth(mesh, depth) {
  const columns=new Map(),weights=new Float64Array(mesh.nodes.length);
  mesh.nodes.forEach((p,i)=>{
    const key=[p[0],p[2]].map(v=>v.toPrecision(13)).join(',');
    if(!columns.has(key)) columns.set(key,[]);
    columns.get(key).push({i,y:p[1],w:mesh.nodeWeights[i]/mesh.volume});
  });
  for(const column of columns.values()) {
    column.sort((a,b)=>a.y-b.y);
    const total=column.reduce((s,p)=>s+p.w,0);
    if(depth<column[0].y-1e-9||depth>column.at(-1).y+1e-9) throw Error('Load lies outside its block.');
    let k=column.findIndex(p=>p.y>=depth-1e-12);if(k<0)k=column.length-1;
    if(k===0) weights[column[0].i]=total;
    else {const a=column[k-1],b=column[k],f=Math.max(0,Math.min(1,(depth-a.y)/(b.y-a.y)));weights[a.i]=total*(1-f);weights[b.i]=total*f;}
  }
  return weights;
}
