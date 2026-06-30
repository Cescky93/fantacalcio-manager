const STORAGE_KEY = "fantacalcio-rosa-live-v2";
const OLD_KEYS = ["fantacalcio-manager-v1"];
const DEFAULT_STATE = {
  settings: { teamName: "La mia rosa", initialBudget: 500 },
  matchday: 1,
  roster: [],
  current: { opponent: "", deadline: "", preferredModule: "3-4-3", strategy: "balanced", notes: "", lineup: [] },
  archive: []
};
let state = loadState();
let currentRoleFilter = "all";
let deferredInstallPrompt = null;
const $ = id => document.getElementById(id);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function normalize(t){ return String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function escapeHtml(v){ return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function toast(msg){ const el=$("toast"); el.textContent=msg; el.classList.remove("hidden"); setTimeout(()=>el.classList.add("hidden"),2200); }
function roleName(r){ return ({P:"Portieri",D:"Difensori",C:"Centrocampisti",A:"Attaccanti"}[r]||r); }
function statusLabel(s){ return ({ok:"OK",monitorare:"Da monitorare",dubbio:"Dubbio",ballottaggio:"Ballottaggio",probabile:"Probabile titolare",infortunato:"Infortunato",squalificato:"Squalificato",non_convocato:"Non convocato",evitare:"Evitare"}[s]||s); }
function starterLabel(s){ return ({sicuro:"Sicuro",probabile:"Probabile",ballottaggio:"Ballottaggio",panchina:"Panchina",out:"Out"}[s]||s); }
function isBad(p){ return ["infortunato","squalificato","non_convocato","evitare"].includes(p.status) || p.starter === "out"; }
function isWatch(p){ return ["monitorare","dubbio","ballottaggio"].includes(p.status) || ["ballottaggio","panchina"].includes(p.starter); }
function playerScore(p){
  if(isBad(p)) return -100;
  const status = {probabile:10, ok:8, monitorare:2, dubbio:-3, ballottaggio:-4}[p.status] ?? 0;
  const starter = {sicuro:10, probabile:6, ballottaggio:-1, panchina:-6, out:-100}[p.starter] ?? 0;
  const rel = Number(p.reliability||3)*4;
  const bonus = Number(p.bonus||5)*2;
  const malus = Number(p.malus||3)*-1.2;
  const notes = normalize(p.note);
  const noteBoost = (notes.includes("rigor")?6:0)+(notes.includes("piazz")?3:0)+(notes.includes("titol")?2:0);
  return status+starter+rel+bonus+malus+noteBoost;
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return mergeState(JSON.parse(raw));
    for(const k of OLD_KEYS){
      const old = localStorage.getItem(k);
      if(old){
        const migrated = migrateOld(JSON.parse(old));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  }catch{}
  return clone(DEFAULT_STATE);
}
function mergeState(data){ return {...clone(DEFAULT_STATE), ...data, settings:{...clone(DEFAULT_STATE).settings, ...(data.settings||{})}, current:{...clone(DEFAULT_STATE).current, ...(data.current||{})}}; }
function migrateOld(old){
  const st = clone(DEFAULT_STATE);
  st.settings.teamName = old?.settings?.teamName || "La mia rosa";
  st.settings.initialBudget = old?.settings?.initialBudget || 500;
  st.matchday = old?.matchday || 1;
  st.roster = (old?.roster||[]).map(p=>({
    id:p.id||uid(), name:p.name||"", role:p.role||"C", team:p.team||"", status:mapOldStatus(p.status), reliability:3,
    starter:p.status==="squalificato"||p.status==="infortunato"?"out":"probabile", bonus:5, malus:3, source:"", note:p.note||""
  }));
  st.current.preferredModule = old?.lineup?.module || "3-4-3";
  st.current.strategy = old?.lineup?.strategy || "balanced";
  return st;
}
function mapOldStatus(s){ return {vendere:"evitare"}[s] || s || "ok"; }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function bindNavigation(){
  document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    btn.classList.add("active"); $(btn.dataset.view).classList.add("active");
    if(btn.dataset.view === "ai") renderPrompt();
  }));
}
function bindEvents(){
  $("saveMatchdayBtn").onclick=()=>{ state.matchday=Number($("matchdayInput").value||1); saveState(); renderAll(); toast("Giornata salvata"); };
  $("playerForm").addEventListener("submit", savePlayer);
  $("resetFormBtn").onclick=resetPlayerForm;
  $("searchPlayer").addEventListener("input", renderRoster);
  document.querySelectorAll(".chip[data-role]").forEach(b=>b.onclick=()=>{ document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active")); b.classList.add("active"); currentRoleFilter=b.dataset.role; renderRoster(); });
  $("matchdayForm").addEventListener("submit", e=>{ e.preventDefault(); state.current.opponent=$("opponent").value.trim(); state.current.deadline=$("deadline").value; state.current.preferredModule=$("preferredModule").value; state.current.strategy=$("strategy").value; state.current.notes=$("matchNotes").value.trim(); saveState(); renderAll(); toast("Giornata aggiornata"); });
  $("autoLineupBtn").onclick=autoLineup;
  $("saveLineupBtn").onclick=()=>{ state.current.lineup = readLineupFromDom(); saveState(); toast("Formazione salvata"); };
  $("clearLineupBtn").onclick=()=>{ state.current.lineup=[]; saveState(); renderLineup(); toast("Formazione svuotata"); };
  $("analyzeNewsBtn").onclick=analyzeNews;
  $("clearNewsBtn").onclick=()=>{ $("newsText").value=""; $("newsResults").innerHTML=""; };
  $("copyPromptBtn").onclick=()=>copyText($("aiPrompt").value,"Prompt copiato");
  $("refreshPromptBtn").onclick=renderPrompt;
  $("copyBriefBtn").onclick=()=>copyText(buildBrief(),"Brief copiato");
  $("archiveCurrentBtn").onclick=archiveCurrent;
  $("settingsForm").addEventListener("submit", e=>{ e.preventDefault(); state.settings.teamName=$("teamName").value.trim()||"La mia rosa"; state.settings.initialBudget=Number($("initialBudget").value||0); saveState(); renderAll(); toast("Impostazioni salvate"); });
  $("exportBtn").onclick=exportJson;
  $("importFile").onchange=importJson;
  $("resetAllBtn").onclick=()=>{ if(confirm("Cancellare tutti i dati salvati su questo dispositivo?")){ localStorage.removeItem(STORAGE_KEY); state=clone(DEFAULT_STATE); renderAll(); toast("Reset completato"); }};
  window.addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferredInstallPrompt=e; $("installBtn").classList.remove("hidden"); });
  $("installBtn").onclick=async()=>{ if(!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; $("installBtn").classList.add("hidden"); };
  if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}

function renderAll(){
  $("matchdayInput").value=state.matchday; renderHome(); renderRoster(); renderMatchday(); renderLineup(); renderArchive(); renderSettings(); renderPrompt();
}
function statusBuckets(){
  const ok=state.roster.filter(p=>!isBad(p)&&!isWatch(p)).length;
  const watch=state.roster.filter(p=>!isBad(p)&&isWatch(p)).length;
  const out=state.roster.filter(isBad).length;
  return {ok,watch,out};
}
function liveScore(){
  if(!state.roster.length) return 0;
  const {watch,out}=statusBuckets();
  let score=100 - out*12 - watch*5;
  const counts={P:0,D:0,C:0,A:0}; state.roster.forEach(p=>counts[p.role]++);
  const min={P:1,D:3,C:3,A:1}; Object.keys(min).forEach(r=>{ if(counts[r]<min[r]) score-=15; });
  return Math.max(0, Math.min(100, Math.round(score)));
}
function renderHome(){
  const b=statusBuckets(); $("okCount").textContent=b.ok; $("watchCount").textContent=b.watch; $("outCount").textContent=b.out; $("totalPlayers").textContent=state.roster.length; $("liveScore").textContent=liveScore();
  const items=buildPriorities();
  $("priorities").innerHTML = items.map(i=>`<div class="diagnosis-item"><span class="dot ${i.level}"></span><span>${escapeHtml(i.text)}</span></div>`).join("");
  const ordered=[...state.roster].sort((a,b)=>playerScore(b)-playerScore(a));
  $("trafficRoster").innerHTML = ordered.length?ordered.map(p=>playerMini(p)).join(""):`<div class="empty">Inserisci la rosa per avere il semaforo live.</div>`;
}
function buildPriorities(){
  const out=state.roster.filter(isBad), watch=state.roster.filter(p=>!isBad(p)&&isWatch(p));
  const arr=[];
  if(!state.roster.length) arr.push({level:"warn",text:"Inserisci la tua rosa personale. Questa app è pensata per gestire solo i tuoi giocatori, giornata per giornata."});
  if(out.length) arr.push({level:"danger",text:`Evita o sostituisci: ${out.map(p=>p.name).join(", ")}.`});
  if(watch.length) arr.push({level:"warn",text:`Da verificare prima della consegna: ${watch.map(p=>p.name).join(", ")}.`});
  const noSource=state.roster.filter(p=>!p.source && (isWatch(p)||isBad(p)));
  if(noSource.length) arr.push({level:"warn",text:`Mancano fonti/link su ${noSource.slice(0,4).map(p=>p.name).join(", ")}: aggiorna da News Live o note.`});
  if(state.current.deadline) arr.push({level:"ok",text:`Scadenza salvata: ${new Date(state.current.deadline).toLocaleString("it-IT")}.`});
  if(!arr.length) arr.push({level:"ok",text:"Rosa pulita: nessuna urgenza live rilevante. Genera la formazione e poi fai il check news."});
  return arr;
}
function playerMini(p){ return `<div class="player-card"><span class="badge">${p.role}</span><div><strong>${escapeHtml(p.name)}</strong><div class="player-meta">${escapeHtml(p.team||"-")} · ${starterLabel(p.starter)} · score ${Math.round(playerScore(p))}</div></div><span class="status ${p.status}">${statusLabel(p.status)}</span></div>`; }
function renderRoster(){
  const q=normalize($("searchPlayer")?.value||"");
  const list=state.roster.filter(p=>(currentRoleFilter==="all"||p.role===currentRoleFilter)&&(!q||normalize(`${p.name} ${p.team} ${p.note} ${p.source}`).includes(q))).sort((a,b)=>a.role.localeCompare(b.role)||a.name.localeCompare(b.name));
  $("playersList").innerHTML = list.length?list.map(playerCard).join(""):`<div class="empty">Nessun giocatore. Aggiungi la tua rosa manualmente.</div>`;
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editPlayer(b.dataset.edit));
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deletePlayer(b.dataset.delete));
  document.querySelectorAll("[data-status]").forEach(b=>b.onchange=()=>quickStatus(b.dataset.status,b.value));
}
function playerCard(p){ return `<div class="player-card"><span class="badge">${p.role}</span><div><strong>${escapeHtml(p.name)}</strong><div class="player-meta">${escapeHtml(p.team||"-")} · ${statusLabel(p.status)} · titolarità: ${starterLabel(p.starter)} · affidabilità ${p.reliability}/5<br>${escapeHtml(p.note||"")}${p.source?`<br>Fonte: ${escapeHtml(p.source)}`:""}</div></div><div class="actions"><select data-status="${p.id}" aria-label="Status rapido"><option value="ok" ${p.status==="ok"?"selected":""}>OK</option><option value="monitorare" ${p.status==="monitorare"?"selected":""}>Monitorare</option><option value="dubbio" ${p.status==="dubbio"?"selected":""}>Dubbio</option><option value="ballottaggio" ${p.status==="ballottaggio"?"selected":""}>Ballottaggio</option><option value="probabile" ${p.status==="probabile"?"selected":""}>Probabile</option><option value="infortunato" ${p.status==="infortunato"?"selected":""}>Infortunato</option><option value="squalificato" ${p.status==="squalificato"?"selected":""}>Squalificato</option><option value="non_convocato" ${p.status==="non_convocato"?"selected":""}>Non conv.</option><option value="evitare" ${p.status==="evitare"?"selected":""}>Evitare</option></select><button class="ghost" data-edit="${p.id}" type="button">Modifica</button><button class="danger" data-delete="${p.id}" type="button">Elimina</button></div></div>`; }
function savePlayer(e){
  e.preventDefault(); const id=$("playerId").value||uid();
  const p={id,name:$("name").value.trim(),role:$("role").value,team:$("team").value.trim(),status:$("status").value,reliability:Number($("reliability").value),starter:$("starter").value,bonus:Number($("bonus").value||5),malus:Number($("malus").value||3),source:$("source").value.trim(),note:$("note").value.trim()};
  if(!p.name) return;
  const idx=state.roster.findIndex(x=>x.id===id); if(idx>=0) state.roster[idx]=p; else state.roster.push(p);
  saveState(); resetPlayerForm(); renderAll(); toast("Giocatore salvato");
}
function resetPlayerForm(){ $("playerForm").reset(); $("playerId").value=""; $("reliability").value="3"; $("bonus").value="5"; $("malus").value="3"; }
function editPlayer(id){ const p=state.roster.find(x=>x.id===id); if(!p)return; $("playerId").value=p.id; $("name").value=p.name; $("role").value=p.role; $("team").value=p.team||""; $("status").value=p.status||"ok"; $("reliability").value=p.reliability||3; $("starter").value=p.starter||"probabile"; $("bonus").value=p.bonus||5; $("malus").value=p.malus||3; $("source").value=p.source||""; $("note").value=p.note||""; document.querySelector('[data-view="roster"]').click(); window.scrollTo({top:0,behavior:"smooth"}); }
function deletePlayer(id){ const p=state.roster.find(x=>x.id===id); if(p&&confirm(`Eliminare ${p.name}?`)){ state.roster=state.roster.filter(x=>x.id!==id); state.current.lineup=state.current.lineup.filter(x=>x.playerId!==id); saveState(); renderAll(); toast("Eliminato"); }}
function quickStatus(id,status){ const p=state.roster.find(x=>x.id===id); if(!p)return; p.status=status; if(["infortunato","squalificato","non_convocato","evitare"].includes(status)) p.starter="out"; if(status==="probabile") p.starter="probabile"; saveState(); renderAll(); }
function renderMatchday(){ $("opponent").value=state.current.opponent||""; $("deadline").value=state.current.deadline||""; $("preferredModule").value=state.current.preferredModule||"3-4-3"; $("strategy").value=state.current.strategy||"balanced"; $("matchNotes").value=state.current.notes||""; $("checklist").innerHTML=buildChecklist().map(x=>`<li>${escapeHtml(x)}</li>`).join(""); }
function buildChecklist(){ const arr=[]; const w=state.roster.filter(p=>!isBad(p)&&isWatch(p)); const o=state.roster.filter(isBad); if(o.length) arr.push(`Sostituisci/evita: ${o.map(p=>p.name).join(", ")}.`); if(w.length) arr.push(`Controlla news e convocati per: ${w.map(p=>p.name).join(", ")}.`); arr.push("Genera formazione, poi verifica che in panchina ci siano coperture per ogni reparto."); arr.push("Incolla le ultime probabili formazioni in News Live e applica eventuali aggiornamenti."); return arr; }
function moduleSlots(){ const [d,c,a]=(state.current.preferredModule||"3-4-3").split("-").map(Number); return ["P",...Array(d).fill("D"),...Array(c).fill("C"),...Array(a).fill("A"),"PAN","PAN","PAN","PAN","PAN","PAN","PAN"]; }
function renderLineup(){ const slots=moduleSlots(); $("lineupSlots").innerHTML=slots.map((role,i)=>lineRow(role,i,state.current.lineup?.[i]?.playerId||"")).join(""); }
function lineRow(role,i,selected){ const label=role==="PAN"?`P${i-10}`:role; const options=state.roster.filter(p=>role==="PAN"||p.role===role).sort((a,b)=>playerScore(b)-playerScore(a)).map(p=>`<option value="${p.id}" ${p.id===selected?"selected":""}>${escapeHtml(p.name)} · ${p.role} · ${statusLabel(p.status)}</option>`).join(""); return `<div class="line-row"><strong>${label}</strong><select data-line-slot="${i}"><option value="">-- scegli --</option>${options}</select></div>`; }
function readLineupFromDom(){ return [...document.querySelectorAll("[data-line-slot]")].map((s,i)=>({slot:i, playerId:s.value})).filter(x=>x.playerId); }
function autoLineup(){ const slots=moduleSlots(); const used=new Set(); const lineup=[]; slots.forEach((role,i)=>{ const candidates=state.roster.filter(p=>(role==="PAN"||p.role===role)&&!used.has(p.id)).sort((a,b)=>playerScore(b)-playerScore(a)); const pick=candidates[0]; if(pick){ used.add(pick.id); lineup[i]={slot:i,playerId:pick.id}; }}); state.current.lineup=lineup; saveState(); renderLineup(); toast("Formazione suggerita"); }
function analyzeNews(){
  const text=$("newsText").value; const ntext=normalize(text); if(!text.trim()){ toast("Incolla prima un testo"); return; }
  const hits=[];
  state.roster.forEach(p=>{ const tokens=normalize(p.name).split(/\s+/).filter(x=>x.length>2); const full=normalize(p.name); const found=ntext.includes(full)||tokens.some(t=>ntext.includes(t)); if(found){ const suggestion=suggestFromText(ntext,p); hits.push({p,suggestion}); }});
  $("newsResults").innerHTML=hits.length?hits.map(newsHit).join(""):`<div class="empty">Nessun nome della tua rosa trovato nel testo incollato.</div>`;
  document.querySelectorAll("[data-apply-news]").forEach(b=>b.onclick=()=>applyNews(b.dataset.applyNews,b.dataset.status,b.dataset.note));
}
function suggestFromText(t,p){
  const bad=["non convocato","non sara convocato","out","salta","squalificato","lesione","infortun","operato"]; const doubt=["dubbio","lavoro a parte","a parte","affaticamento","fastidio","da valutare","personalizzato","recupero"];
  const ballot=["ballottaggio","si gioca una maglia","insidia","contende","favorito su"]; const probable=["verso una maglia","titolare","dal 1","dal primo","recuperato","in gruppo","convocato"];
  let status="monitorare", note="Nome trovato nella news: verificare contesto.";
  if(bad.some(k=>t.includes(k))){ status=t.includes("squalificat")?"squalificato":(t.includes("non convoc")?"non_convocato":"infortunato"); note="News negativa: possibile out/non schierabile."; }
  else if(doubt.some(k=>t.includes(k))){ status="dubbio"; note="News di rischio: da controllare fino alla consegna."; }
  else if(ballot.some(k=>t.includes(k))){ status="ballottaggio"; note="News di ballottaggio/minutaggio."; }
  else if(probable.some(k=>t.includes(k))){ status="probabile"; note="News positiva: possibile titolarità/recupero."; }
  return {status,note};
}
function newsHit(h){ return `<div class="player-card"><span class="badge">${h.p.role}</span><div><strong>${escapeHtml(h.p.name)}</strong><div class="player-meta">Status attuale: ${statusLabel(h.p.status)} → suggerito: ${statusLabel(h.suggestion.status)}<br>${escapeHtml(h.suggestion.note)}</div><div class="apply-row"><button data-apply-news="${h.p.id}" data-status="${h.suggestion.status}" data-note="${escapeHtml(h.suggestion.note)}" type="button">Applica aggiornamento</button></div></div><span class="status ${h.suggestion.status}">${statusLabel(h.suggestion.status)}</span></div>`; }
function applyNews(id,status,note){ const p=state.roster.find(x=>x.id===id); if(!p)return; p.status=status; p.note=[p.note,note].filter(Boolean).join(" · "); p.source="News incollata manualmente"; if(["infortunato","squalificato","non_convocato","evitare"].includes(status)) p.starter="out"; if(status==="probabile") p.starter="probabile"; saveState(); renderAll(); toast(`Aggiornato ${p.name}`); }
function buildPrompt(){ const lines=[]; lines.push(`Agisci come consulente fantacalcio. Aiutami a gestire SOLO la mia rosa personale per la giornata ${state.matchday}.`); lines.push(`Squadra: ${state.settings.teamName}. Modulo preferito: ${state.current.preferredModule}. Approccio: ${state.current.strategy}.`); if(state.current.deadline) lines.push(`Scadenza formazione: ${new Date(state.current.deadline).toLocaleString("it-IT")}.`); if(state.current.notes) lines.push(`Note giornata: ${state.current.notes}`); lines.push("\nROSA:"); ["P","D","C","A"].forEach(r=>{ lines.push(`\n${roleName(r).toUpperCase()}:`); state.roster.filter(p=>p.role===r).sort((a,b)=>playerScore(b)-playerScore(a)).forEach(p=>lines.push(`- ${p.name} (${p.team||"squadra n/d"}) | status: ${statusLabel(p.status)} | titolarità: ${starterLabel(p.starter)} | affidabilità: ${p.reliability}/5 | bonus: ${p.bonus}/10 | malus: ${p.malus}/10 | note: ${p.note||"-"}`)); });
  const lineup=readLineupFromState(); if(lineup.length){ lines.push("\nFORMAZIONE SALVATA:"); lineup.forEach(x=>lines.push(`- ${x.label}: ${x.player?.name||"-"}`)); }
  lines.push("\nObiettivo: consigliami titolari, panchina ordinata, giocatori da evitare, dubbi da verificare e 3 priorità prima della consegna. Sii pratico e non generico."); return lines.join("\n"); }
function readLineupFromState(){ const slots=moduleSlots(); return slots.map((role,i)=>({label:role==="PAN"?`Panchina ${i-10}`:role, player:state.roster.find(p=>p.id===state.current.lineup?.[i]?.playerId)})).filter(x=>x.player); }
function renderPrompt(){ $("aiPrompt").value=buildPrompt(); }
function buildBrief(){ return `Fantacalcio Rosa Live - Giornata ${state.matchday}\nScore: ${liveScore()}\nPriorità:\n${buildPriorities().map(x=>`- ${x.text}`).join("\n")}\n\n${buildPrompt()}`; }
async function copyText(text,msg){ try{ await navigator.clipboard.writeText(text); toast(msg); }catch{ toast("Copia non riuscita: seleziona manualmente"); }}
function archiveCurrent(){ const entry={id:uid(), date:new Date().toISOString(), matchday:state.matchday, current:clone(state.current), rosterSnapshot:clone(state.roster)}; state.archive.unshift(entry); saveState(); renderArchive(); toast("Giornata archiviata"); }
function renderArchive(){ $("archiveList").innerHTML=state.archive.length?state.archive.map(a=>`<div class="player-card"><span class="badge">G${a.matchday}</span><div><strong>${new Date(a.date).toLocaleString("it-IT")}</strong><div class="player-meta">Modulo ${a.current.preferredModule} · ${a.rosterSnapshot.length} giocatori salvati nello snapshot</div></div><div class="actions"><button class="danger" onclick="deleteArchive('${a.id}')" type="button">Elimina</button></div></div>`).join(""):`<div class="empty">Nessuna giornata archiviata.</div>`; }
function deleteArchive(id){ state.archive=state.archive.filter(a=>a.id!==id); saveState(); renderArchive(); }
function renderSettings(){ $("teamName").value=state.settings.teamName||""; $("initialBudget").value=state.settings.initialBudget||0; }
function exportJson(){ const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`fantacalcio-rosa-live-g${state.matchday}.json`; a.click(); URL.revokeObjectURL(url); }
function importJson(e){ const file=e.target.files?.[0]; if(!file)return; const r=new FileReader(); r.onload=()=>{ try{ state=mergeState(JSON.parse(r.result)); saveState(); renderAll(); toast("Import completato"); }catch{ toast("JSON non valido"); } }; r.readAsText(file); e.target.value=""; }

bindNavigation(); bindEvents(); renderAll();
