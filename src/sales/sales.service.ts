import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { InventoryMovementType, SaleStatus } from '../common/enums/domain.enums';
import { Customer, Product, Sale, SaleDetail, SalePromotionApplication } from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { PromotionsService } from '../promotions/promotions.service';
import { RewardsService } from '../promotions/rewards.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateSaleDto } from './sales.dto';

@Injectable()
export class SalesService {
  constructor(private readonly ds: DataSource, @InjectRepository(Sale) private readonly sales: Repository<Sale>, private readonly inventory: InventoryService, private readonly promotions: PromotionsService, private readonly rewards: RewardsService, private readonly audit: AuditService) {}
  async create(dto: CreateSaleDto, userId: number) { return this.ds.transaction(async manager => {
    if (dto.clienteId && !await manager.exists(Customer, { where: { id: dto.clienteId, activo: true } })) throw new NotFoundException({ message: 'Cliente no encontrado', errorCode: 'CUSTOMER_NOT_FOUND' });
    const quantities = new Map<number, number>(); for (const line of dto.productos) quantities.set(line.productoId, (quantities.get(line.productoId) ?? 0) + line.cantidad);
    const source: { product: Product; cantidad: number; unitCents: number }[] = [];
    for (const [productId, cantidad] of quantities) { const product = await manager.findOne(Product, { where: { id: productId, activo: true }, lock: { mode: 'pessimistic_write' } }); if (!product) throw new NotFoundException({ message: `Producto ${productId} no encontrado o inactivo`, errorCode: 'PRODUCT_NOT_FOUND' }); if (product.stockActual < cantidad) throw new BadRequestException({ message: `Stock insuficiente para ${product.nombre}`, errorCode: 'INSUFFICIENT_STOCK' }); source.push({ product, cantidad, unitCents: this.toCents(product.precioVenta) }); }
    const immediate = await this.promotions.applyImmediateSale(dto.clienteId, source.map(line => ({ productId: line.product.id, categoryId: line.product.categoryId, cantidad: line.cantidad, precioUnitario: line.unitCents / 100 })), manager);
    const discountCents = source.map((_, line) => immediate.reduce((sum, promotion) => sum + Math.round(promotion.lineDiscounts[line] * 100), 0));
    const subtotalCents = source.reduce((sum, line) => sum + line.unitCents * line.cantidad, 0); const totalDiscount = discountCents.reduce((sum, amount) => sum + amount, 0);
    const sale = await manager.save(Sale, { folio: await this.nextFolio(manager), customerId: dto.clienteId, userId, subtotal: this.money(subtotalCents), descuento: this.money(totalDiscount), total: this.money(subtotalCents - totalDiscount), estatus: SaleStatus.COMPLETADA, observaciones: dto.observaciones, fechaVenta: new Date() });
    const details: SaleDetail[] = []; for (let i = 0; i < source.length; i++) { const line = source[i]; const subtotal = line.unitCents * line.cantidad; const detail = await manager.save(SaleDetail, { saleId: sale.id, productId: line.product.id, cantidad: line.cantidad, precioUnitario: this.money(line.unitCents), descuento: this.money(discountCents[i]), subtotal: this.money(subtotal), total: this.money(subtotal - discountCents[i]) }); details.push(detail); await this.inventory.change(detail.productId, -detail.cantidad, InventoryMovementType.VENTA, userId, undefined, undefined, { type: 'VENTA', id: String(sale.id) }, manager); }
    for (const promotion of immediate) for (let i = 0; i < details.length; i++) if (promotion.lineDiscounts[i]) await manager.save(SalePromotionApplication, { saleId: sale.id, saleDetailId: details[i].id, promotionId: promotion.promotion.id, tipoPromocion: promotion.promotion.tipoPromocion, cantidadBeneficiada: promotion.quantities[i], descuento: this.money(Math.round(promotion.lineDiscounts[i] * 100)), evidencia: promotion.evidence });
    await this.rewards.applySale(dto.clienteId, source.map(line => ({ productId: line.product.id, categoryId: line.product.categoryId, cantidad: line.cantidad })), sale.id, manager);
    await this.audit.log({ userId, modulo: 'VENTAS', accion: 'VENTA_CREADA', entidad: 'ventas', entidadId: String(sale.id), descripcion: `Venta ${sale.folio} creada`, datosNuevos: { subtotal: sale.subtotal, descuento: sale.descuento, total: sale.total } }, manager); return this.findOne(sale.id, manager);
  }); }
  async cancel(id: number, userId: number) { return this.ds.transaction(async manager => { const sale = await manager.findOne(Sale, { where: { id }, relations: { details: true }, lock: { mode: 'pessimistic_write' } }); if (!sale) throw new NotFoundException({ message: 'Venta no encontrada', errorCode: 'SALE_NOT_FOUND' }); if (sale.estatus === SaleStatus.CANCELADA) throw new BadRequestException({ message: 'La venta ya fue cancelada', errorCode: 'SALE_ALREADY_CANCELLED' }); await this.rewards.rollbackSale(sale.id, manager); sale.estatus = SaleStatus.CANCELADA; await manager.save(sale); for (const detail of sale.details) await this.inventory.change(detail.productId, detail.cantidad, InventoryMovementType.CANCELACION_VENTA, userId, 'Cancelación de venta', undefined, { type: 'VENTA', id: String(sale.id) }, manager); await this.audit.log({ userId, modulo: 'VENTAS', accion: 'VENTA_CANCELADA', entidad: 'ventas', entidadId: String(id), descripcion: `Venta ${sale.folio} cancelada` }, manager); return sale; }); }
  async list(q: PaginationDto) { const [data, total] = await this.sales.findAndCount({ relations: { customer: true, user: true, details: { product: true } }, skip: (q.page - 1) * q.limit, take: q.limit, order: { fechaVenta: 'DESC' } }); return { data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } }; }
  async findOne(id: number, manager: EntityManager = this.ds.manager) { const sale = await manager.findOne(Sale, { where: { id }, relations: { customer: true, user: true, details: { product: true } } }); if (!sale) throw new NotFoundException({ message: 'Venta no encontrada', errorCode: 'SALE_NOT_FOUND' }); return sale; }
  private async nextFolio(manager: EntityManager) { const year = new Date().getFullYear(); return `CHY-${year}-${String((await manager.count(Sale)) + 1).padStart(6, '0')}`; }
  private toCents(value: string) { return Math.round(Number(value) * 100); }
  private money(cents: number) { return (cents / 100).toFixed(2); }
}
