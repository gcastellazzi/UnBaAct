// Geometry only: shared by the Abaqus exporter and a future 3D viewer/solver.
// A site is one outline in the 2D wall. Bonded sites replace copies, never overlap them.
export function masonry3DLayout(particles, thickness, options) {
  const {leaves,leafMode,gap,bondPercent=0,bondMode='full',bondSeed=42}=options;
  const thicknesses=leafMode==='custom'?options.leafThicknesses:
    Array(leaves).fill(leafMode==='repeat'?thickness:thickness/leaves);
  if(!Array.isArray(thicknesses)||thicknesses.length!==leaves||thicknesses.some(t=>!Number.isFinite(t)||t<=0||t>10))
    throw Error(`Specify ${leaves} positive leaf thicknesses in metres (maximum 10 m each).`);
  const solidThickness=thicknesses.reduce((s,t)=>s+t,0),totalDepth=solidThickness+(leaves-1)*gap;
  let at=-totalDepth/2;
  const layers=thicknesses.map((t,i)=>{const layer={index:i+1,thickness:t,start:at,end:at+t,center:at+t/2};at+=t+gap;return layer;});
  let state=bondSeed>>>0;
  const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  const order=particles.map((_,i)=>i);
  for(let i=order.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const count=leaves>1?Math.round(particles.length*bondPercent/100):0;
  const selected=new Set(order.slice(0,count)),bodies=[];
  for(const [index,spec] of particles.entries()) {
    const start=selected.has(index)?(bondMode==='full'?0:Math.floor(random()*(leaves-1))):-1;
    const end=start<0?-1:bondMode==='full'?leaves-1:start+1;
    for(let i=0;i<leaves;i++) {
      const last=i===start?end:i, first=layers[i], final=layers[last];
      bodies.push({spec,index,firstLeaf:i+1,lastLeaf:last+1,leaf:i+1,
        depth:final.end-first.start,offset:(first.start+final.end)/2,bonded:last>i});
      i=last;
    }
  }
  return {layers,thicknesses,solidThickness,totalDepth,bodies,bondedSites:count};
}
