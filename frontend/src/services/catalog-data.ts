export interface Product {id:string;name:string;price:number;description:string|null;available:boolean}
export type ProductInput=Omit<Product,'id'|'available'> & {available?:boolean};
export function parseCatalogCSV(source:string):ProductInput[]{
 const text=source.replace(/^\uFEFF/,'');const delimiter=text.split(/\r?\n/,1)[0].includes(';')?';':',';
 const rows:string[][]=[];let row:string[]=[];let field='';let quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field.length===0)quoted=!quoted;else throw new Error('CSV inválido: revisa las comillas.');}else if(c===delimiter&&!quoted){row.push(field.trim());field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw new Error('CSV inválido: hay comillas sin cerrar.');row.push(field.trim());if(row.some(Boolean))rows.push(row);
 const headers=rows.shift()?.map(h=>h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))??[];
 const name=headers.indexOf('nombre'),price=headers.indexOf('precio'),description=headers.indexOf('descripcion');
 if(name<0||price<0)throw new Error('El CSV debe incluir las columnas nombre y precio.');
 if(!rows.length||rows.length>100)throw new Error('Importa entre 1 y 100 productos por archivo.');
 return rows.map((r,index)=>{const raw=r[price]?.replace(',','.');const amount=Number(raw);if(!r[name]||r[name].length>200||!raw||!/^\d+(?:\.\d{1,2})?$/.test(raw)||!Number.isFinite(amount)||amount>9999999999.99||(r[description]?.length??0)>2000)throw new Error('Revisa el nombre, precio o descripción de la fila '+(index+2)+'.');return {name:r[name],price:amount,description:description<0?null:r[description]||null};});
}
export function readPersonality(value:string|null){const match=value?.match(/^Idioma de respuesta: (Español|Inglés|Portugués)\.\n\n/);return {language:match?.[1]??'Español',instructions:match?value!.slice(match[0].length):value??''};}
export function writePersonality(language:string,instructions:string){return 'Idioma de respuesta: '+language+'.\n\n'+instructions.trim();}
