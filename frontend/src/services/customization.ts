import { request } from '../api/http';
import { platform } from './platform';
import { confirmAction } from './notifications';
import { parseCatalogCSV,type Product,type ProductInput } from './catalog-data';
import { initAgentForm } from './agent-form-view';
import { attentionStateText,CHECKLIST_LINKS,missingSteps } from './setup-checklist';
const field=(id:string)=>document.getElementById(id) as HTMLInputElement;
const feedback=(id:string,message:string,kind='success')=>{const box=document.getElementById(id)!;box.textContent=message;box.dataset.kind=kind;box.hidden=false;};
const message=(error:unknown)=>error instanceof Error?error.message:'No se pudo completar la operación.';
const send=(method:string,body:unknown)=>({method,body:JSON.stringify(body)});
function stepRow(clave:string,label:string,done:boolean){
 const row=document.createElement('li');row.dataset.done=String(done);
 const icon=document.createElement('span');icon.className='material-symbols-outlined';icon.textContent=done?'check_circle':'radio_button_unchecked';icon.setAttribute('aria-hidden','true');
 const text=document.createElement('span');text.textContent=label;const status=document.createElement('span');status.className='sr-only';status.textContent=done?' (completado)':' (pendiente)';text.append(status);
 row.append(icon,text);const target=CHECKLIST_LINKS[clave];if(!done&&target){const link=document.createElement('a');link.href=target.href;link.textContent=target.text;row.append(link);}
 return row;
}
// Va aparte del resto de la vista: un fallo aquí no debe bloquear catálogo ni personalidad.
// Tampoco depende de puedeEditar: sin plan el negocio debe poder ver el checklist y apagar la atención.
function initAttention(){
 const toggle=field('attention-switch');const off=document.getElementById('attention-off') as HTMLButtonElement;const steps=document.getElementById('setup-steps')!;const missing=document.getElementById('attention-missing')!;const bar=document.getElementById('setup-progress')!;const fill=document.getElementById('setup-progress-fill')!;const percent=document.getElementById('setup-percent')!;
 let active:boolean|null=null;let saving=false;let latest=0;
 function paint(){toggle.indeterminate=active===null;toggle.checked=active===true;toggle.disabled=saving;off.hidden=active!==null;off.disabled=saving;document.getElementById('attention-state')!.textContent=attentionStateText(active);}
 function hideMissing(){missing.replaceChildren();missing.hidden=true;}
 async function refresh(){
  const current=++latest;
  try{const checklist=await platform.checklist();if(current!==latest)return;
   const value=Math.min(100,Math.max(0,checklist.porcentaje));steps.replaceChildren(...checklist.items.map(item=>stepRow(item.clave,item.label,item.completo)));fill.style.width=value+'%';bar.setAttribute('aria-valuenow',String(value));percent.textContent=value+'% completado';document.getElementById('checklist-feedback')!.hidden=true;
   // Si hay un rechazo 409 a la vista, se sincroniza con lo que el dueño ya completó.
   if(!missing.hidden){if(checklist.completo){hideMissing();document.getElementById('attention-feedback')!.hidden=true;}else missing.replaceChildren(...checklist.items.filter(item=>!item.completo).map(item=>stepRow(item.clave,item.label,false)));}
  }catch(error){if(current===latest)feedback('checklist-feedback',message(error),'error');}
 }
 async function change(desired:boolean){
  if(saving)return;saving=true;const hadFocus=document.activeElement===toggle||document.activeElement===off;hideMissing();document.getElementById('attention-feedback')!.hidden=true;paint();
  try{active=(await platform.setAutoAttention(desired)).atencionAutomaticaActiva;feedback('attention-feedback',active?'Atención automática encendida.':'Atención automática apagada.');}
  catch(error){feedback('attention-feedback',message(error),'error');const pending=missingSteps(error);if(pending.length){missing.replaceChildren(...pending.map(step=>stepRow(step.clave,step.label,false)));missing.hidden=false;void refresh();}}
  finally{saving=false;paint();if(hadFocus)toggle.focus();}
 }
 toggle.addEventListener('change',()=>{void change(toggle.checked);});off.addEventListener('click',()=>{void change(false);});
 paint();void refresh();return refresh;
}
export async function initCustomization(){
 const [agent,subscription,products]=await Promise.all([platform.agent(),platform.subscription(),request<Product[]>('/catalog')]);
 const refreshChecklist=initAttention();
 let items=products;let editing:string|null=null;let busy=false;const writable=subscription.puedeEditar;
 initAgentForm(agent,writable,()=>{void refreshChecklist();});
 for(const id of ['product-fields','import-fields'])(document.getElementById(id) as HTMLFieldSetElement).disabled=!writable;
 document.getElementById('custom-readonly')!.hidden=writable;
 function reset(){editing=null;(document.getElementById('product-form') as HTMLFormElement).reset();document.getElementById('product-form-title')!.textContent='Añadir producto';document.getElementById('cancel-product')!.hidden=true;document.querySelector('#save-product span')!.textContent='add';}
 function render(){
 const body=document.getElementById('catalog-products')!;body.replaceChildren();document.getElementById('catalog-empty')!.hidden=items.length>0;
 for(const item of items){const row=document.createElement('tr');for(const text of [item.name+(item.available?'':' · No disponible'),new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:2}).format(item.price),item.description||'—']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
 const actions=document.createElement('td');
 for(const [icon,label,run]of [['edit','Editar '+item.name,()=>{editing=item.id;field('product-name').value=item.name;field('product-price').value=String(item.price);field('product-description').value=item.description??'';document.getElementById('product-form-title')!.textContent='Editar producto';document.getElementById('cancel-product')!.hidden=false;document.querySelector('#save-product span')!.textContent='check';field('product-name').focus();}],['delete','Eliminar '+item.name,async()=>{if(!await confirmAction('Se eliminará “'+item.name+'” de tu catálogo.','Eliminar producto','Eliminar'))return;await mutate(async()=>{await request('/catalog/'+encodeURIComponent(item.id),{method:'DELETE'});items=items.filter(p=>p.id!==item.id);if(editing===item.id)reset();render();feedback('catalog-feedback','Producto eliminado.');});}]] as const){const button=document.createElement('button');button.type='button';button.className='row-action';button.disabled=!writable||busy;button.setAttribute('aria-label',label);button.title=label;const span=document.createElement('span');span.className='material-symbols-outlined';span.textContent=icon;span.setAttribute('aria-hidden','true');button.append(span);button.addEventListener('click',()=>{void run();});actions.append(button);}row.append(actions);body.append(row);}
 }
 async function mutate(action:()=>Promise<void>){if(busy||!writable)return;busy=true;for(const id of ['product-fields','import-fields'])(document.getElementById(id) as HTMLFieldSetElement).disabled=true;render();try{await action();void refreshChecklist();}catch(error){feedback('catalog-feedback',message(error),'error');}finally{busy=false;for(const id of ['product-fields','import-fields'])(document.getElementById(id) as HTMLFieldSetElement).disabled=!writable;render();}}
 document.getElementById('cancel-product')!.addEventListener('click',reset);
 document.getElementById('product-form')!.addEventListener('submit',event=>{event.preventDefault();const data:ProductInput={name:field('product-name').value.trim(),price:Number(field('product-price').value),description:field('product-description').value.trim()||null};if(!data.name){field('product-name').setCustomValidity('Escribe el nombre del producto.');field('product-name').reportValidity();return;}void mutate(async()=>{if(editing){const result=await request<Product>('/catalog/'+encodeURIComponent(editing),send('PUT',data));items=items.map(item=>item.id===result.id?result:item);}else{items.push(await request<Product>('/catalog',send('POST',data)));}reset();render();feedback('catalog-feedback','Producto guardado en tu catálogo.');});});
 field('product-name').addEventListener('input',()=>field('product-name').setCustomValidity(''));
 const tabs=['list','upload'];function selectTab(selected:string){for(const tab of tabs){const active=tab===selected;document.getElementById('catalog-'+tab)!.hidden=!active;document.getElementById(tab+'-tab')!.setAttribute('aria-selected',String(active));document.getElementById(tab+'-tab')!.tabIndex=active?0:-1;}}
 for(const tab of tabs){document.getElementById(tab+'-tab')!.addEventListener('click',()=>selectTab(tab));document.getElementById(tab+'-tab')!.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const next=tab==='list'?'upload':'list';selectTab(next);document.getElementById(next+'-tab')!.focus();}});}
 document.getElementById('download-template')!.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob(['\uFEFFnombre,precio,descripcion\n'],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='plantilla-catalogo.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 document.getElementById('catalog-import-form')!.addEventListener('submit',event=>{event.preventDefault();const file=field('catalog-file').files?.[0];if(!file)return;void mutate(async()=>{if(file.size>1024*1024)throw new Error('El archivo debe pesar menos de 1 MB.');const data=parseCatalogCSV(await file.text());const created=await request<Product[]>('/catalog/import',send('POST',{items:data}));items.push(...created);(document.getElementById('catalog-import-form') as HTMLFormElement).reset();selectTab('list');render();feedback('catalog-feedback',created.length+' productos importados.');});});
 render();
}
