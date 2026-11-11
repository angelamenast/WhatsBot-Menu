import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { BusinessService } from '../business/business.service';
import { SupabaseService } from '../../shared/supabase/supabase.service';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CatalogProductDto, ImportCatalogDto } from './catalog.dto';
describe('CatalogService',()=>{
 const business={findByUsuario:jest.fn<(...args:any[])=>Promise<any>>()};
 const query:any={};for(const method of ['select','eq','is','order','insert','update'])query[method]=jest.fn(()=>query);
 query.maybeSingle=jest.fn<(...args:any[])=>Promise<any>>();
 query.then=(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve);
 const from=jest.fn(()=>query);
 const service=new CatalogService(business as unknown as BusinessService,{getClient:()=>({from})} as unknown as SupabaseService);
 beforeEach(()=>{jest.clearAllMocks();business.findByUsuario.mockResolvedValue({id:'business-own'});query.maybeSingle.mockResolvedValue({data:null,error:null});});
 it('filtra siempre por el negocio del usuario y excluye eliminados',async()=>{
  await service.list('user-own');expect(business.findByUsuario).toHaveBeenCalledWith('user-own');expect(query.eq).toHaveBeenCalledWith('negocio_id','business-own');expect(query.is).toHaveBeenCalledWith('deleted_at',null);
 });
 it('asigna el negocio en el servidor al crear productos',async()=>{
  await service.create('user-own',[{name:'Café',price:5000}]);expect(query.insert).toHaveBeenCalledWith([{negocio_id:'business-own',nombre:'Café',precio:5000,descripcion:null,disponible:true}]);
 });
 it('no modifica ni elimina productos de otra cuenta',async()=>{
  await expect(service.update('user-own','foreign-product',{name:'Otro',price:0})).rejects.toThrow(NotFoundException);
  await expect(service.remove('user-own','foreign-product')).rejects.toThrow(NotFoundException);
  expect(query.eq).toHaveBeenCalledWith('negocio_id','business-own');expect(query.eq).toHaveBeenCalledWith('id','foreign-product');
 });
 it('no consulta el catálogo de una cuenta sin negocio',async()=>{
  business.findByUsuario.mockResolvedValue(null);await expect(service.list('new')).rejects.toThrow(NotFoundException);expect(from).not.toHaveBeenCalled();
 });
 it('rechaza precios negativos y campos vacíos incluso en importaciones',async()=>{
  expect((await validate(plainToInstance(CatalogProductDto,{name:'   ',price:-1}))).length).toBeGreaterThan(0);
  expect((await validate(plainToInstance(ImportCatalogDto,{items:[{name:'Producto',price:1.111}]}))).length).toBeGreaterThan(0);
 });
});
