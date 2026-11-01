/* Paid-order entry. Preview stays local until the owner presses Save. */
(function(root){
  'use strict';
  function init({document,context,data,save,today,esc,money}){
    const $=id=>document.getElementById(id), logic=root.NLPastOrders;
    const states={past:{rows:null,plan:null,busy:false},manual:{rows:null,plan:null,busy:false}};
    const manualIds=['manualDate','manualStyle','manualSize','manualQty','manualPrice','manualChannel'];
    const uid=()=> 'O'+root.crypto.randomUUID();
    function clear(kind){
      const s=states[kind];s.rows=null;s.plan=null;
      $(kind+'Preview').innerHTML='';$(kind+'Actions').hidden=true;$(kind+'Status').textContent='';
    }
    function rowMatch(row,index){
      if(row.item&&!row.freeText)return `<b>${esc(row.item.model||row.item.name||row.item.ref)}</b><br><span class="hint">${esc(row.item.ref)}${row.item.colour?' · '+esc(row.item.colour):''}</span>`;
      const options=(row.candidates&&row.candidates.length?row.candidates:context().catalogue);
      return `<b>${esc(row.query)}</b><div class="hint">${row.match==='ambiguous'?'Several catalogue matches':'No catalogue match'}</div>
        <select data-row="${index}" data-f="item" aria-label="Catalogue match for line ${row.line}"><option value="">Choose a catalogue style</option>${options.map(it=>`<option value="${esc(it.ref)}">${esc([it.ref,it.model||it.name,it.colour].filter(Boolean).join(' · '))}</option>`).join('')}</select>
        <label class="entry-check"><input type="checkbox" data-row="${index}" data-f="freeText" ${row.freeText?'checked':''}>Use “${esc(row.query)}” as a free-text style</label>`;
    }
    function render(kind){
      const s=states[kind]; if(!s.rows)return;
      s.plan=logic.resolve(s.rows,{...context(),idFactory:uid});
      const rows=s.plan.rows;
      $(kind+'Preview').innerHTML=`${!context().ready?'<p class="msg warn">Catalogue could not be loaded. Refresh to retry, or explicitly confirm free-text styles for items no longer listed.</p>':''}
        <div class="tw" tabindex="0" role="region" aria-label="${kind==='past'?'Past orders':'Hand entry'} preview"><table class="entry-table"><caption class="hint">Check every line before saving. Edit the original fields and preview again to correct dates, sizes, quantities or prices.</caption><thead><tr><th>Line / date</th><th>Style</th><th>Size / qty</th><th>Price each</th><th>Channel</th><th>Commission each</th></tr></thead><tbody>${rows.map((row,i)=>`<tr>
          <td>${row.line}<br>${esc(row.inputDate)}${row.errors.length?`<ul class="entry-errors">${row.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:''}</td>
          <td>${rowMatch(row,i)}</td><td>${esc(row.size)}<br>× ${esc(row.qty)}</td><td>${Number.isFinite(row.price)?money(row.price):esc(row.price)}</td>
          <td>${esc(row.channel)}${row.channelType==='unknown'||s.rows[i].needsChannelChoice?`<select data-row="${i}" data-f="channelType" aria-label="Channel type for line ${row.line}"><option value="unknown">Choose channel type</option><option value="channel" ${row.channelType==='channel'?'selected':''}>Sales channel · no commission</option><option value="agent" ${row.channelType==='agent'?'selected':''}>Agent code</option></select>`:`<div class="hint">${row.channelType==='agent'?'Agent code':'Sales channel'}</div>`}</td>
          <td>${row.channelType==='agent'?`<label class="f">₦ per item<input type="number" min="0" step="1" data-row="${i}" data-f="commission" value="${row.commission==null?'':esc(row.commission)}" aria-label="Commission per item for line ${row.line}"></label><span class="hint">Check the historical rate; today’s rate is a starting point.</span>`:money(0)}</td></tr>`).join('')}</tbody></table></div>
        <p class="entry-summary" role="status">${s.plan.errors.length?`Fix ${s.plan.errors.length} issue${s.plan.errors.length===1?'':'s'} before saving. No orders saved.`:`${s.plan.orders.length} paid order${s.plan.orders.length===1?'':'s'} · ${s.plan.units} item${s.plan.units===1?'':'s'} · ${money(s.plan.total)}. Paid dates match order dates.`}</p>`;
      $(kind+'Actions').hidden=!rows.length;
      const valid=rows.length>0&&!s.plan.errors.length;
      $(kind+'Save').disabled=!valid||s.busy;
      if(kind==='manual')$('manualAnother').disabled=!valid||s.busy;
    }
    function preview(kind){
      if(states[kind].busy)return;
      let text;
      if(kind==='past')text=$('pastText').value;
      else text=['manualDate','manualStyle','manualSize','manualQty','manualPrice','manualChannel'].map(id=>'"'+$(id).value.replace(/"/g,'""')+'"').join(',');
      states[kind].rows=logic.parse(text,context()).map(row=>({...row,needsChannelChoice:row.channelType==='unknown'}));
      $(kind+'Status').textContent='';render(kind);
      if(!states[kind].rows.length)$(kind+'Status').textContent='Add at least one item, then preview it.';
    }
    function update(kind,e){
      const f=e.target.dataset.f, index=Number(e.target.dataset.row), s=states[kind];
      if(!f||!s.rows||s.busy)return;
      const row=s.rows[index];if(!row)return;
      if(f==='item'){
        row.item=context().catalogue.find(it=>it.ref===e.target.value)||null;
        row.match=row.item?'matched':'unmatched';row.freeText=false;
        row.commission=row.channelType==='agent'&&row.item?(context().prices[row.item.ref]||[])[1]??null:null;
      }else if(f==='freeText'){row.freeText=e.target.checked;row.item=null;row.commission=null;}
      else if(f==='channelType'){
        row.channelType=e.target.value;
        row.commission=row.channelType==='agent'&&row.item?(context().prices[row.item.ref]||[])[1]??null:null;
      }else if(f==='commission')row.commission=e.target.value===''?null:Number(e.target.value);
      render(kind);
    }
    function fingerprint(order){
      const channel=String(order.channel||order.agent||'Direct').trim().toLowerCase();
      return JSON.stringify([order.at,channel,(order.items||[]).map(i=>[i.ref||'',i.model||'',i.size,i.qty,i.price,i.comm]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
    }
    async function commit(kind,another){
      const s=states[kind]; if(s.busy||!s.plan||s.plan.errors.length||!s.plan.orders.length)return;
      const records=JSON.parse(JSON.stringify(s.plan.orders));
      if(kind==='manual')records.forEach(o=>o.src='manual');
      const existing=data().orders||[];
      const duplicate=records.some(rec=>existing.some(o=>o.id!==rec.id&&fingerprint(o)===fingerprint(rec)));
      if(duplicate&&!root.confirm('An order with the same date, channel and items is already saved. Save this batch again?'))return;
      s.busy=true;$(kind+'Fields').disabled=true;$(kind+'Status').textContent='Saving…';
      try{
        const ok=await save(d=>{
          // Stable preview IDs make retries safe even if a previous save response was lost.
          const known=new Set(d.orders.map(o=>o.id));
          records.forEach(rec=>{if(!known.has(rec.id)){d.orders.push(JSON.parse(JSON.stringify(rec)));known.add(rec.id);}});
        },`${records.length} paid ${kind==='past'?'past':'hand-entered'} order${records.length===1?'':'s'}`);
        if(ok){
          clear(kind);
          if(kind==='past')$('pastText').value='';
          else{
            ['manualStyle','manualSize','manualPrice'].forEach(id=>$(id).value='');$('manualQty').value='1';
            if(!another){$('manualDate').value=today();$('manualChannel').value='Direct';}
          }
          $(kind+'Status').textContent=`Saved ${records.length} paid order${records.length===1?'':'s'}.`;
          if(kind==='manual'&&another)$('manualStyle').focus();
        }else $(kind+'Status').textContent='Not saved. Your preview is kept; connect or retry when ready.';
      }catch(e){$(kind+'Status').textContent='Could not confirm the save. Your preview is kept; retry to check and finish it.';}
      finally{s.busy=false;$(kind+'Fields').disabled=false;}
    }
    for(const kind of ['past','manual']){
      $(kind+'PreviewBtn').onclick=()=>preview(kind);
      $(kind+'Preview').addEventListener('change',e=>update(kind,e));
      $(kind+'Save').onclick=()=>commit(kind,false);
    }
    $('manualAnother').onclick=()=>commit('manual',true);
    $('pastText').addEventListener('input',()=>{if(!states.past.busy)clear('past');});
    manualIds.forEach(id=>$(id).addEventListener('input',()=>{if(!states.manual.busy)clear('manual');}));
    $('manualDate').value=today();$('manualDate').max=today();
    function catalogueChanged(){
      $('orderStyles').innerHTML=context().catalogue.map(i=>`<option value="${esc(i.ref)}">${esc([i.model||i.name,i.colour].filter(Boolean).join(' · '))}</option>`).join('');
      // An existing preview is a deliberate snapshot. A new preview picks up newly loaded data.
      for(const kind of ['past','manual'])if(states[kind].rows&&!states[kind].busy){clear(kind);$(kind+'Status').textContent='Catalogue loaded. Preview again to match your items.';}
    }
    catalogueChanged();
    return {catalogueChanged};
  }
  root.NLOrderEntry={init};
})(typeof globalThis!=='undefined'?globalThis:this);
