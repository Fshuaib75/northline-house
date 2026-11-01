/* Pure import helpers shared by the past-orders preview and hand-entry form. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.NLPastOrders=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const MAX_MONEY=1000000000, MAX_QTY=100000;
  const key=value=>String(value==null?'':value).trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
  const text=value=>String(value==null?'':value).trim();
  const nigeriaToday=()=>new Date(Date.now()+3600000).toISOString().slice(0,10);
  function integer(value,max=MAX_MONEY){
    if(typeof value==='string'&&!/^\d+$/.test(value.trim())) return null;
    if(value==null||value==='') return null;
    const n=Number(value);
    return Number.isSafeInteger(n)&&n>=0&&n<=max?n:null;
  }
  function validDate(value,today=nigeriaToday()){
    const s=text(value);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'0001-01-01'||s>today) return false;
    const date=new Date(s+'T00:00:00Z');
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===s;
  }
  const CHANNELS=new Map([
    ['direct','Direct'],['direct sale','Direct'],['ig','Instagram'],['instagram','Instagram'],
    ['fb','Facebook'],['facebook','Facebook'],['whatsapp','WhatsApp'],['wa','WhatsApp'],
    ['tiktok','TikTok'],['tik tok','TikTok'],['website','Website'],['shop','Website'],
    ['online shop','Website'],['walk-in','Walk-in'],['walk in','Walk-in'],['walkin','Walk-in'],
    ['in person','Walk-in'],['in-person','Walk-in']
  ]);
  function classifyChannel(value,agents=[]){
    const channel=text(value), canonical=CHANNELS.get(key(channel));
    if(canonical) return {channel:canonical,channelType:'channel',agent:''};
    const prefixed=channel.match(/^agent:\s*([a-z0-9_-]{1,24})$/i);
    const code=(prefixed?prefixed[1]:channel).toUpperCase();
    const known=new Set(agents.map(x=>key(typeof x==='string'?x:x&&x.agent)));
    if(/^[A-Z0-9_-]{1,24}$/.test(code)&&(prefixed||known.has(key(code)))) return {channel:code,channelType:'agent',agent:code};
    return {channel,channelType:'unknown',agent:''};
  }
  const nameKey=value=>key(value).replace(/\s*[·/]\s*/g,' ');
  function matchStyle(query,catalogue=[]){
    const wanted=key(query), named=nameKey(query);
    const unique=list=>[...new Map(list.map(item=>[key(item.ref),item])).values()];
    const exact=unique(catalogue.filter(i=>i&&text(i.ref)&&key(i.ref)===wanted));
    const byName=exact.length?exact:unique(catalogue.filter(i=>{
      if(!i||!text(i.ref)||!named) return false;
      const model=text(i.model), name=text(i.name), colour=text(i.colour), brand=text(i.brand);
      return [model,name,model&&colour&&model+' '+colour,model&&brand&&brand+' '+model,
        model&&brand&&colour&&brand+' '+model+' '+colour].filter(Boolean).some(n=>nameKey(n)===named);
    }));
    const candidates=byName.map(i=>({...i}));
    return {match:candidates.length===1?'matched':candidates.length?'ambiguous':'unmatched',candidates,item:candidates.length===1?{...candidates[0]}:null};
  }
  function csvLine(line){
    const fields=[]; let field='',quoted=false,closed=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(quoted){
        if(c==='"'){ if(line[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;} }
        else field+=c;
      }else if(c===','){fields.push(field.trim());field='';closed=false;}
      else if(c==='"'){
        if(closed||field.trim()) throw new Error('A quote must start a field. Put comma-containing names in double quotes.');
        field='';quoted=true;
      }else if(closed&&!/\s/.test(c)) throw new Error('Unexpected text after a closing quote.');
      else if(!closed) field+=c;
    }
    if(quoted) throw new Error('Unclosed quote. Each item must be on one complete line.');
    fields.push(field.trim()); return fields;
  }
  function commissionFor(item,prices){
    const value=item&&prices&&prices[item.ref]&&prices[item.ref][1];
    return typeof value==='number'?integer(value):null;
  }
  function parse(source,options={}){
    const rows=[], lines=String(source||'').replace(/^\uFEFF/,'').split(/\r?\n/);
    lines.forEach((line,index)=>{
      if(!line.trim()) return;
      let fields=[],parseErrors=[];
      try{ fields=csvLine(line); }catch(e){parseErrors.push(e.message);}
      const header=fields.map(key).join(',');
      if(!rows.length&&!parseErrors.length&&['date,style ref or name,size,qty,price,channel','date,style,size,qty,price,channel'].includes(header)) return;
      if(!parseErrors.length&&fields.length!==6) parseErrors.push('Expected 6 fields: date, style ref or name, size, qty, price, channel.');
      const [inputDate='',query='',size='',qty='',price='',channel='']=fields;
      const matched=matchStyle(query,options.catalogue||[]), classified=classifyChannel(channel,options.agents||[]);
      const row={line:index+1,inputDate,query,size,qty,price,...classified,...matched,freeText:false,
        commission:classified.channelType==='agent'?commissionFor(matched.item,options.prices):0,parseErrors,errors:[]};
      rows.push(validateRow(row,options));
    });
    return rows;
  }
  function validateRow(source,options={}){
    const row={...source,errors:[...(source.parseErrors||[])],candidates:(source.candidates||[]).map(x=>({...x})),item:source.item?{...source.item}:null};
    const fail=message=>row.errors.push(message);
    row.inputDate=text(row.inputDate);row.query=text(row.query);row.size=text(row.size);row.channel=text(row.channel);
    if(!validDate(row.inputDate,options.today||nigeriaToday())) fail('Use a real order date in YYYY-MM-DD format, today or earlier.');
    if(!row.query||row.query.length>160) fail('Enter a style ref or name (up to 160 characters).');
    if(!row.size||row.size.length>40) fail('Enter a size, or “One size” (up to 40 characters).');
    const qty=integer(row.qty,MAX_QTY),price=integer(row.price);
    if(qty==null||qty<1) fail('Quantity must be a whole number from 1 to 100,000.');
    if(price==null) fail('Price per item must be a whole naira amount from 0 to 1,000,000,000.');
    if(qty!=null&&price!=null&&!Number.isSafeInteger(qty*price)) fail('This line total is too large.');
    row.qty=qty==null?row.qty:qty;row.price=price==null?row.price:price;
    if(row.freeText){row.item=null;row.match='unmatched';}
    else if(!row.item||!text(row.item.ref)) fail(row.match==='ambiguous'?'More than one catalogue style matches. Choose a style or confirm free text.':'No catalogue match. Choose a style or confirm free text.');
    else row.match='matched';
    const classified=classifyChannel(row.channel,options.agents||[]);
    if(!row.channel||row.channel.length>48) fail('Enter a channel or agent code (up to 48 characters).');
    if(classified.channelType==='channel') Object.assign(row,classified);
    else if(row.channelType==='agent'){
      const code=row.channel.replace(/^agent:\s*/i,'').toUpperCase();
      if(!/^[A-Z0-9_-]{1,24}$/.test(code)) fail('Agent codes use 1–24 letters, numbers, hyphens or underscores.');
      row.channel=code;row.agent=code;
    }else if(row.channelType==='channel'){row.agent='';}
    else {row.agent='';fail('Confirm whether this channel is an agent code or a sales channel.');}
    if(row.channelType==='agent'){
      const commission=integer(row.commission);
      if(commission==null) fail('Enter the commission per item for this agent sale.');
      else if(price!=null&&commission>price) fail('Commission per item cannot exceed its sale price.');
      row.commission=commission==null?row.commission:commission;
    }else row.commission=0;
    return row;
  }
  function resolve(source,options={}){
    const rows=(source||[]).map(row=>validateRow(row,options));
    const errors=rows.flatMap(row=>row.errors.map(message=>`Line ${row.line}: ${message}`));
    if(!rows.length) errors.push('Add at least one item before saving.');
    if(errors.length) return {rows,orders:[],errors,units:0,total:0};
    const grouped=new Map();let units=0,total=0;
    rows.forEach(row=>{
      const groupKey=JSON.stringify([row.inputDate,row.channelType,key(row.channel)]);
      let order=grouped.get(groupKey);
      if(!order){
        order={at:row.inputDate,paid:row.inputDate,agent:row.agent||'',channel:row.channel,src:options.src||'past',status:'paid',items:[]};
        grouped.set(groupKey,order);
      }
      const item=row.item;
      order.items.push({ref:item?text(item.ref):'',model:item?(text(item.model)||text(item.name)||text(item.ref)):row.query,
        colour:item?text(item.colour):'',brand:item?text(item.brand):'',size:row.size,qty:row.qty,price:row.price,comm:row.commission});
      units+=row.qty;total+=row.qty*row.price;
    });
    if(!Number.isSafeInteger(units)||!Number.isSafeInteger(total)) return {rows,orders:[],errors:['The batch total is too large. Split it into smaller batches.'],units:0,total:0};
    const idFactory=options.idFactory||(()=> 'O'+(globalThis.crypto&&globalThis.crypto.randomUUID?globalThis.crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)));
    const orders=[...grouped.values()].map(order=>({id:idFactory(),...order}));
    return {rows,orders,errors:[],units,total};
  }
  return {parse,resolve,matchStyle,classifyChannel,validDate,integer,csvLine,commissionFor};
});
