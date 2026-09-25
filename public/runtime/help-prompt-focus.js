const measurement = /(\d[\d,]*(?:\.\d+)?)(\s*(?:(?:square|cubic)\s+)?(?:millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|kilomet(?:er|re)s?|inches?|feet|foot|yards?|miles?|grams?|kilograms?|ounces?|pounds?|mm|cm|km|in|ft|yd|mi|m|g|kg|oz|lb)(?:\s*(?:²|2|³|3))?)/gi;

export function focusHelpPrompt(prompt) {
  if (!prompt || prompt.dataset.helpPromptFocus === 'true') return () => {};
  prompt.dataset.helpPromptFocus='true';
  const quantities=[...prompt.querySelectorAll('.conversion-quantity')];
  const walker=document.createTreeWalker(prompt,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())if(walker.currentNode.data.trim()&&!walker.currentNode.parentElement?.closest('.conversion-quantity'))nodes.push(walker.currentNode);
  for(const textNode of nodes){
    const text=textNode.data,fragment=document.createDocumentFragment();let last=0,match;measurement.lastIndex=0;
    while((match=measurement.exec(text))){
      if(match.index>last){const blurred=document.createElement('span');blurred.className='help-prompt-blurred';blurred.dataset.helpPromptPiece='true';blurred.textContent=text.slice(last,match.index);fragment.append(blurred);}
      const fact=document.createElement('strong');fact.className='help-prompt-fact';fact.dataset.helpPromptPiece='true';
      const number=document.createElement('span');number.className='help-prompt-number';number.textContent=match[1];fact.append(number,document.createTextNode(match[2]));fragment.append(fact);last=measurement.lastIndex;
    }
    if(last<text.length){const blurred=document.createElement('span');blurred.className='help-prompt-blurred';blurred.dataset.helpPromptPiece='true';blurred.textContent=text.slice(last);fragment.append(blurred);}
    textNode.replaceWith(fragment);
  }
  const leadingUnit=/^(\s*(?:(?:square|cubic)\s+)?(?:millimet(?:er|re)s?|centimet(?:er|re)s?|met(?:er|re)s?|kilomet(?:er|re)s?|inches?|feet|foot|yards?|miles?|grams?|kilograms?|ounces?|pounds?|mm|cm|km|in|ft|yd|mi|m|g|kg|oz|lb)(?:\s*(?:²|2|³|3))?)/i;
  for(const quantity of quantities){
    quantity.classList.add('help-prompt-fact','help-prompt-number');
    const next=quantity.nextSibling;
    if(next?.nodeType===Node.ELEMENT_NODE&&next.matches('.help-prompt-blurred')){
      const match=next.textContent.match(leadingUnit);
      if(match){const unit=document.createElement('strong');unit.className='help-prompt-fact';unit.dataset.helpPromptPiece='true';unit.textContent=match[1];next.textContent=next.textContent.slice(match[1].length);next.before(unit);}
    }
  }
  return ()=>{
    for(const piece of [...prompt.querySelectorAll('[data-help-prompt-piece="true"]')])piece.replaceWith(document.createTextNode(piece.textContent||''));
    for(const quantity of quantities)quantity.classList.remove('help-prompt-fact','help-prompt-number');
    prompt.normalize();delete prompt.dataset.helpPromptFocus;
  };
}

const style=document.createElement('style');
style.textContent=`
.paper-prompt[data-help-prompt-focus="true"] .help-prompt-blurred{color:inherit;opacity:.38;text-shadow:none;user-select:auto}
.paper-prompt[data-help-prompt-focus="true"] .help-prompt-fact{font-weight:800;color:var(--psat-primary);white-space:nowrap}
.paper-prompt[data-help-prompt-focus="true"] .help-prompt-number{color:#1768c4;font-weight:900}
@media(prefers-reduced-motion:no-preference){.paper-prompt[data-help-prompt-focus="true"] .help-prompt-blurred{transition:opacity .2s}}
@media print{.paper-prompt[data-help-prompt-focus="true"] .help-prompt-blurred{opacity:1}}
`;
document.head.append(style);
