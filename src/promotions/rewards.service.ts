import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { InventoryMovementType, PromotionType, RewardStatus, SaleStatus } from '../common/enums/domain.enums';
import { CustomerPromotion, LoyaltyProgressEvent, Product, Promotion, Reward, Sale, SaleDetail } from '../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class RewardsService {
  constructor(private readonly ds: DataSource, private readonly inventory: InventoryService, private readonly audit: AuditService) {}
  async list(q: PaginationDto, customerId?: number) { const repo = this.ds.getRepository(Reward); const [data, total] = await repo.findAndCount({ where: customerId ? { customerId } : {}, relations: { customer: true, promotion: true, product: true, saleGeneradora: true, saleCanje: true, usuarioCanje: true }, skip: (q.page - 1) * q.limit, take: q.limit, order: { createdAt: 'DESC' } }); return { data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } }; }
  async one(id: number) { const reward = await this.ds.getRepository(Reward).findOne({ where: { id }, relations: { customer: true, promotion: { products: true, categories: true }, product: true, saleGeneradora: true, saleCanje: true, usuarioCanje: true } }); if (!reward) throw new NotFoundException({ message: 'Recompensa no encontrada', errorCode: 'REWARD_NOT_FOUND' }); return reward; }
  async applySale(customerId: number | undefined, lines: { productId: number; categoryId: number; cantidad: number }[], saleId: number, manager: EntityManager = this.ds.manager) {
    if (!customerId) return;
    const now = new Date();
    const promotions = await manager.createQueryBuilder(Promotion, 'p').leftJoinAndSelect('p.products', 'pp').leftJoinAndSelect('p.categories', 'pc').where('p.activo = true AND p.tipo_promocion = :type AND p.requiere_cliente = true', { type: PromotionType.LEALTAD }).andWhere('p.fecha_inicio <= :now AND (p.fecha_fin IS NULL OR p.fecha_fin >= :now)', { now }).getMany();
    for (const p of promotions) {
      const productIds = new Set(p.products.map(x => x.productId)); const categoryIds = new Set(p.categories.map(x => x.categoryId)); const amount = lines.reduce((sum, line) => sum + ((!productIds.size && !categoryIds.size) || productIds.has(line.productId) || categoryIds.has(line.categoryId) ? line.cantidad : 0), 0);
      if (!amount) continue;
      await manager.save(LoyaltyProgressEvent, { saleId, customerId, promotionId: p.id, cantidadElegible: amount });
      await this.recalculate(customerId, p, manager, saleId, now);
    }
  }
  async redeem(id: number, customerId: number, productId: number | undefined, userId: number) {
    const expired = await this.ds.getRepository(Reward).findOneBy({ id });
    if (expired?.estatus === RewardStatus.DISPONIBLE && expired.expiraEn && expired.expiraEn < new Date()) {
      expired.estatus = RewardStatus.EXPIRADA;
      await this.ds.getRepository(Reward).save(expired);
      throw new ConflictException({ message: 'La recompensa expirÃ³', errorCode: 'REWARD_EXPIRED' });
    }
    return this.ds.transaction(async manager => {
      const reward = await manager.findOne(Reward, { where: { id }, relations: { promotion: { products: true, categories: true } }, lock: { mode: 'pessimistic_write' } });
      if (!reward) throw new NotFoundException({ message: 'Recompensa no encontrada', errorCode: 'REWARD_NOT_FOUND' });
      if (Number(reward.customerId) !== customerId) throw new ConflictException({ message: 'La recompensa no pertenece al cliente indicado', errorCode: 'REWARD_CUSTOMER_MISMATCH' });
      if (reward.estatus !== RewardStatus.DISPONIBLE) throw new ConflictException({ message: 'La recompensa no está disponible', errorCode: 'REWARD_NOT_AVAILABLE' });
      if (reward.expiraEn && reward.expiraEn < new Date()) { reward.estatus = RewardStatus.EXPIRADA; await manager.save(reward); throw new ConflictException({ message: 'La recompensa expiró', errorCode: 'REWARD_EXPIRED' }); }
      const chosenId = reward.productId ?? productId; if (!chosenId) throw new BadRequestException({ message: 'Debe indicar el producto a canjear', errorCode: 'REWARD_PRODUCT_REQUIRED' });
      const product = await manager.findOne(Product, { where: { id: chosenId, activo: true }, lock: { mode: 'pessimistic_write' } }); if (!product) throw new NotFoundException({ message: 'Producto de recompensa no encontrado', errorCode: 'REWARD_PRODUCT_NOT_FOUND' });
      if (!this.productAllowed(reward.promotion, product)) throw new BadRequestException({ message: 'El producto no es elegible para esta recompensa', errorCode: 'INVALID_REWARD_PRODUCT' });
      if (product.stockActual < 1) throw new BadRequestException({ message: 'Stock insuficiente para canjear la recompensa', errorCode: 'INSUFFICIENT_STOCK' });
      const sale = await manager.save(Sale, { folio: await this.nextFolio(manager), customerId: reward.customerId, userId, subtotal: product.precioVenta, descuento: product.precioVenta, total: '0.00', estatus: SaleStatus.COMPLETADA, observaciones: `Canje de recompensa ${reward.id}`, fechaVenta: new Date() });
      await manager.save(SaleDetail, { saleId: sale.id, productId: product.id, cantidad: 1, precioUnitario: product.precioVenta, descuento: product.precioVenta, subtotal: product.precioVenta, total: '0.00' });
      await this.inventory.change(product.id, -1, InventoryMovementType.REGALO, userId, `Canje de recompensa ${reward.id}`, undefined, { type: 'RECOMPENSA', id: String(reward.id) }, manager);
      reward.productId = product.id; reward.estatus = RewardStatus.CANJEADA; reward.canjeadaEn = new Date(); reward.saleCanjeId = sale.id; reward.usuarioCanjeId = userId; await manager.save(reward);
      await this.refreshProgress(reward.customerId, reward.promotionId, manager); await this.audit.log({ userId, modulo: 'RECOMPENSAS', accion: 'RECOMPENSA_CANJEADA', entidad: 'recompensas', entidadId: String(id), descripcion: `Recompensa ${id} canjeada en venta ${sale.folio}`, datosNuevos: { saleId: sale.id, productId: product.id } }, manager);
      return this.oneInManager(id, manager);
    });
  }
  async cancel(id: number, userId: number) { return this.ds.transaction(async manager => { const reward = await manager.findOne(Reward, { where: { id }, lock: { mode: 'pessimistic_write' } }); if (!reward) throw new NotFoundException({ message: 'Recompensa no encontrada', errorCode: 'REWARD_NOT_FOUND' }); if (reward.estatus !== RewardStatus.DISPONIBLE) throw new ConflictException({ message: 'Solo se pueden cancelar recompensas disponibles', errorCode: 'REWARD_NOT_CANCELLABLE' }); reward.estatus = RewardStatus.CANCELADA; await manager.save(reward); await this.refreshProgress(reward.customerId, reward.promotionId, manager); await this.audit.log({ userId, modulo: 'RECOMPENSAS', accion: 'RECOMPENSA_CANCELADA', entidad: 'recompensas', entidadId: String(id), descripcion: `Recompensa ${id} cancelada` }, manager); return reward; }); }
  async rollbackSale(saleId: number, manager: EntityManager) {
    const events = await manager.find(LoyaltyProgressEvent, { where: { saleId }, relations: { promotion: true } });
    for (const event of events) {
      const redeemed = await manager.count(Reward, { where: { customerId: event.customerId, promotionId: event.promotionId, estatus: RewardStatus.CANJEADA } });
      const remainingEvents = await manager.find(LoyaltyProgressEvent, { where: { customerId: event.customerId, promotionId: event.promotionId } }); const totalWithoutSale = remainingEvents.filter(x => x.saleId !== saleId).reduce((sum, x) => sum + x.cantidadElegible, 0); const validRewards = Math.floor(totalWithoutSale / event.promotion.cantidadObjetivo);
      if (redeemed > validRewards) throw new ConflictException({ message: 'No se puede cancelar: invalidaría una recompensa ya canjeada', errorCode: 'SALE_CANCELLATION_INVALIDATES_REWARD' });
      await manager.delete(LoyaltyProgressEvent, { saleId, promotionId: event.promotionId });
      const available = await manager.find(Reward, { where: { customerId: event.customerId, promotionId: event.promotionId, estatus: RewardStatus.DISPONIBLE }, order: { createdAt: 'DESC' }, lock: { mode: 'pessimistic_write' } });
      const mustCancel = Math.max(0, available.length - (validRewards - redeemed)); for (const reward of available.slice(0, mustCancel)) { reward.estatus = RewardStatus.CANCELADA; await manager.save(reward); }
      await this.refreshProgress(event.customerId, event.promotionId, manager);
    }
  }
  private async recalculate(customerId: number, promotion: Promotion, manager: EntityManager, generatorSaleId: number, now: Date) { const events = await manager.find(LoyaltyProgressEvent, { where: { customerId, promotionId: promotion.id } }); const quantity = events.reduce((sum, event) => sum + event.cantidadElegible, 0); const generated = Math.floor(quantity / promotion.cantidadObjetivo); const rewards = await manager.count(Reward, { where: { customerId, promotionId: promotion.id, estatus: RewardStatus.DISPONIBLE } }); for (let i = rewards; i < generated; i++) await manager.save(Reward, { customerId, promotionId: promotion.id, productId: promotion.products.length === 1 ? promotion.products[0].productId : undefined, descripcion: `Recompensa por ${promotion.nombre}`, evidencia: { nombrePromocion: promotion.nombre, cantidadObjetivo: promotion.cantidadObjetivo, cantidadBeneficio: promotion.cantidadBeneficio, productoId: promotion.products.length === 1 ? promotion.products[0].productId : null, generadaEn: now.toISOString() }, estatus: RewardStatus.DISPONIBLE, generadaEn: now, expiraEn: promotion.fechaFin, saleGeneradoraId: generatorSaleId }); await this.refreshProgress(customerId, promotion.id, manager, quantity, generated); }
  private async refreshProgress(customerId: number, promotionId: number, manager: EntityManager, quantity?: number, generated?: number) { const events = quantity === undefined ? await manager.find(LoyaltyProgressEvent, { where: { customerId, promotionId } }) : undefined; const total = quantity ?? events!.reduce((sum, event) => sum + event.cantidadElegible, 0); const promotion = await manager.findOneByOrFail(Promotion, { id: promotionId }); const rewards = await manager.find(Reward, { where: { customerId, promotionId } }); let progress = await manager.findOne(CustomerPromotion, { where: { customerId, promotionId }, lock: { mode: 'pessimistic_write' } }); if (!progress) progress = manager.create(CustomerPromotion, { customerId, promotionId }); progress.progresoActual = total % promotion.cantidadObjetivo; progress.recompensasGeneradas = generated ?? rewards.filter(x => x.estatus !== RewardStatus.CANCELADA).length; progress.recompensasDisponibles = rewards.filter(x => x.estatus === RewardStatus.DISPONIBLE).length; progress.recompensasUtilizadas = rewards.filter(x => x.estatus === RewardStatus.CANJEADA).length; progress.ultimaActualizacion = new Date(); await manager.save(progress); }
  private productAllowed(p: Promotion, product: Product) { return (!p.products.length && !p.categories.length) || p.products.some(x => x.productId === product.id) || p.categories.some(x => x.categoryId === product.categoryId); }
  private async oneInManager(id: number, manager: EntityManager) { return manager.findOneOrFail(Reward, { where: { id }, relations: { customer: true, promotion: true, product: true, saleGeneradora: true, saleCanje: true, usuarioCanje: true } }); }
  private async nextFolio(manager: EntityManager) { const year = new Date().getFullYear(); return `CHY-${year}-${String((await manager.count(Sale)) + 1).padStart(6, '0')}`; }
}
