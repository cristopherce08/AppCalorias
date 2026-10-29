/* MiCalorías — aplicación 100% local. Sin librerías ni servicios de terceros. */
'use strict';
const DB_NAME = 'micalorias-local-v1';
const MEALS = [
  { id:'desayuno', title:'Desayuno', emoji:'☀️' },
  { id:'almuerzo', title:'Almuerzo', emoji:'🍽️' },
  { id:'cena', title:'Cena', emoji:'🌙' },
  { id:'snack', title:'Snacks', emoji:'🍎' }
];
const $ = selector => document.querySelector(selector);
const numberFormat = new Intl.NumberFormat('es-PE', {maximumFractionDigits:1});
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const validDate = value => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [y,m,d] = value.split('-').map(Number);
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.valueOf()) && date.getFullYear()===y && date.getMonth()+1===m && date.getDate()===d;
};
const esc = value => String(value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const fmt = number => numberFormat.format(Number.isFinite(Number(number)) ? Number(number) : 0);
const keyName = text => String(text).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
const dateText = date => new Intl.DateTimeFormat('es-PE',{weekday:'long',day:'numeric',month:'long'}).format(new Date(`${date}T12:00:00`));
const offsetDate = (date, days) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let db;
let entries = [];
let foods = [];
let settings = {};
let currentDate = todayISO();
let currentView = 'diario';
let editingId = null;
let toastTimeout;

function openDatabase(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,1);
    req.onupgradeneeded = () => {
      const database = req.result;
      const entryStore = database.createObjectStore('entries',{keyPath:'id'});
      entryStore.createIndex('date','date',{unique:false});
      database.createObjectStore('foods',{keyPath:'id'});
      database.createObjectStore('settings',{keyPath:'key'});
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    req.onblocked = () => reject(new Error('La base de datos está bloqueada por otra pestaña.'));
  });
}
function getAll(table){
  return new Promise((resolve,reject)=>{
    const req = db.transaction(table,'readonly').objectStore(table).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function mutate(table, method, value){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction(table,'readwrite');
    const store = tx.objectStore(table);
    store[method](value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Error guardando en el dispositivo'));
    tx.onabort = () => reject(tx.error || new Error('La operación se canceló'));
  });
}
async function refresh(){
  const [newEntries,newFoods,newSettings] = await Promise.all([getAll('entries'),getAll('foods'),getAll('settings')]);
  entries = newEntries;
  foods = newFoods;
  settings = Object.fromEntries(newSettings.map(s => [s.key,s.value]));
  renderAll();
}
function sumKcal(list){ return list.reduce((total,e)=>total + (Number(e.amount)*Number(e.kcalPer100)/100),0); }
function dayEntries(day){return entries.filter(e=>e.date===day);}
function renderAll(){ renderDiary();renderFoods();renderHistory();renderSettings();renderSuggestions(); }
function renderDiary(){
  $('#diary-date').value = currentDate;
  $('#date-pretty').textContent = dateText(currentDate);
  const day = dayEntries(currentDate);
  const total = sumKcal(day);
  $('#day-total').textContent = fmt(total);
  $('#total-subtitle').textContent = day.length ? `${day.length} ingrediente${day.length===1?'':'s'} registrado${day.length===1?'':'s'}` : 'Añade tu primer alimento';
  const goal = Number(settings.goal || 0);
  $('#goal-line').hidden = !(goal > 0);
  if(goal>0) $('#goal-line').textContent = `${fmt(total)} de ${fmt(goal)} kcal de tu objetivo personal (${fmt(total / goal * 100)} %) `;
  $('#meals-container').innerHTML = MEALS.map(meal=>{
    const list = day.filter(e => e.meal === meal.id).sort((a,b) => (a.createdAt||'').localeCompare(b.createdAt||''));
    const detail = list.length ? `<div class="meal-items">${list.map(e=>`<div class="meal-item"><div><div class="meal-item-name">${esc(e.name)}</div><div class="meal-item-detail">${fmt(e.amount)} ${esc(e.unit)} · ${fmt(e.kcalPer100)} kcal/100 ${esc(e.unit)}</div></div><div class="meal-item-side"><span class="meal-item-kcal">${fmt(e.amount*e.kcalPer100/100)}</span><button type="button" class="icon-action" data-edit="${esc(e.id)}" aria-label="Editar ${esc(e.name)}">✎</button><button type="button" class="icon-action" data-delete="${esc(e.id)}" aria-label="Eliminar ${esc(e.name)}">×</button></div></div>`).join('')}</div>` : '<div class="meal-empty">Todavía no has registrado alimentos</div>';
    return `<article class="meal-card"><div class="meal-top"><div class="meal-title-area"><div class="meal-emoji" aria-hidden="true">${meal.emoji}</div><div><div class="meal-name">${meal.title}</div><div class="meal-count">${list.length} ingrediente${list.length===1?'':'s'}</div></div></div><div class="meal-kcal">${fmt(sumKcal(list))} <small>kcal</small></div></div>${detail}<button type="button" data-add-meal="${meal.id}" class="meal-add">＋ Añadir ingrediente</button></article>`;
  }).join('');
}
function renderSuggestions(){ $('#food-suggestions').innerHTML=foods.slice().sort((a,b)=>a.name.localeCompare(b.name,'es')).map(f=>`<option value="${esc(f.name)}"></option>`).join(''); }
function renderFoods(){
  const query = keyName($('#food-search').value);
  const filtered = foods.filter(f=>keyName(f.name).includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  $('#foods-container').innerHTML = filtered.length ? filtered.map(f=>`<article class="food-card"><div><div class="food-name">${esc(f.name)}</div><div class="food-meta">${fmt(f.kcalPer100)} kcal / 100 ${esc(f.unit)}</div></div><div class="food-actions"><button type="button" class="mini-button" data-use-food="${esc(f.id)}">Usar</button><button type="button" class="mini-button danger" data-delete-food="${esc(f.id)}" aria-label="Eliminar alimento ${esc(f.name)}">×</button></div></article>`).join('') : '<div class="empty-state"><strong>No hay alimentos</strong>Los ingredientes que registres aparecerán aquí.</div>';
}
function renderHistory(){
  const days = [...new Set(entries.map(e=>e.date))].sort().reverse();
  $('#history-container').innerHTML = days.length ? days.map(day=>{
    const list=dayEntries(day);
    return `<button type="button" class="history-card" data-open-date="${day}"><span><span class="history-name">${esc(dateText(day))}</span><span class="history-meta" style="display:block">${list.length} ingrediente${list.length===1?'':'s'}</span></span><span class="history-right">${fmt(sumKcal(list))} kcal ›</span></button>`;
  }).join('') : '<div class="empty-state"><strong>Tu historial está vacío</strong>Cuando registres tu primera comida, aparecerá aquí.</div>';
}
function renderSettings(){ $('#goal-input').value = settings.goal ?? ''; }
function toast(message){
  const element=$('#toast');element.textContent=message;element.hidden=false;
  clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>element.hidden=true,3500);
}
function showView(view){
  if(!['diario','alimentos','historial','ajustes'].includes(view))return;
  currentView=view;
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);
  document.querySelectorAll('.nav-item').forEach(el=>{
    const active=el.dataset.view===view;
    el.classList.toggle('active',active);
    if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  window.scrollTo({top:0,behavior:'auto'});
}
function findFoodByName(name){return foods.find(f=>keyName(f.name)===keyName(name));}
function setDensityLabel(){ $('#kcal-label').firstChild.textContent=`Calorías por 100 ${$('#entry-unit').value}`; }
function updatePreview(){
  const a=Number($('#entry-amount').value), d=Number($('#entry-density').value);
  $('#kcal-preview-value').textContent=`${fmt(Math.max(0,a*d/100))} kcal`;
}
function openEntry(meal='cena',entry=null,food=null){
  editingId=entry?.id || null;
  $('#entry-form').reset();
  $('#entry-meal').value=entry?.meal || meal;
  $('#entry-name').value=entry?.name || food?.name || '';
  $('#entry-amount').value=entry?.amount ?? 100;
  $('#entry-unit').value=entry?.unit || food?.unit || 'g';
  $('#entry-density').value=entry?.kcalPer100 ?? food?.kcalPer100 ?? '';
  $('#dialog-title').textContent=entry ? 'Editar ingrediente':'Añadir ingrediente';
  $('#btn-save-entry').textContent=entry ? 'Guardar cambios':'Guardar ingrediente';
  $('#entry-save-food').checked=true;
  setDensityLabel();updatePreview();$('#entry-dialog').showModal();
  setTimeout(()=>$('#entry-name').focus(),50);
}
async function upsertFood(entry){
  const existing=foods.find(f=>keyName(f.name)===keyName(entry.name)&&f.unit===entry.unit);
  await mutate('foods','put',{
    id:existing?.id || makeId(),name:entry.name,unit:entry.unit,kcalPer100:entry.kcalPer100,
    updatedAt:new Date().toISOString()
  });
}
async function saveEntry(event){
  event.preventDefault();
  const name=$('#entry-name').value.trim();
  const amount=Number($('#entry-amount').value);
  const kcalPer100=Number($('#entry-density').value);
  const unit=$('#entry-unit').value,meal=$('#entry-meal').value;
  if(!name || !Number.isFinite(amount) || amount<=0 || amount>100000 || !Number.isFinite(kcalPer100) || kcalPer100<0 || kcalPer100>10000 || !['g','ml'].includes(unit) || !MEALS.some(m=>m.id===meal)){
    toast('Revisa los valores del ingrediente');return;
  }
  const prior=entries.find(e=>e.id===editingId);
  const entry={id:prior?.id || makeId(),date:prior?.date || currentDate,meal,name,amount,unit,kcalPer100,createdAt:prior?.createdAt || new Date().toISOString()};
  $('#btn-save-entry').disabled=true;
  try{
    await mutate('entries','put',entry);
    if($('#entry-save-food').checked)await upsertFood(entry);
    $('#entry-dialog').close(); await refresh();
    toast(prior?'Ingrediente actualizado':'Ingrediente guardado');
  }catch(error){console.error(error);toast('Error al guardar: revisa el almacenamiento');}
  finally{$('#btn-save-entry').disabled=false;}
}
async function removeEntry(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  if(!confirm(`¿Eliminar “${e.name}” de este día?`))return;
  try{await mutate('entries','delete',id);await refresh();toast('Ingrediente eliminado');}catch(err){console.error(err);toast('No se pudo eliminar');}
}
async function removeFood(id){
  const f=foods.find(x=>x.id===id);if(!f)return;
  if(!confirm(`¿Eliminar “${f.name}” de tus alimentos frecuentes? Los registros anteriores se conservarán.`))return;
  try{await mutate('foods','delete',id);await refresh();toast('Alimento eliminado del catálogo');}catch(err){console.error(err);toast('No se pudo eliminar');}
}
async function saveGoal(){
  const raw=$('#goal-input').value.trim();const value=raw===''?null:Number(raw);
  if(value!==null&&(!Number.isFinite(value)||value<0||value>20000)){toast('Introduce un objetivo entre 0 y 20 000');return;}
  try{await mutate('settings','put',{key:'goal',value});await refresh();toast('Objetivo guardado');}catch(err){console.error(err);toast('No se pudo guardar');}
}
function getExportData(){return {app:'MiCalorías',schemaVersion:1,exportedAt:new Date().toISOString(),entries,foods,settings:Object.entries(settings).map(([key,value])=>({key,value}))};}
async function exportData(){
  try{
    const blob=new Blob([JSON.stringify(getExportData(),null,2)],{type:'application/json'});
    const name=`micalorias-respaldo-${todayISO()}.json`;
    const file=new File([blob],name,{type:'application/json'});
    if(navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file],title:'Respaldo de MiCalorías'});toast('Elige dónde guardar tu respaldo');return;}
      catch(err){if(err.name==='AbortError')return;}
    }
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('Respaldo descargado');
  }catch(err){console.error(err);toast('No se pudo exportar. Inténtalo de nuevo.');}
}
function validateImport(json){
  if(!json || json.app!=='MiCalorías'||json.schemaVersion!==1 || !Array.isArray(json.entries)||!Array.isArray(json.foods)||!Array.isArray(json.settings))throw new Error('El archivo no es un respaldo compatible de MiCalorías');
  if(json.entries.length>200000||json.foods.length>20000||json.settings.length>100)throw new Error('El archivo contiene demasiados registros');
  const seenEntries=new Set(),seenFoods=new Set(),seenSettings=new Set();
  const goodEntry=e=>{
    if(!e || typeof e.id!=='string'||e.id.length>150||!validDate(e.date)||!MEALS.some(m=>m.id===e.meal)||typeof e.name!=='string'||!e.name.trim()||e.name.length>120||!['g','ml'].includes(e.unit)||!Number.isFinite(e.amount)||e.amount<=0||e.amount>100000||!Number.isFinite(e.kcalPer100)||e.kcalPer100<0||e.kcalPer100>10000||seenEntries.has(e.id))return false;
    seenEntries.add(e.id);return true;
  };
  const goodFood=f=>{
    if(!f||typeof f.id!=='string'||f.id.length>150||typeof f.name!=='string'||!f.name.trim()||f.name.length>120||!['g','ml'].includes(f.unit)||!Number.isFinite(f.kcalPer100)||f.kcalPer100<0||f.kcalPer100>10000||seenFoods.has(f.id))return false;
    seenFoods.add(f.id);return true;
  };
  const goodSetting=s=>{
    if(!s||s.key!=='goal'||seenSettings.has(s.key)||!(s.value===null||(Number.isFinite(s.value)&&s.value>=0&&s.value<=20000)))return false;
    seenSettings.add(s.key);return true;
  };
  if(!json.entries.every(goodEntry)||!json.foods.every(goodFood)||!json.settings.every(goodSetting))throw new Error('El respaldo contiene datos inválidos o repetidos');
}
function importTransaction(data){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['entries','foods','settings'],'readwrite');
    for(const name of ['entries','foods','settings'])tx.objectStore(name).clear();
    for(const e of data.entries)tx.objectStore('entries').put(e);
    for(const f of data.foods)tx.objectStore('foods').put(f);
    for(const s of data.settings)tx.objectStore('settings').put(s);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
  });
}
async function importData(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
    if(file.size>50_000_000)throw new Error('Archivo demasiado grande');
    const parsed=JSON.parse(await file.text());
    validateImport(parsed);
    if(!confirm(`Este respaldo contiene ${parsed.entries.length} registros y ${parsed.foods.length} alimentos. ¿Sustituir TODOS los datos actuales? Esta acción no se puede deshacer.`))return;
    await importTransaction(parsed);currentDate=todayISO();await refresh();showView('diario');toast('Respaldo importado correctamente');
  }catch(err){console.error(err);alert(`No se importó el respaldo: ${err.message||'error desconocido'}`);}
}
async function checkStorage(){
  try{
    const protectedStorage=await navigator.storage?.persisted?.();
    $('#storage-status').textContent = protectedStorage ? '✓ Almacenamiento persistente concedido' : 'Almacenamiento local activo (sin garantía de permanencia)';
  }catch{$('#storage-status').textContent='Los datos están guardados localmente';}
}
async function requestPersistence(){
  try{
    if(!navigator.storage?.persist){toast('Tu navegador no permite solicitar esta protección');return;}
    const granted=await navigator.storage.persist();await checkStorage();
    toast(granted?'Protección de almacenamiento concedida':'No se concedió protección; realiza respaldos periódicos');
  }catch{toast('No se pudo solicitar la protección');}
}
function attachEvents(){
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
  $('#btn-today').addEventListener('click',()=>{currentDate=todayISO();renderDiary();});
  $('#btn-prev-date').addEventListener('click',()=>{currentDate=offsetDate(currentDate,-1);renderDiary();});
  $('#btn-next-date').addEventListener('click',()=>{currentDate=offsetDate(currentDate,1);renderDiary();});
  $('#diary-date').addEventListener('change',event=>{if(validDate(event.target.value)){currentDate=event.target.value;renderDiary();}});
  $('#btn-add').addEventListener('click',()=>openEntry(new Date().getHours()<11?'desayuno':new Date().getHours()<17?'almuerzo':'cena'));
  $('#meals-container').addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.addMeal)openEntry(b.dataset.addMeal);
    if(b.dataset.edit){const found=entries.find(e=>e.id===b.dataset.edit);if(found)openEntry(found.meal,found);}
    if(b.dataset.delete)removeEntry(b.dataset.delete);
  });
  $('#food-search').addEventListener('input',renderFoods);
  $('#foods-container').addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.dataset.useFood){const found=foods.find(f=>f.id===b.dataset.useFood);if(found){showView('diario');openEntry('cena',null,found);}}
    if(b.dataset.deleteFood)removeFood(b.dataset.deleteFood);
  });
  $('#history-container').addEventListener('click',event=>{const b=event.target.closest('[data-open-date]');if(b){currentDate=b.dataset.openDate;showView('diario');renderDiary();}});
  $('#btn-close-dialog').addEventListener('click',()=>$('#entry-dialog').close());
  $('#entry-dialog').addEventListener('click',event=>{if(event.target===$('#entry-dialog'))$('#entry-dialog').close();});
  $('#entry-name').addEventListener('change',()=>{const f=findFoodByName($('#entry-name').value);if(f){$('#entry-density').value=f.kcalPer100;$('#entry-unit').value=f.unit;setDensityLabel();updatePreview();}});
  $('#entry-unit').addEventListener('change',()=>{setDensityLabel();updatePreview();});
  ['#entry-amount','#entry-density'].forEach(sel=>$(sel).addEventListener('input',updatePreview));
  $('#entry-form').addEventListener('submit',saveEntry);
  $('#btn-save-goal').addEventListener('click',saveGoal);
  $('#btn-export').addEventListener('click',exportData);
  $('#file-import').addEventListener('change',importData);
  $('#btn-persist').addEventListener('click',requestPersistence);
}
async function init(){
  try{
    db=await openDatabase();
    attachEvents();await refresh();await checkStorage();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(error=>console.warn('Offline no disponible aún:',error));
  }catch(error){
    console.error(error);
    $('#main-content').innerHTML='<section class="empty-state"><strong>No se pudo iniciar el almacenamiento</strong>Comprueba que no estás usando navegación privada, tienes espacio libre y abriste la aplicación desde HTTPS.</section>';
  }
}
init();
