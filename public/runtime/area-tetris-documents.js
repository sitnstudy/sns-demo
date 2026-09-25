import { element as el } from './answer-challenge.js';

const stylesheet = new URL('./area-tetris-documents.css', import.meta.url).href;
if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === stylesheet)) {
  const link = el('link', ''); link.rel = 'stylesheet'; link.href = stylesheet; document.head.append(link);
}
const fmt = value => value.toLocaleString('en-US');
const palette = ['#00bcd4','#7851e8','#f59b16','#3673ef','#ef4665','#30bd68','#edcb30'];
function piece(index, className='') {
  const tile = el('span', `conversion-slab area-doc-piece ${className}`);
  tile.style.setProperty('--brick-colour', palette[index % palette.length]);
  return tile;
}
function caption(text) { return el('figcaption', 'area-doc-caption', text); }
function frame() { return el('div', 'conversion-target-frame area-doc-well'); }
function wordmark() {
  const title = el('div','conversion-tetris-wordmark area-doc-wordmark');
  title.setAttribute('aria-hidden','true');
  for (const letter of 'TETRIS') title.append(el('span','',letter));
  return title;
}
function rowFigure(m, workbook) {
  const unknown = workbook && m.task === 'missing-side' && m.shape === 'square';
  const columns = unknown ? 6 : m.length;
  const figure = el('figure','area-doc-figure');
  const well = frame(); well.classList.add('area-doc-assembly');
  well.style.setProperty('--doc-columns',columns);
  well.setAttribute('role','img');
  well.setAttribute('aria-label',unknown ? 'Example square pieces fall into one row. Choose the number of pieces across.' : `${columns} square pieces assemble into one slab. Each square is one square centimetre.`);
  if(columns >= 5) well.append(wordmark());
  well.style.width=`min(100%, ${Math.max(100,columns*32)}px)`;
  well.style.marginInline="auto";
  const tray=el('div','area-doc-tray');
  const settled = Math.max(0, Math.min(columns-1, Math.ceil(columns*.55)));
  for(let i=0;i<columns;i++) tray.append(piece(i,i<settled?'':'area-doc-ghost'));
  const falling=piece(settled,'area-doc-falling-square');
  falling.style.left=`${settled/columns*100}%`;
  well.append(tray,falling,el('span','area-doc-drop-arrow','↓'));
  figure.append(well,el('p','area-doc-dimension',unknown?'? squares across':`${columns} cm across`),caption(unknown?'Choose a row length. Each falling square covers 1 cm².':`Join ${columns} unit squares to make one slab: ${columns} cm × 1 cm.`));
  figure.append(el('p','area-doc-grouping','Press + once for each square. When the row is complete, an outline joins it into one slab.'));
  const bundle=el('div','area-doc-bundle-example');
  bundle.style.setProperty('--doc-columns',columns);
  bundle.style.width=`min(100%, ${Math.max(100,columns*32)}px)`;
  bundle.setAttribute('role','img');bundle.setAttribute('aria-label',unknown?'An example completed row enclosed by one slab outline.':`${columns} square pieces joined inside one slab outline.`);
  for(let i=0;i<columns;i++)bundle.append(piece(i));
  figure.append(bundle,el('p','area-doc-bundle-label',unknown?'Example: one completed slab':'One completed slab'));
  return figure;
}
function stackFigure(m, workbook) {
  const unknown = workbook && m.task === 'missing-side';
  const columns = unknown && m.shape==='square' ? 6 : m.length;
  const rows = unknown ? 6 : m.width;
  const figure=el('figure','area-doc-figure');
  const well=frame(); well.classList.add('area-doc-stacking');
  well.style.setProperty('--doc-columns',columns);
  well.style.setProperty('--doc-rows',rows);
  // The paper game well is a viewport; the rectangle itself retains square units.
  const shape=el('div','area-doc-shape');
  shape.style.aspectRatio=`${columns} / ${rows}`;
  shape.style.width=`min(100%, ${170*columns/rows}px)`;
  shape.style.maxHeight='170px';
  const visible=workbook?Math.min(2,Math.max(0,rows-1)):rows;
  for(let index=0;index<visible;index++) {
    const slab=piece(index,'area-doc-row');
    slab.style.bottom=`${index/rows*100}%`; slab.style.height=`${100/rows}%`;
    for(let c=0;c<columns;c++){const cell=el('span','area-doc-cell');cell.style.setProperty('--brick-colour',palette[c%palette.length]);if(c%10===9)cell.classList.add('area-doc-tenth');slab.append(cell);}
    shape.append(slab);
  }
  if(workbook) {
    const falling=piece(2,'area-doc-row area-doc-falling-row');
    falling.style.height=`${100/rows}%`;
    for(let c=0;c<columns;c++){const cell=el('span','area-doc-cell');cell.style.setProperty('--brick-colour',palette[c%palette.length]);falling.append(cell);}
    shape.append(falling);
    well.append(el('span','area-doc-stack-arrow','↓'));
  }
  well.append(shape);
  const side=unknown?'? cm':`${m.width} cm`;
  figure.append(well,el('p','area-doc-dimension',`${unknown&&m.shape==='square'?'?':m.length} cm across · ${side} high`),caption(workbook?'Press + once to drop one whole slab. Stack the copies with no gaps or overlaps.':`${m.width} whole slabs, dropped one at a time, cover ${fmt(m.area)} cm². Each slab contains ${m.length} square units.`));
  well.setAttribute('role','img');
  well.setAttribute('aria-label',unknown?'Schematic Tetris well with a few example slabs. The missing side is not shown to scale.':workbook?`Tetris well for a ${m.length} by ${m.width} rectangle, with only a few rows placed.`:`Completed Tetris rectangle: ${m.length} squares across, ${m.width} rows. Area ${m.area} square centimetres.`);
  if(unknown)figure.append(el('p','area-doc-grouping','Schematic: choose how many squares and rows are needed.'));

  return figure;
}
export function mountAreaTetrisDocument(question, workbook, search = location.search, {onReplay} = {}) {
  const m={...question.teaching};m.area=m.length*m.width;
  const params=new URLSearchParams(search);
  const words=(key,fallback)=>m.language?.[key]||fallback;
  const enabled = name => !['false','0','no'].includes(params.get(name));
  const panel=el('section',`${workbook?'teach-workbook':'teach-solution'} area-tetris-document`);
  panel.append(el('h3','',workbook?words('documentTitle','Build the area with Tetris'):words('solutionTitle','Tetris: worked solution')));
  const legend=el('p','area-doc-legend');const unit=piece(0);unit.setAttribute('aria-hidden','true');legend.append(unit,document.createTextNode(words('unitLegend','One square piece = 1 cm × 1 cm = 1 cm².')));
  panel.append(legend);
  const diagrams=el('div','area-doc-diagrams');
  const first=el('section','area-doc-stage');first.append(el('h4','',words('buildSlab','Step 1: build one slab')),rowFigure(m,workbook));
  const second=el('section','area-doc-stage');second.append(el('h4','',words('stackSlabs','Step 2: stack whole slabs')),stackFigure(m,workbook));
  diagrams.append(first,second);panel.append(diagrams);
  const blank='______';
  const equations=el('div','area-doc-equations');
  if(m.task==='area') {
    equations.append(el('p','',`One slab: ${m.length} × 1 = ${workbook?blank:m.length} cm².`),el('p','',`${m.width} slabs × ${m.length} cm² = ${workbook?blank:fmt(m.area)} cm².`));

  } else if(m.shape==='square') {
    equations.append(el('p','',`Equal sides: ${workbook?blank:m.length} × ${workbook?blank:m.length} = ${fmt(m.area)} cm².`),el('p','',`Each side is ${workbook?blank:m.length} cm.`));
  } else {
    equations.append(el('p','',`One slab covers ${m.length} cm². Target area: ${fmt(m.area)} cm².`),el('p','',`${fmt(m.area)} ÷ ${m.length} = ${workbook?blank:m.width} rows. Missing side: ${workbook?blank:m.width} cm.`));
  }
  panel.append(equations);
  if(enabled('instructions'))panel.append(el('p','teach-intent area-doc-instruction',m.shape==='square'&&m.task==='missing-side'?'Find a row length that makes the same number of squares across and rows high.':'Count the squares in one slab, then count how many equal slabs cover the shape.'));
  if(enabled('hints'))panel.append(el('p','teach-hint area-doc-instruction','First, drop one square at a time and join the completed row into one outlined slab. Then drop one whole slab at a time to cover the shape.'));
  if(workbook)panel.append(el('div','teach-writing-line'));
  if(onReplay){const button=el('button','area-doc-replay',words('playTetris','Play Tetris'));button.type='button';button.addEventListener('click',onReplay);panel.append(button);}
  return panel;
}
