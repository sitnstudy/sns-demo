// Semantic, read-only frequency tables shared by prompts and Quode-owned help.
export function renderTableLabel(value) {
  const label = document.createElement('span');
  label.className = 'frequency-stable-label';
  label.dataset.label = String(value);
  const text = document.createElement('span'); text.textContent = String(value);
  label.append(text);
  return label;
}
export function renderTable(data) {
  const table = document.createElement('table');
  table.className = 'quode-frequency-table';
  Object.assign(table.style, {borderCollapse:'collapse',width:'100%',marginBottom:'16px',fontSize:'inherit'});
  const row = (parent, cells, heading = false) => {
    const tr = document.createElement('tr');
    cells.forEach((value,index) => {
      const cell = document.createElement(heading || index === 0 ? 'th' : 'td');
      if (cell.tagName === 'TH') cell.scope = heading ? 'col' : 'row';
      cell.append(renderTableLabel(value));
      Object.assign(cell.style, {border:'1px solid #858585',padding:'8px 12px',textAlign:index ? 'right' : 'left',fontWeight:heading ? '700' : '400'});
      tr.append(cell);
    });
    parent.append(tr); return tr;
  };
  const head = document.createElement('thead'); row(head,data.headers,true);
  const body = document.createElement('tbody'); data.rows.forEach(cells => row(body,cells));
  const foot = document.createElement('tfoot'); row(foot,[data.totalLabel,data.total],true);
  table.append(head,body,foot); return table;
}

// Share keyword boundaries between the practice prompt and its guided help.
export function renderFrequencyProse(text, data, {help = false, palette = []} = {}) {
  const el = (tag, className, text) => {
    const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
  };
  const colored = (text, index) => {
    const span = el('strong',help ? 'frequency-category' : 'frequency-practice-keyword',text);
    if (help) span.style.setProperty('--category-color',palette[index % palette.length]);
    return span;
  };
  // Highlight the exact quoted category names, including lowercase golden wording.
  const cues = [...new Set([...(data.emphasisCues || data.exclusionCues || []), ...(text.match(/\b\d[\d,]*(?:\.\d+)?\b/g) || [])])];
  const plain = (start,end) => {
    const fragment = document.createDocumentFragment();
    const segment = text.slice(start,end);
    const matches = cues.flatMap(cue => {
      const found = []; let offset = 0, index;
      while ((index = segment.toLowerCase().indexOf(cue.toLowerCase(),offset)) !== -1) {
        const finish = index + cue.length;
        if (!/[a-z0-9]/i.test(segment[index-1] || '') && !/[a-z0-9]/i.test(segment[finish] || '')) found.push({index,finish});
        offset = finish;
      }
      return found;
    }).sort((a,b) => a.index-b.index || b.finish-a.finish);
    let offset = 0;
    for (const {index,finish} of matches) {
      if (index < offset) continue;
      fragment.append(el('span',help ? 'frequency-muted' : '',segment.slice(offset,index)),
        el('strong',help ? 'frequency-exclusion-cue' : 'frequency-practice-keyword',segment.slice(index,finish)));
      offset = finish;
    }
    fragment.append(el('span',help ? 'frequency-muted' : '',segment.slice(offset)));
    return fragment;
  };
  const pieces = []; let offset = 0;
  for (const match of text.matchAll(/“([^”]+)”/g)) {
    const index = data.table.rows.findIndex(([name]) => name.toLowerCase() === match[1].toLowerCase());
    if (index < 0) continue;
    pieces.push(plain(offset,match.index),el('span',help ? 'frequency-muted' : '','“'),colored(match[1],index),el('span',help ? 'frequency-muted' : '','”'));
    offset = match.index + match[0].length;
  }
  pieces.push(plain(offset,text.length));
  const result = document.createDocumentFragment(); result.append(...pieces); return result;
}
