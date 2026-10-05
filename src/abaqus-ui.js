import { abaqusInput } from './abaqus.js';

export function setupAbaqusExport(getScene, notify) {
  const panel=document.createElement('details');
  panel.className='photo-tools'; panel.id='abaqusTools';
  panel.innerHTML=`<summary>Export Abaqus · 3D solids</summary>
    <label>Geometry<select id="abqGeometry"><option value="current">Current configuration</option><option value="initial">Initial configuration</option></select></label>
    <div class="pair"><label>Leaves<input id="abqLeaves" type="number" min="1" max="20" step="1" value="1"></label><label>Gap between leaves (m)<input id="abqGap" type="number" min="0" max="10" step=".001" value="0"></label></div>
    <label>Leaf thickness<select id="abqLeafMode"><option value="divide">Equal · wall thickness / N</option><option value="custom">Specify each leaf thickness</option><option value="repeat">Each leaf = wall thickness</option></select></label>
    <div id="abqThicknesses" class="abq-thicknesses" hidden></div>
    <label>Concentrated block loads<select id="abqLoadLeaf"><option value="all">All leaves · share total force by thickness</option><option value="1">Leaf 1</option></select></label>
    <div class="pair"><label>Through-stone sites (%)<input id="abqBondPercent" type="number" min="0" max="100" value="0" step="1"></label><label>Selection seed<input id="abqBondSeed" type="number" min="0" max="4294967295" value="42" step="1"></label></div>
    <label>Through-stone span<select id="abqBondMode"><option value="full">All leaves · diatoni</option><option value="pair">Two adjacent leaves · random pair</option></select></label>
    <p class="hint">Percentage of 2D block outlines, rounded to whole sites. A through stone replaces the leaf copies with one continuous body. Leaf 1 starts at negative depth Y; numbering increases along Y.</p>
    <label>Out-of-plane motion<select id="abqMotion"><option value="free">Free 3D · friction between leaves</option><option value="planar">Planar · restrain depth displacement</option></select></label>
    <div class="pair"><label>In-plane refinement<select id="abqRefinement"><option value="1">1 · coarse</option><option value="2" selected>2</option><option value="4">4</option><option value="8">8 · fine</option></select></label><label>Elements through each leaf<input id="abqThrough" type="number" min="1" max="32" step="1" value="2"></label></div>
    <div class="pair"><label>Block E (GPa)<input id="abqYoung" type="number" min=".000001" max="1000000" value="30" step="any"></label><label>Poisson ratio<input id="abqPoisson" type="number" min="0" max=".49" value=".2" step=".01"></label></div>
    <div class="pair"><label>Support E / block E<input id="abqRatio" type="number" min="10" max="1000000" value="1000" step="any"></label><label>Step duration (s)<input id="abqDuration" type="number" min=".001" max="1000000" value="1" step="any"></label></div>
    <label>Disk outline segments<input id="abqCircle" type="number" min="8" max="48" step="1" value="32"></label>
    <p class="hint">HEX8 preferred, WEDGE6 for remaining triangles. Independent blocks and leaves. SI units (m, N, kg, s). Fixed back faces on stiff support bodies preserve frictional contact.</p>
    <p class="hint">The total concentrated force stays unchanged when choosing its leaf. Self-weight follows actual volume; active analysis forces scale with thickness. Loads act at the chosen leaf centre, retaining their eccentricity on through stones. Exports ties and elastic soil; starts without velocities or contact history.</p>
    <button id="exportAbaqus">↓ Export Abaqus .inp</button><p id="abaqusStatus" class="hint" role="status">Abaqus/Standard · implicit quasi-static dynamics.</p>`;
  document.querySelector('#export').insertAdjacentElement('afterend',panel);
  const read=id=>panel.querySelector(`#${id}`);
  const updateLeaves=()=>{
    const n=Math.max(1,Math.min(20,Math.round(+read('abqLeaves').value||1))), old=read('abqLoadLeaf').value;
    read('abqLoadLeaf').replaceChildren(new Option('All leaves · share total force by thickness','all'),
      ...Array.from({length:n},(_,i)=>new Option(`Leaf ${i+1}${n%2&&i===(n-1)/2?' · central':''}`,String(i+1))));
    read('abqLoadLeaf').value=old==='all'||+old<=n?old:'all';
    const values=[...read('abqThicknesses').querySelectorAll('input')].map(el=>el.value);
    const custom=read('abqLeafMode').value==='custom';read('abqThicknesses').hidden=!custom;
    read('abqThicknesses').replaceChildren(...Array.from({length:n},(_,i)=>{
      const label=document.createElement('label');label.textContent=`Leaf ${i+1} (m)`;
      const input=document.createElement('input');input.type='number';input.min='.001';input.max='10';input.step='any';input.required=true;
      input.value=values[i]??String(Number((+document.querySelector('#thickness').value/n).toPrecision(6)));
      input.disabled=!custom;input.id=`abqLeafThickness${i+1}`;label.append(input);return label;
    }));
    for(const id of ['abqBondPercent','abqBondSeed','abqBondMode']) read(id).disabled=n===1;
  };
  read('abqLeaves').onchange=updateLeaves;read('abqLeafMode').onchange=updateLeaves;updateLeaves();
  read('exportAbaqus').onclick=()=>{
    try {
      if([...panel.querySelectorAll('input')].some(el=>!el.reportValidity())) return;
      const result=abaqusInput(getScene(read('abqGeometry').value),{
        leaves:+read('abqLeaves').value,gap:+read('abqGap').value,leafMode:read('abqLeafMode').value,
        leafThicknesses:[...read('abqThicknesses').querySelectorAll('input')].map(el=>+el.value),
        loadLeaf:read('abqLoadLeaf').value==='all'?'all':+read('abqLoadLeaf').value,
        bondPercent:+read('abqBondPercent').value,bondMode:read('abqBondMode').value,bondSeed:+read('abqBondSeed').value,
        planar:read('abqMotion').value==='planar',refinement:+read('abqRefinement').value,through:+read('abqThrough').value,
        young:+read('abqYoung').value*1e9,poisson:+read('abqPoisson').value,supportRatio:+read('abqRatio').value,
        duration:+read('abqDuration').value,circleSegments:+read('abqCircle').value});
      const url=URL.createObjectURL(new Blob([result.text],{type:'text/plain;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='unbaact-model.inp';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      const s=result.stats;
      read('abaqusStatus').textContent=`${s.blocks} blocks · ${s.bondedSites} through-stone sites · ${s.supports} supports · ${s.strips} elastic strips · ${s.nodes} nodes · ${s.hex} HEX8 + ${s.wedge} WEDGE6. Leaf thicknesses ${s.leafThicknesses.map(t=>Number(t.toPrecision(4))).join(' / ')} m; total depth ${s.totalDepth.toPrecision(4)} m. ${result.warnings.join(' ')}`;
      notify('Abaqus model exported.');
    } catch(error) {read('abaqusStatus').textContent=error.message;notify(error.message);}
  };
}
