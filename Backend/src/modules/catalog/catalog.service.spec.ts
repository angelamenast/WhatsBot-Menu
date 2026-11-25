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
 const categories={listByBusiness:jest.fn<(...args:any[])=>Promise<any>>(),createMany:jest.fn<(...args:any[])=>Promise<any>>()};
 const service=new CatalogService(business as unknown as BusinessService,{getClient:()=>({from})} as unknown as SupabaseService,categories as any);
 beforeEach(()=>{jest.clearAllMocks();business.findByUsuario.mockResolvedValue({id:'business-own'});query.maybeSingle.mockResolvedValue({data:null,error:null});categories.listByBusiness.mockResolvedValue([{id:'cat-bebidas',businessId:'business-own',name:'Bebidas'}]);categories.createMany.mockImplementation(async(_id:string,names:string[])=>names.map(name=>({id:'cat-'+name.toLowerCase(),businessId:'business-own',name})));});
 it('filtra siempre por el negocio del usuario y excluye eliminados',async()=>{
  await service.list('user-own');expect(business.findByUsuario).toHaveBeenCalledWith('user-own');expect(query.eq).toHaveBeenCalledWith('negocio_id','business-own');expect(query.is).toHaveBeenCalledWith('deleted_at',null);
 });
 it('asigna el negocio en el servidor al crear productos',async()=>{
  await service.create('user-own',[{name:'Café',price:5000}]);expect(query.insert).toHaveBeenCalledWith([{negocio_id:'business-own',nombre:'Café',precio:5000,descripcion:null,disponible:true,categoria_id:null}]);
  expect(categories.listByBusiness).not.toHaveBeenCalled();
 });
 it('guarda la categoría: reutiliza la existente por nombre normalizado y crea las que faltan',async()=>{
  await service.create('user-own',[{name:'Jugo',price:4000,category:'  bébidas '},{name:'Torta',price:9000,category:'Postres'},{name:'Agua',price:2000,category:'BEBIDAS'}]);
  expect(categories.listByBusiness).toHaveBeenCalledWith('business-own');
  expect(categories.createMany).toHaveBeenCalledWith('business-own',['Postres']);
  expect(query.insert).toHaveBeenCalledWith([
   expect.objectContaining({nombre:'Jugo',categoria_id:'cat-bebidas'}),
   expect.objectContaining({nombre:'Torta',categoria_id:'cat-postres'}),
   expect.objectContaining({nombre:'Agua',categoria_id:'cat-bebidas'}),
  ]);
 });
 it('al editar sin categoría no la toca y con null o vacío la quita',async()=>{
  query.maybeSingle.mockResolvedValue({data:{id:'p1',nombre:'Café',precio:5000,descripcion:null,disponible:true,categorias_producto:null},error:null});
  await service.update('user-own','p1',{name:'Café',price:5000});
  expect(query.update).toHaveBeenLastCalledWith(expect.not.objectContaining({categoria_id:expect.anything()}));
  await service.update('user-own','p1',{name:'Café',price:5000,category:null});
  expect(query.update).toHaveBeenLastCalledWith(expect.objectContaining({categoria_id:null}));
  await service.update('user-own','p1',{name:'Café',price:5000,category:'Bebidas'});
  expect(query.update).toHaveBeenLastCalledWith(expect.objectContaining({categoria_id:'cat-bebidas'}));
 });
 it('devuelve el nombre de la categoría de cada producto',async()=>{
  const listed:any={...query,then:(resolve:any)=>Promise.resolve({data:[{id:'p1',nombre:'Jugo',precio:'4000',descripcion:null,disponible:true,categorias_producto:{nombre:'Bebidas'}},{id:'p2',nombre:'Pan',precio:'1000',descripcion:null,disponible:true,categorias_producto:null}],error:null}).then(resolve)};
  for(const method of ['select','eq','is','order'])listed[method]=jest.fn(()=>listed);
  from.mockReturnValueOnce(listed);
  const items=await service.list('user-own');
  expect(listed.select).toHaveBeenCalledWith('id,nombre,precio,descripcion,disponible,categorias_producto(nombre)');
  expect(items.map(item=>item.category)).toEqual(['Bebidas',null]);
 });
 it('acepta la categoría como texto opcional de hasta 80 caracteres',async()=>{
  expect(await validate(plainToInstance(CatalogProductDto,{name:'Jugo',price:1,category:'Bebidas'}))).toHaveLength(0);
  expect(await validate(plainToInstance(CatalogProductDto,{name:'Jugo',price:1,category:null}))).toHaveLength(0);
  expect((await validate(plainToInstance(CatalogProductDto,{name:'Jugo',price:1,category:'x'.repeat(81)}))).length).toBeGreaterThan(0);
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
