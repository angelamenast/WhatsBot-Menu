import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CatalogProductDto } from './catalog.dto';
import { CATEGORY_REPOSITORY, type CategoryRepository } from '../business/domain/repositories/category.repository';
import { normalizeName } from '../business/domain/services/normalize-name';
const columns='id,nombre,precio,descripcion,disponible,categorias_producto(nombre)';
const product=(row:any)=>({id:row.id,name:row.nombre,price:Number(row.precio),description:row.descripcion,available:row.disponible,category:row.categorias_producto?.nombre??null});
const categoryName=(value:string|null|undefined)=>value?.trim().replace(/\s+/g,' ')||null;
@Injectable()
export class CatalogService {
 constructor(private readonly business:BusinessService,private readonly supabase:SupabaseService,@Inject(CATEGORY_REPOSITORY) private readonly categories:CategoryRepository){}
 // Igual que la importación del negocio: la categoría se busca por nombre normalizado (sin tildes, mayúsculas
 // ni espacios repetidos) y se crea si no existe. Devuelve el id por nombre normalizado.
 private async categoryIds(businessId:string,names:(string|null|undefined)[]){
  const wanted=new Map<string,string>();for(const name of names){const clean=categoryName(name);if(clean&&!wanted.has(normalizeName(clean)))wanted.set(normalizeName(clean),clean);}
  const ids=new Map<string,string>();if(!wanted.size)return ids;
  try{
   for(const category of await this.categories.listByBusiness(businessId)){const key=normalizeName(category.name);if(wanted.has(key)&&!ids.has(key))ids.set(key,category.id);}
   const missing=[...wanted].filter(([key])=>!ids.has(key)).map(([,name])=>name);
   for(const category of await this.categories.createMany(businessId,missing))ids.set(normalizeName(category.name),category.id);
  }catch{throw new ServiceUnavailableException('No se pudieron guardar las categorías.');}
  return ids;
 }
 private categoryId(ids:Map<string,string>,name:string|null|undefined){const clean=categoryName(name);return clean?ids.get(normalizeName(clean))??null:null;}
 private async businessId(userId:string){const business=await this.business.findByUsuario(userId);if(!business)throw new NotFoundException('Registra tu negocio para gestionar el catálogo.');return business.id as string;}
 async list(userId:string){const id=await this.businessId(userId);const {data,error}=await this.supabase.getClient().from('catalogo_productos').select(columns).eq('negocio_id',id).is('deleted_at',null).order('created_at',{ascending:true});if(error)throw new ServiceUnavailableException('No se pudo cargar el catálogo.');return (data??[]).map(product);}
 async create(userId:string,items:CatalogProductDto[]){const id=await this.businessId(userId);const ids=await this.categoryIds(id,items.map(item=>item.category));const {data,error}=await this.supabase.getClient().from('catalogo_productos').insert(items.map(item=>({negocio_id:id,nombre:item.name,precio:item.price,descripcion:item.description?.trim()||null,disponible:item.available??true,categoria_id:this.categoryId(ids,item.category)}))).select(columns);if(error)throw new ServiceUnavailableException('No se pudieron guardar los productos.');return (data??[]).map(product);}
 async update(userId:string,productId:string,item:CatalogProductDto){const id=await this.businessId(userId);const ids=item.category===undefined?null:await this.categoryIds(id,[item.category]);const {data,error}=await this.supabase.getClient().from('catalogo_productos').update({nombre:item.name,precio:item.price,descripcion:item.description?.trim()||null,...(item.available===undefined?{}:{disponible:item.available}),...(ids?{categoria_id:this.categoryId(ids,item.category)}:{}),updated_at:new Date().toISOString()}).eq('id',productId).eq('negocio_id',id).is('deleted_at',null).select(columns).maybeSingle();if(error)throw new ServiceUnavailableException('No se pudo actualizar el producto.');if(!data)throw new NotFoundException('Producto no encontrado.');return product(data);}
 async remove(userId:string,productId:string){const id=await this.businessId(userId);const {data,error}=await this.supabase.getClient().from('catalogo_productos').update({deleted_at:new Date().toISOString(),disponible:false}).eq('id',productId).eq('negocio_id',id).is('deleted_at',null).select('id').maybeSingle();if(error)throw new ServiceUnavailableException('No se pudo eliminar el producto.');if(!data)throw new NotFoundException('Producto no encontrado.');return {deleted:true};}
}
