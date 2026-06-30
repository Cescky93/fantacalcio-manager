const STORAGE_KEY = "fantacalcio-manager-v1";
const DEFAULT_STATE = {
  settings: { teamName: "La mia rosa", initialBudget: 500, leagueTeams: 10, modifierRule: "" },
  matchday: 1,
  roster: [],
  targets: [],
  lineup: { module: "3-4-3", strategy: "balanced", slots: [] }
};

let state = loadState();
let currentRoleFilter = "all";
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(raw) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function toast(message){
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2300);
}
function fmt(n){ return Number(n || 0).toLocaleString("it-IT"); }
function normalize(text){ return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function roleName(role){ return ({P:"Portieri",D:"Difensori",C:"Centrocampisti",A:"Attaccanti"}[role] || role); }
function statusWeight(status){
  return { ok: 5, monitorare: 4, dubbio: 3, squalificato: 1, infortunato: 1, vendere: 0 }[status] ?? 3;
}
function playerValue(p){
  const q = Number(p.quote || 0);
  const c = Number(p.cost || 0);
  const base = q || Math.max(1, c);
  return base + statusWeight(p.status) * 3 + (normalize(p.note).includes("rigor") ? 8 : 0) + (normalize(p.note).includes("titol") ? 5 : 0);
}

function bindNavigation(){
  document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "ai") renderPrompt();
  }));
}

function renderAll(){
  $("matchdayInput").value = state.matchday;
  renderDashboard();
  renderRoster();
  renderLineup();
  renderTargets();
  renderSettings();
  renderPrompt();
}

function roleCounts(){
  return ["P","D","C","A"].reduce((acc, r) => {
    acc[r] = state.roster.filter(p => p.role === r).length;
    return acc;
  }, {});
}
function riskPlayers(){ return state.roster.filter(p => ["dubbio","infortunato","squalificato","vendere"].includes(p.status)); }
function spent(){ return state.roster.reduce((sum,p) => sum + Number(p.cost || 0), 0); }
function healthAnalysis(){
  const counts = roleCounts();
  const risks = riskPlayers();
  let score = 100;
  const items = [];
  const expected = {P:3,D:8,C:8,A:6};
  for (const role of ["P","D","C","A"]){
    const missing = expected[role] - (counts[role] || 0);
    if (missing > 0){
      score -= missing * (role === "A" ? 7 : 5);
      items.push({level:"danger", text:`Reparto ${roleName(role)} incompleto: mancano ${missing} giocatori rispetto alla struttura classica 3/8/8/6.`});
    } else if (counts[role] > expected[role]) {
      items.push({level:"warn", text:`Reparto ${roleName(role)} sovradimensionato: valuta se hai risorse bloccate inutilmente.`});
    }
  }
  const hardRisks = state.roster.filter(p => ["infortunato","squalificato","vendere"].includes(p.status));
  score -= hardRisks.length * 7;
  score -= state.roster.filter(p => p.status === "dubbio").length * 3;
  if (hardRisks.length) items.push({level:"danger", text:`Hai ${hardRisks.length} giocatori tra infortunati, squalificati o da vendere: priorità mercato.`});
  if (risks.length && !hardRisks.length) items.push({level:"warn", text:`Hai ${risks.length} giocatori da monitorare prima della consegna formazione.`});
  const budgetLeft = Number(state.settings.initialBudget || 0) - spent();
  if (budgetLeft < 0) { score -= 12; items.push({level:"danger", text:`Budget negativo: controlla costi asta o crediti iniziali.`}); }
  if (state.roster.length === 0) { score = 0; items.push({level:"warn", text:"Inserisci la rosa per ottenere diagnosi, formazione suggerita e prompt IA."}); }
  if (!items.length) items.push({level:"ok", text:"Rosa strutturalmente equilibrata. Ora il valore lo fanno titolarità, calendario, bonus e gestione dei rischi."});
  return {score: Math.max(0, Math.min(100, Math.round(score))), items};
}

function renderDashboard(){
  const analysis = healthAnalysis();
  $("healthScore").textContent = analysis.score;
  $("totalPlayers").textContent = state.roster.length;
  $("budgetLeft").textContent = fmt(Number(state.settings.initialBudget || 0) - spent());
  $("riskCount").textContent = riskPlayers().length;
  $("diagnosis").innerHTML = analysis.items.map(i => `<div class="diagnosis-item"><span class="dot ${i.level}"></span><span>${escapeHtml(i.text)}</span></div>`).join("");
  const tips = buildTips();
  $("quickTips").innerHTML = tips.map(t => `<li>${escapeHtml(t)}</li>`).join("") || `<li>Nessun consiglio disponibile: aggiungi giocatori e obiettivi mercato.</li>`;
}
function buildTips(){
  const tips = [];
  const counts = roleCounts();
  if ((counts.A || 0) < 6) tips.push("Priorità: completa l'attacco. È il reparto che pesa di più su bonus e scambi.");
  if ((counts.P || 0) < 3) tips.push("Sistema la porta: idealmente 3 portieri, meglio se collegati per titolarità/copertura.");
  const sell = state.roster.filter(p => p.status === "vendere");
  if (sell.length) tips.push(`Prepara tagli/scambi per: ${sell.map(p=>p.name).join(", ")}.`);
  const topTargets = state.targets.filter(t => t.priority === "alta");
  if (topTargets.length) tips.push(`Obiettivi mercato prioritari: ${topTargets.slice(0,3).map(t=>t.name).join(", ")}.`);
  const doubts = state.roster.filter(p => p.status === "dubbio");
  if (doubts.length) tips.push("Prima della consegna formazione controlla i dubbi: " + doubts.slice(0,4).map(p=>p.name).join(", ") + ".");
  return tips;
}

function renderRoster(){
  const q = normalize($("searchPlayer")?.value || "");
  let players = [...state.roster].sort((a,b) => a.role.localeCompare(b.role) || playerValue(b) - playerValue(a));
  if (currentRoleFilter !== "all") players = players.filter(p => p.role === currentRoleFilter);
  if (q) players = players.filter(p => normalize(`${p.name} ${p.team} ${p.note} ${p.status}`).includes(q));
  $("playersList").innerHTML = players.length ? players.map(playerCard).join("") : `<div class="empty">Nessun giocatore trovato.</div>`;
}
function playerCard(p){
  return `<div class="player-card">
    <span class="badge">${escapeHtml(p.role)}</span>
    <div>
      <strong>${escapeHtml(p.name)}</strong>
      <div class="player-meta">${escapeHtml(p.team || "Senza squadra")} · costo ${fmt(p.cost)} · quot. ${fmt(p.quote)} ${p.note ? "· " + escapeHtml(p.note) : ""}</div>
      <span class="status ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span>
    </div>
    <div class="actions">
      <button class="ghost" onclick="editPlayer('${p.id}')">Modifica</button>
      <button class="danger" onclick="deletePlayer('${p.id}')">Elimina</button>
    </div>
  </div>`;
}
window.editPlayer = (id) => {
  const p = state.roster.find(x => x.id === id);
  if (!p) return;
  $("playerId").value = p.id; $("name").value = p.name; $("role").value = p.role; $("team").value = p.team || "";
  $("cost").value = p.cost || 0; $("quote").value = p.quote || 0; $("status").value = p.status || "ok"; $("note").value = p.note || "";
  toast("Giocatore caricato nel form");
};
window.deletePlayer = (id) => {
  const p = state.roster.find(x => x.id === id);
  if (!p || !confirm(`Eliminare ${p.name}?`)) return;
  state.roster = state.roster.filter(x => x.id !== id);
  state.lineup.slots = state.lineup.slots.filter(x => x.playerId !== id);
  saveState(); renderAll(); toast("Giocatore eliminato");
};

function bindForms(){
  $("saveMatchdayBtn").addEventListener("click", () => { state.matchday = Number($("matchdayInput").value || 1); saveState(); renderAll(); toast("Giornata salvata"); });
  $("playerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("playerId").value || uid();
    const player = { id, name: $("name").value.trim(), role: $("role").value, team: $("team").value.trim(), cost: Number($("cost").value || 0), quote: Number($("quote").value || 0), status: $("status").value, note: $("note").value.trim() };
    const idx = state.roster.findIndex(p => p.id === id);
    if (idx >= 0) state.roster[idx] = player; else state.roster.push(player);
    saveState(); clearPlayerForm(); renderAll(); toast("Giocatore salvato");
  });
  $("resetFormBtn").addEventListener("click", clearPlayerForm);
  $("searchPlayer").addEventListener("input", renderRoster);
  document.querySelectorAll(".chip").forEach(btn => btn.addEventListener("click", () => { document.querySelectorAll(".chip").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); currentRoleFilter = btn.dataset.role; renderRoster(); }));
  $("moduleSelect").addEventListener("change", () => { state.lineup.module = $("moduleSelect").value; buildEmptySlots(); saveState(); renderLineup(); });
  $("strategySelect").addEventListener("change", () => { state.lineup.strategy = $("strategySelect").value; saveState(); });
  $("autoLineupBtn").addEventListener("click", suggestLineup);
  $("saveLineupBtn").addEventListener("click", saveLineupFromUI);
  $("targetForm").addEventListener("submit", saveTarget);
  $("resetTargetBtn").addEventListener("click", clearTargetForm);
  $("settingsForm").addEventListener("submit", saveSettings);
  $("copyPromptBtn").addEventListener("click", () => copyText($("aiPrompt").value));
  $("refreshPromptBtn").addEventListener("click", renderPrompt);
  $("copyBriefBtn").addEventListener("click", () => copyText(buildBrief()));
  $("exportBtn").addEventListener("click", exportJson);
  $("importFile").addEventListener("change", importJson);
  $("resetAllBtn").addEventListener("click", resetAll);
}
function clearPlayerForm(){ $("playerForm").reset(); $("playerId").value = ""; $("cost").value = 0; $("quote").value = 0; }

function moduleRoles(module){
  const [d,c,a] = module.split("-").map(Number);
  return ["P", ...Array(d).fill("D"), ...Array(c).fill("C"), ...Array(a).fill("A")];
}
function buildEmptySlots(){ state.lineup.slots = moduleRoles(state.lineup.module).map((role, i) => ({ slotId: `${role}-${i}`, role, playerId: "" })); }
function renderLineup(){
  if (!state.lineup.slots?.length || state.lineup.slots.map(s=>s.role).join("") !== moduleRoles(state.lineup.module).join("")) buildEmptySlots();
  $("moduleSelect").value = state.lineup.module;
  $("strategySelect").value = state.lineup.strategy || "balanced";
  $("lineupSlots").innerHTML = state.lineup.slots.map((slot, idx) => {
    const options = state.roster.filter(p => p.role === slot.role).sort((a,b)=>playerValue(b)-playerValue(a)).map(p => `<option value="${p.id}" ${p.id === slot.playerId ? "selected" : ""}>${escapeHtml(p.name)} · ${escapeHtml(p.status)} · ${escapeHtml(p.team || "")}</option>`).join("");
    return `<div class="line-row"><strong>${idx+1}. ${slot.role}</strong><select data-slot="${idx}"><option value="">-- scegli --</option>${options}</select></div>`;
  }).join("");
}
function saveLineupFromUI(){
  document.querySelectorAll("#lineupSlots select").forEach(sel => { state.lineup.slots[Number(sel.dataset.slot)].playerId = sel.value; });
  saveState(); renderAll(); toast("Formazione salvata");
}
function suggestLineup(){
  const roles = moduleRoles(state.lineup.module);
  const used = new Set();
  state.lineup.slots = roles.map((role, idx) => {
    const candidates = state.roster.filter(p => p.role === role && !used.has(p.id)).sort((a,b) => playerValue(b) - playerValue(a));
    let chosen = candidates.find(p => p.status === "ok") || candidates.find(p => !["infortunato","squalificato","vendere"].includes(p.status)) || candidates[0];
    if (chosen) used.add(chosen.id);
    return { slotId: `${role}-${idx}`, role, playerId: chosen?.id || "" };
  });
  saveState(); renderLineup(); renderDashboard(); toast("Formazione suggerita");
}

function saveTarget(e){
  e.preventDefault();
  const id = $("targetId").value || uid();
  const target = { id, name: $("targetName").value.trim(), role: $("targetRole").value, team: $("targetTeam").value.trim(), priority: $("targetPriority").value, bid: Number($("targetBid").value || 0), reason: $("targetReason").value.trim() };
  const idx = state.targets.findIndex(t => t.id === id);
  if (idx >= 0) state.targets[idx] = target; else state.targets.push(target);
  saveState(); clearTargetForm(); renderAll(); toast("Obiettivo mercato salvato");
}
function renderTargets(){
  const order = { alta: 0, media: 1, bassa: 2 };
  const targets = [...state.targets].sort((a,b) => order[a.priority] - order[b.priority] || b.bid - a.bid);
  $("targetsList").innerHTML = targets.length ? targets.map(t => `<div class="player-card"><span class="badge">${escapeHtml(t.role)}</span><div><strong>${escapeHtml(t.name)}</strong><div class="player-meta">${escapeHtml(t.team || "Senza squadra")} · priorità ${escapeHtml(t.priority)} · max ${fmt(t.bid)} ${t.reason ? "· " + escapeHtml(t.reason) : ""}</div></div><div class="actions"><button class="ghost" onclick="editTarget('${t.id}')">Modifica</button><button class="danger" onclick="deleteTarget('${t.id}')">Elimina</button></div></div>`).join("") : `<div class="empty">Nessun obiettivo mercato inserito.</div>`;
}
window.editTarget = id => { const t = state.targets.find(x=>x.id===id); if(!t)return; $("targetId").value=t.id; $("targetName").value=t.name; $("targetRole").value=t.role; $("targetTeam").value=t.team||""; $("targetPriority").value=t.priority; $("targetBid").value=t.bid||0; $("targetReason").value=t.reason||""; toast("Obiettivo caricato nel form"); };
window.deleteTarget = id => { if(!confirm("Eliminare obiettivo mercato?"))return; state.targets = state.targets.filter(t=>t.id!==id); saveState(); renderAll(); toast("Obiettivo eliminato"); };
function clearTargetForm(){ $("targetForm").reset(); $("targetId").value=""; $("targetBid").value=1; }

function renderSettings(){
  $("teamName").value = state.settings.teamName || "";
  $("initialBudget").value = state.settings.initialBudget || 500;
  $("leagueTeams").value = state.settings.leagueTeams || 10;
  $("modifierRule").value = state.settings.modifierRule || "";
}
function saveSettings(e){
  e.preventDefault();
  state.settings = { teamName: $("teamName").value.trim() || "La mia rosa", initialBudget: Number($("initialBudget").value || 500), leagueTeams: Number($("leagueTeams").value || 10), modifierRule: $("modifierRule").value.trim() };
  saveState(); renderAll(); toast("Impostazioni salvate");
}

function buildBrief(){
  const analysis = healthAnalysis();
  return `Squadra: ${state.settings.teamName}\nGiornata: ${state.matchday}\nScore rosa: ${analysis.score}/100\nGiocatori: ${state.roster.length}\nBudget residuo: ${Number(state.settings.initialBudget || 0) - spent()}\nRischi: ${riskPlayers().map(p=>`${p.name} (${p.status})`).join(", ") || "nessuno"}\nConsigli interni:\n- ${buildTips().join("\n- ")}`;
}
function buildAIPrompt(){
  const byRole = ["P","D","C","A"].map(role => `\n${roleName(role)}:\n` + state.roster.filter(p=>p.role===role).map(p => `- ${p.name} (${p.team || "?"}) | stato: ${p.status} | costo: ${p.cost || 0} | quot: ${p.quote || 0} | note: ${p.note || "-"}`).join("\n")).join("\n");
  const lineup = state.lineup.slots.map((s,i)=> { const p = state.roster.find(x=>x.id===s.playerId); return `${i+1}. ${s.role}: ${p ? p.name + " (" + p.status + ")" : "vuoto"}`; }).join("\n");
  const targets = state.targets.map(t => `- ${t.name} (${t.role}, ${t.team || "?"}) | priorità ${t.priority} | offerta max ${t.bid} | motivo: ${t.reason || "-"}`).join("\n") || "Nessun obiettivo mercato.";
  return `Agisci come consulente fantacalcio pragmatico per una lega a ${state.settings.leagueTeams} partecipanti.\n\nVincoli:\n- Non inventare news aggiornate su infortuni o probabili formazioni se non te le fornisco.\n- Distingui tra dati certi che ti do e ipotesi.\n- Dammi priorità operative, non spiegoni.\n\nContesto squadra:\n- Nome: ${state.settings.teamName}\n- Giornata: ${state.matchday}\n- Budget iniziale: ${state.settings.initialBudget}\n- Budget residuo stimato: ${Number(state.settings.initialBudget || 0) - spent()}\n- Regola modificatore: ${state.settings.modifierRule || "non specificata"}\n\nRosa:${byRole}\n\nFormazione attuale/suggerita modulo ${state.lineup.module}:\n${lineup || "Non impostata."}\n\nObiettivi mercato:\n${targets}\n\nDiagnosi interna app:\n${buildBrief()}\n\nRichiesta:\n1. Valuta la rosa reparto per reparto.\n2. Dimmi i 5 problemi principali in ordine di urgenza.\n3. Suggerisci formazione e panchina ragionata per la giornata ${state.matchday}.\n4. Indica tagli/scambi/acquisti prioritari.\n5. Dammi una strategia mercato concreta con budget massimo consigliato per ruolo.\n6. Chiudi con una checklist rapida prima della consegna formazione.`;
}
function renderPrompt(){ $("aiPrompt").value = buildAIPrompt(); }
async function copyText(text){
  try { await navigator.clipboard.writeText(text); toast("Copiato negli appunti"); }
  catch { toast("Copia non riuscita: seleziona e copia manualmente"); }
}

function exportJson(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `fantacalcio-manager-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url); toast("Backup esportato");
}
function importJson(e){
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state = { ...structuredClone(DEFAULT_STATE), ...data };
      saveState(); renderAll(); toast("Backup importato");
    } catch { alert("File JSON non valido."); }
  };
  reader.readAsText(file);
  e.target.value = "";
}
function resetAll(){
  if (!confirm("Cancellare tutti i dati salvati in questo browser? Prima esporta un backup se ti serve.")) return;
  state = structuredClone(DEFAULT_STATE); saveState(); renderAll(); toast("Dati cancellati");
}
function escapeHtml(text){
  return String(text ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}

function bindPwa(){
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; $("installBtn").classList.remove("hidden"); });
  $("installBtn").addEventListener("click", async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("installBtn").classList.add("hidden"); });
}

bindNavigation(); bindForms(); bindPwa(); renderAll();
