import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AuditService } from '../audit/audit.service';
import { CustomerAccountMovementType, InventoryMovementType, SalePaymentType, SaleStatus } from '../common/enums/domain.enums';
import { Customer, Product, Sale, SaleDetail, SalePromotionApplication } from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { PromotionsService } from '../promotions/promotions.service';
import { RewardsService } from '../promotions/rewards.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateSaleDto } from './sales.dto';

@Injectable()
export class SalesService {
  constructor(private readonly ds:DataSource,@InjectRepository(Sale) private readonly sales:Repository<Sale>,private readonly inventory:InventoryService,private readonly promotions:PromotionsService,private readonly rewards:RewardsService,private readonly audit:AuditService,private readonly accounts:AccountsService) {}
  async create(dto:CreateSaleDto,userId:number,businessId:number) { return this.ds.transaction(async manager => {
    const paymentType=dto.tipoPago??SalePaymentType.CONTADO;
    if(paymentType!==SalePaymentType.CONTADO&&!dto.clienteId) throw new BadRequestException({message:'Las ventas a crédito requieren cliente',errorCode:'CUSTOMER_REQUIRED'});
    if(dto.clienteId&&!await manager.exists(Customer,{where:{id:dto.clienteId,businessId,activo:true}})) throw new NotFoundException({message:'Cliente no encontrado',errorCode:'CUSTOMER_NOT_FOUND'});
    const quantities=new Map<number,number>(); for(const line of dto.productos) quantities.set(line.productoId,(quantities.get(line.productoId)??0)+line.cantidad);
    const source:{product:Product;cantidad:number;unitCents:number}[]=[];
    for(const [productId,cantidad] of quantities) { const product=await manager.findOne(Product,{where:{id:productId,businessId,activo:true},lock:{mode:'pessimistic_write'}}); if(!product) throw new NotFoundException({message:`Producto ${productId} no encontrado o inactivo`,errorCode:'PRODUCT_NOT_FOUND'}); if(product.stockActual<cantidad) throw new BadRequestException({message:`Stock insuficiente para ${product.nombre}`,errorCode:'INSUFFICIENT_STOCK'}); source.push({product,cantidad,unitCents:this.cents(product.precioVenta)}); }
    const immediate=await this.promotions.applyImmediateSale(dto.clienteId,source.map(line=>({productId:line.product.id,categoryId:line.product.categoryId,cantidad:line.cantidad,precioUnitario:line.unitCents/100})),manager,businessId);
    const discounts=source.map((_,i)=>immediate.reduce((sum,p)=>sum+Math.round(p.lineDiscounts[i]*100),0)); const subtotal=source.reduce((sum,line)=>sum+line.unitCents*line.cantidad,0), discount=discounts.reduce((sum,x)=>sum+x,0), total=subtotal-discount;
    const initial=paymentType===SalePaymentType.MIXTO?Math.round((dto.pagoInicial??-1)*100):paymentType===SalePaymentType.CONTADO?total:0;
    if(initial<0||initial>total||(paymentType===SalePaymentType.MIXTO&&initial===0)) throw new BadRequestException({message:'Pago inicial inválido',errorCode:'INVALID_INITIAL_PAYMENT'});
    const pending=total-initial;
    const sale=await manager.save(Sale,{businessId,folio:await this.nextFolio(manager,businessId),customerId:dto.clienteId,userId,subtotal:this.money(subtotal),descuento:this.money(discount),total:this.money(total),tipoPago:paymentType,pagoInicial:this.money(initial),saldoPendiente:this.money(pending),estatus:SaleStatus.COMPLETADA,observaciones:dto.observaciones,fechaVenta:new Date()});
    const details:SaleDetail[]=[];
    for(let i=0;i<source.length;i++) { const line=source[i],base=line.unitCents*line.cantidad,detail=await manager.save(SaleDetail,{saleId:sale.id,productId:line.product.id,cantidad:line.cantidad,precioUnitario:this.money(line.unitCents),descuento:this.money(discounts[i]),subtotal:this.money(base),total:this.money(base-discounts[i])}); details.push(detail); await this.inventory.change(detail.productId,-detail.cantidad,InventoryMovementType.VENTA,userId,businessId,undefined,undefined,{type:'VENTA',id:String(sale.id)},manager); }
    if(pending&&dto.clienteId) await this.accounts.addMovement({customerId:dto.clienteId,businessId,userId,type:CustomerAccountMovementType.VENTA_CREDITO,charge:pending/100,reference:`VENTA-${sale.id}`,observations:`Venta ${sale.folio}`},manager);
    for(const p of immediate) for(let i=0;i<details.length;i++) if(p.lineDiscounts[i]) await manager.save(SalePromotionApplication,{saleId:sale.id,saleDetailId:details[i].id,promotionId:p.promotion.id,tipoPromocion:p.promotion.tipoPromocion,cantidadBeneficiada:p.quantities[i],descuento:this.money(Math.round(p.lineDiscounts[i]*100)),evidencia:p.evidence});
    await this.rewards.applySale(dto.clienteId,source.map(line=>({productId:line.product.id,categoryId:line.product.categoryId,cantidad:line.cantidad})),sale.id,manager,businessId);
    await this.audit.log({userId,businessId,modulo:'VENTAS',accion:'VENTA_CREADA',entidad:'ventas',entidadId:String(sale.id),descripcion:`Venta ${sale.folio} creada`},manager); return this.findOne(sale.id,businessId,manager);
  }); }
  async cancel(id:number,userId:number,businessId:number) { return this.ds.transaction(async manager => { const sale=await manager.findOne(Sale,{where:{id,businessId},relations:{details:true},lock:{mode:'pessimistic_write'}}); if(!sale) throw new NotFoundException({message:'Venta no encontrada',errorCode:'SALE_NOT_FOUND'}); if(sale.estatus===SaleStatus.CANCELADA) throw new BadRequestException({message:'La venta ya fue cancelada',errorCode:'SALE_ALREADY_CANCELLED'}); await this.rewards.rollbackSale(sale.id,manager,businessId); if(Number(sale.saldoPendiente)>0&&sale.customerId) await this.accounts.addMovement({customerId:sale.customerId,businessId,userId,type:CustomerAccountMovementType.CANCELACION_VENTA,payment:Number(sale.saldoPendiente),reference:`VENTA-${sale.id}`,observations:'Cancelación de venta'},manager); sale.estatus=SaleStatus.CANCELADA; await manager.save(sale); for(const detail of sale.details) await this.inventory.change(detail.productId,detail.cantidad,InventoryMovementType.CANCELACION_VENTA,userId,businessId,'Cancelación de venta',undefined,{type:'VENTA',id:String(sale.id)},manager); await this.audit.log({userId,businessId,modulo:'VENTAS',accion:'VENTA_CANCELADA',entidad:'ventas',entidadId:String(id),descripcion:`Venta ${sale.folio} cancelada`},manager); return sale; }); }
  async list(q:PaginationDto,businessId:number){const [data,total]=await this.sales.findAndCount({where:{businessId},relations:{customer:true,user:true,details:{product:true}},skip:(q.page-1)*q.limit,take:q.limit,order:{fechaVenta:'DESC'}});return{data,meta:{page:q.page,limit:q.limit,total,totalPages:Math.ceil(total/q.limit)}};}
  async findOne(id:number,businessId:number,manager:EntityManager=this.ds.manager){const sale=await manager.findOne(Sale,{where:{id,businessId},relations:{customer:true,user:true,details:{product:true}}});if(!sale)throw new NotFoundException({message:'Venta no encontrada',errorCode:'SALE_NOT_FOUND'});return sale;}
  private async nextFolio(manager:EntityManager,businessId:number){return`CHY-${new Date().getFullYear()}-${String((await manager.count(Sale,{where:{businessId}}))+1).padStart(6,'0')}`;}
  private cents(value:string){return Math.round(Number(value)*100);} private money(cents:number){return(cents/100).toFixed(2);}
}
