'use strict';
const services=[
  {name:'Website',repo:'karrkode/cc-site',url:'https://chiculturecrew.com'},
  {name:'Backend API',repo:'karrkode/cc-backend',url:'https://api.chiculturecrew.com/health'}
];
const cards=document.getElementById('cards'), history=document.getElementById('history'),updated=document.getElementById('updated'),refresh=document.getElementById('refresh');
function el(tag, text, className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node}
function link(text,url){const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
function state(run){
 if(!run)return {text:'No production runs found',cls:'unknown'};
 if(run.status!=='completed')return {text:run.status==='queued'?'Queued':'In progress',cls:'pending'};
 if(run.conclusion==='success')return {text:'Successful',cls:'ok'};
 if(run.conclusion==='failure'||run.conclusion==='timed_out'||run.conclusion==='cancelled')return {text:run.conclusion.replaceAll('_',' '),cls:'bad'};
 return {text:run.conclusion||'Unknown',cls:'unknown'};
}
function duration(run){if(!run||!run.run_started_at||run.status!=='completed')return '—';const ms=new Date(run.updated_at)-new Date(run.run_started_at);if(ms<0||!Number.isFinite(ms))return '—';return Math.floor(ms/60000)+'m '+Math.floor(ms%60000/1000)+'s'}
function date(value){return value?new Date(value).toLocaleString():'—'}
async function getRuns(service){
 const url='https://api.github.com/repos/'+service.repo+'/actions/workflows/ci-cd.yml/runs?branch=main&event=push&per_page=20';
 const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
 if(!response.ok)throw new Error('GitHub returned HTTP '+response.status+(response.status===403?' (possibly rate limited)':''));
 const data=await response.json();
 return (data.workflow_runs||[]).filter(r=>r.head_branch==='main'&&r.event==='push');
}
function drawCard(service,runs,error){
 const card=el('section',undefined,'card'),heading=el('h2',service.name),run=runs&&runs[0],s=state(run);
 card.append(heading,el('div',error?'Unavailable':s.text,error?'status bad':'status '+s.cls));
 card.append(el('div','Repository: '+service.repo,'muted'));
 if(run){card.append(el('div','Latest run: '+date(run.created_at)),el('div','Duration: '+duration(run)));card.append(link('View workflow logs',run.html_url))}
 card.append(el('div'));card.append(link('Open service',service.url));
 if(error)card.append(el('div',error,'error'));
 return card;
}
function drawRows(all){
 history.replaceChildren();
 const rows=all.flatMap(x=>x.runs.slice(0,10).map(run=>({service:x.service,run}))).sort((a,b)=>new Date(b.run.created_at)-new Date(a.run.created_at)).slice(0,15);
 if(!rows.length){const tr=el('tr'),td=el('td','No deployment runs available');td.colSpan=6;tr.append(td);history.append(tr);return}
 for(const {service,run} of rows){
 const tr=el('tr'),s=state(run);
 for(const value of [service.name,s.text,date(run.created_at),duration(run),run.head_sha?run.head_sha.slice(0,7):'—']){const td=el('td',value,value===s.text?s.cls:undefined);tr.append(td)}
 const td=el('td');td.append(link('Logs',run.html_url));tr.append(td);history.append(tr);
 }
}
let busy=false;
async function load(){
 if(busy)return;busy=true;refresh.disabled=true;updated.textContent='Checking GitHub…';
 try{
 const results=await Promise.all(services.map(async service=>{try{return {service,runs:await getRuns(service)}}catch(e){return {service,runs:[],error:e.message}}}));
 cards.replaceChildren(...results.map(x=>drawCard(x.service,x.runs,x.error)));
 drawRows(results.filter(x=>!x.error));
 const errors=results.filter(x=>x.error).length;
 updated.textContent='Last checked: '+new Date().toLocaleTimeString()+(errors?' · '+errors+' service(s) unavailable':'');
 }finally{busy=false;refresh.disabled=false}
}
refresh.addEventListener('click',load);load();setInterval(()=>{if(!document.hidden)load()},60000);
