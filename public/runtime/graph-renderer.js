// Version 1 semantic Cartesian-line renderer shared by questions, print and help.
const ns = 'http://www.w3.org/2000/svg';
export function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
// Keep saved questions and the game on the same single-quadrant frame.
export function graphFrame(graph) {
  if (graph.purpose === 'coordinate-reading') return {...graph, bounds:[...graph.bounds]};
  const point = graph.point;
  let target = graph.target || point.map((n,i) => n + graph.direction[i]);
  let direction = graph.direction;
  if (point.some((n,i) => n && n*target[i] <= 0)) {
    target = target.map((n,i) => 2*point[i]-n);
    direction = direction.map(n => -n);
  }
  let size = Math.ceil(Math.max(3, ...[...point,...target].map(n => Math.abs(n)+1)));
  const crossing = Math.max(...point.map(Math.abs));
  if (Math.max(crossing,size-crossing)<3) size=crossing+3;
  const bounds = point.flatMap((n,i) => (n || target[i])<0 ? [-size,0] : [0,size]);
  return {...graph, target, direction, bounds};
}
export function graphGeometry(graph) {
  const {bounds} = graphFrame(graph);
  const [xmin,xmax,ymin,ymax] = bounds;
  const width = 420, height = 420, scale = width/(xmax-xmin);
  const reading=graph.purpose === 'coordinate-reading';
  const left=reading?88:60, top=60, scaleY=height/(ymax-ymin);
  return {width:reading?570:540,height:reading?580:540,scale,scaleX:scale,scaleY,bounds,
    point:([x,y]) => [left+(x-xmin)*scale,top+(ymax-y)*scaleY],
    plot:{left,top,width,height}};
}
export function clippedLine(graph, start = graph.point, forward = false) {
  graph = graphFrame(graph);
  const [xmin,xmax,ymin,ymax] = graph.bounds;
  let low = forward ? 0 : -Infinity, high = Infinity;
  for (const [i,min,max] of [[0,xmin,xmax],[1,ymin,ymax]]) {
    const d = graph.direction[i];
    if (!d) { if (start[i]<min || start[i]>max) return null; continue; }
    const t1=(min-start[i])/d,t2=(max-start[i])/d;
    low=Math.max(low,Math.min(t1,t2)); high=Math.min(high,Math.max(t1,t2));
  }
  if (low>high) return null;
  return [low,high].map(t => start.map((n,i)=>n+t*graph.direction[i]));
}
export function renderGraph(graph, {arcade=false} = {}) {
  if (!document.querySelector('style[data-cartesian-graph]')) {
    const style=document.createElement('style');style.dataset.cartesianGraph='';
    style.textContent='@media print{.intercept-graph{width:100%!important;max-height:none!important;max-width:350px!important;break-inside:avoid}}';
    document.head.append(style);
  }
  if (graph.kind !== 'cartesian-line' || graph.version !== 1) throw new Error('Unsupported graph');
  const geo=graphGeometry(graph), [xmin,xmax,ymin,ymax]=geo.bounds;
  const svg=svgNode('svg',{viewBox:`0 0 ${geo.width} ${geo.height}`,role:'img','aria-label':graph.label,class:'intercept-graph'});
  svg.style.cssText=`display:block;width:min(100%,540px,48vh);aspect-ratio:${geo.width}/${geo.height};height:auto;margin:0 auto 16px;overflow:visible`;
  const ink=arcade?'#f1f4e9':'#202020',grid=arcade?'#303a31':'#aaa';
  const line=(p,q,attrs={})=>svgNode('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],...attrs});
  const text=(p,t,attrs={})=>svgNode('text',{x:p[0],y:p[1],fill:ink,'font-family':arcade?'monospace':'Roboto, Arial, sans-serif','font-size':graph.purpose==='coordinate-reading'?22:18,...attrs},t);
  // Every unit remains a grid line; suppress alternate labels only on wide ranges.
  const baseLabelStep=graph.labelStep || 1;
  const labelStep=baseLabelStep*Math.max(1,Math.ceil((xmax-xmin)/(16*baseLabelStep)));
  const xLabelStep=graph.xTickStep || labelStep, yLabelStep=graph.yTickStep || labelStep;
  // Place numbers in the outer gutter for each single-quadrant frame.
  const xLabelOffset=ymax===0?-12:graph.purpose==='coordinate-reading'?31:25;
  const yLabelOffset=xmax===0?12:graph.purpose==='coordinate-reading'?-26:-12;
  const yLabelAnchor=xmax===0?'start':'end';
  const xGridStep=graph.gridXStep || ((xmax-xmin)>20 ? xLabelStep : 1);
  const yGridStep=graph.gridYStep || ((ymax-ymin)>20 ? yLabelStep : 1);
  for (let x=xmin;x<=xmax;x+=xGridStep) {
    svg.append(line(geo.point([x,ymin]),geo.point([x,ymax]),{stroke:grid,'stroke-width':1,'stroke-dasharray':arcade?'4 5':'none','data-grid-line':'true','data-grid':'true'}));
    const p=geo.point([x,0]);
    svg.append(line([p[0],p[1]-5],[p[0],p[1]+5],{stroke:ink,'stroke-width':1.5,'data-axis-tick':'true','data-axis':'x'}));
    if (x!==0 && (x%xLabelStep===0 || (!graph.labelStep && (x===xmin || x===xmax)))) svg.append(text([p[0],p[1]+xLabelOffset],String(x),{'text-anchor':'middle','data-axis-number':'true','data-axis':'x'}));
  }
  for (let y=ymin;y<=ymax;y+=yGridStep) {
    svg.append(line(geo.point([xmin,y]),geo.point([xmax,y]),{stroke:grid,'stroke-width':1,'stroke-dasharray':arcade?'4 5':'none','data-grid-line':'true','data-grid':'true'}));
    const p=geo.point([0,y]);
    svg.append(line([p[0]-5,p[1]],[p[0]+5,p[1]],{stroke:ink,'stroke-width':1.5,'data-axis-tick':'true','data-axis':'y'}));
    if (y!==0 && (y%yLabelStep===0 || (!graph.labelStep && (y===ymin || y===ymax)))) svg.append(text([p[0]+yLabelOffset,p[1]+6],String(y),{'text-anchor':yLabelAnchor,'data-axis-number':'true','data-axis':'y'}));
  }
  const origin=geo.point([0,0]), xend=geo.point([xmax,0]), yend=geo.point([0,ymax]);
  svg.append(line(geo.point([xmin,0]),[xend[0]+15,xend[1]],{stroke:ink,'stroke-width':3,'data-axis':'x'}),line(geo.point([0,ymin]),[yend[0],yend[1]-15],{stroke:ink,'stroke-width':3,'data-axis':'y'}));
  svg.append(svgNode('path',{d:`M${xend[0]+20} ${xend[1]} l-12 -5 v10 Z`,fill:ink,'data-axis':'x'}),svgNode('path',{d:`M${yend[0]} ${yend[1]-20} l-5 12 h10 Z`,fill:ink,'data-axis':'y'}));
  svg.append(text([xend[0]+26,xend[1]+6],'x',{'font-style':'italic','data-axis':'x'}),text([yend[0]-5,yend[1]-25],'y',{'font-style':'italic','data-axis':'y'}),text([origin[0]+yLabelOffset,origin[1]+xLabelOffset],'0',{'text-anchor':yLabelAnchor,'data-axis-number':'true','data-axis':'x y'}));
  const series=Array.isArray(graph.series) ? graph.series : null;
  if (series) {
    const points=series.map(geo.point);
    if (graph.render==='polyline' || graph.render==='line') {
      const drawn=graph.render==='line' ? [points[0],points.at(-1)] : points;
      svg.append(svgNode('polyline',{points:drawn.map(p=>p.join(',')).join(' '),stroke:arcade?'#53ff22':ink,'stroke-width':arcade?4:3.5,'stroke-linejoin':'round','stroke-linecap':'round',fill:'none','stroke-dasharray':arcade?'4 8':'none',class:'intercept-line'}));
    } else {
      for (const [index,p] of points.entries()) {
        const source=series[index],target=graph.target || [];
        const selected=source[0]===target[0] && source[1]===target[1];
        svg.append(svgNode('circle',{cx:p[0],cy:p[1],r:selected?7:6,fill:selected?'#8654b5':'white',stroke:selected?'#663793':ink,'stroke-width':2.5,class:`graph-data-point${selected?' graph-target-point':''}`}));
        if (selected && graph.markerLabel) svg.append(text([p[0]+12,p[1]-12],graph.markerLabel,{'font-size':18,'font-weight':700,fill:'#663793',class:'graph-marker-label'}));
      }
    }
  } else {
    const ends=clippedLine(graph);
    if (ends) svg.append(line(...ends.map(geo.point),{stroke:arcade?'#53ff22':ink,'stroke-width':arcade?4:3.5,'stroke-dasharray':arcade?'4 8':'none',class:'intercept-line'}));
  }
  if (graph.xLabel) svg.append(text([geo.plot.left+geo.plot.width/2,geo.plot.top+geo.plot.height+72],graph.xLabel,{'text-anchor':'middle','font-size':24,'data-axis-title':'x'}));
  if (graph.yLabel) {
    const cy=geo.plot.top+geo.plot.height/2;
    svg.append(text([16,cy],graph.yLabel,{'text-anchor':'middle','font-size':24,transform:`rotate(-90 16 ${cy})`,'data-axis-title':'y'}));
  }
  // SVG uses paint order: keep ticks above the axis lines and arrowheads.
  for(const tick of svg.querySelectorAll('[data-axis-tick]'))svg.append(tick);
  return svg;
}
