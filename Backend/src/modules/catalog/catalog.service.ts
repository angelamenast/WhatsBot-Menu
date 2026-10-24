import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { BusinessService } from '../business/business.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { CatalogProductDto } from './catalog.dto';
const columns='id,nombre,precio,descripcion,disponible';
const product=(row:any)=>({id:row.id,name:row.nombre,price:Number(row.precio),description:row.descripcion,available:row.disponible});
@Injectable()
export class CatalogService {
 constructor(private readonly business:BusinessService,private readonly supabase:SupabaseService){}
 private async businessId(userId:string){const business=await this.business.findByUsuario(userId);if(!business)throw new NotFoundException('Registra tu negocio para gestionar el catálogo.');return business.id as string;}
 async list(userId:string){const id=await this.businessId(userId);const {data,error}=await this.supabase.getClient().from('catalogo_productos').select(columns).eq('negocio_id',id).is('deleted_at',null).order('created_at',{ascending:true});if(error)throw new ServiceUnavailableException('No se pudo cargar el catálogo.');return (data??[]).map(product);}
 async create(userId:string,items:CatalogProductDto[]){const id=await this.businessId(userId);const {data,error}=await this.supabase.getClient().from('catalogo_productos').insert(items.map(item=>({negocio_id:id,nombre:item.name,precio:item.price,descripcion:item.description?.trim()||null,disponible:item.available??true}))).select(columns);if(error)throw new ServiceUnavailableException('No se pudieron guardar los productos.');return (data??[]).map(product);}
 async update(userId:string,productId:string,item:CatalogProductDto){const id=await this.businessId(userId);const {data,error}=await this.supabase.getClient().from('catalogo_productos').update({nombre:item.name,precio:item.price,descripcion:item.description?.trim()||null,...(item.available===undefined?{}:{disponible:item.available}),updated_at:new Date().toISOString()}).eq('id',productId).eq('negocio_id',id).is('deleted_at',null).select(columns).maybeSingle();if(error)throw new ServiceUnavailableException('No se pudo actualizar el producto.');if(!data)throw new NotFoundException('Producto no encontrado.');return product(data);}
 async remove(userId:string,productId:string){const id=await this.businessId(userId);const {data,error}=await this.supabase.getClient().from('catalogo_productos').update({deleted_at:new Date().toISOString(),disponible:false}).eq('id',productId).eq('negocio_id',id).is('deleted_at',null).select('id').maybeSingle();if(error)throw new ServiceUnavailableException('No se pudo eliminar el producto.');if(!data)throw new NotFoundException('Producto no encontrado.');return {deleted:true};}
}
