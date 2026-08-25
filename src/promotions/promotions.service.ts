import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Promotion, PromotionCategory, PromotionProduct } from '../database/entities';
import { PromotionType } from '../common/enums/domain.enums';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PromotionDto } from './promotions.dto';

export type SalePromotionLine = { productId: number; categoryId: number; cantidad: number; precioUnitario: number };
export type AppliedPromotion = { promotion: Promotion; lineDiscounts: number[]; quantities: number[]; evidence: object };

@Injectable()
export class PromotionsService {
  constructor(@InjectRepository(Promotion) private readonly repo: Repository<Promotion>, @InjectRepository(PromotionProduct) private readonly pp: Repository<PromotionProduct>, @InjectRepository(PromotionCategory) private readonly pc: Repository<PromotionCategory>) {}
  async list(q: PaginationDto) { const [data, total] = await this.repo.findAndCount({ relations: { products: true, categories: true }, skip: (q.page - 1) * q.limit, take: q.limit, order: { createdAt: 'DESC' } }); return { data, meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } }; }
  async one(id: number) { const p = await this.repo.findOne({ where: { id }, relations: { products: true, categories: true } }); if (!p) throw new NotFoundException({ message: 'Promoción no encontrada', errorCode: 'PROMOTION_NOT_FOUND' }); return p; }
  async create(d: PromotionDto) { this.validateDefinition(d); const p = await this.repo.save(this.repo.create(this.normalize(d))); await this.assign(p.id, d); return this.one(p.id); }
  async update(id: number, d: Partial<PromotionDto>) { const p = await this.one(id); const next = { ...p, ...d, fechaInicio: d.fechaInicio ?? p.fechaInicio.toISOString(), fechaFin: d.fechaFin ?? p.fechaFin?.toISOString() } as PromotionDto; this.validateDefinition(next); Object.assign(p, this.normalize(next)); await this.repo.save(p); if (d.productosIds || d.categoriasIds) { await this.pp.delete({ promotionId: id }); await this.pc.delete({ promotionId: id }); await this.assign(id, d); } return this.one(id); }
  async applyImmediateSale(customerId: number | undefined, lines: SalePromotionLine[], manager: EntityManager): Promise<AppliedPromotion[]> {
    const now = new Date();
    const promotions = await manager.createQueryBuilder(Promotion, 'p').leftJoinAndSelect('p.products', 'pp').leftJoinAndSelect('p.categories', 'pc').where('p.activo = true').andWhere('p.tipo_promocion != :loyalty', { loyalty: PromotionType.LEALTAD }).andWhere('p.fecha_inicio <= :now AND (p.fecha_fin IS NULL OR p.fecha_fin >= :now)', { now }).orderBy('p.created_at', 'ASC').getMany();
    const applied: AppliedPromotion[] = []; const remainingDiscount = lines.map(line => Math.round(line.cantidad * line.precioUnitario * 100));
    for (const promotion of promotions) {
      if (promotion.requiereCliente && !customerId) continue;
      const eligible = lines.map(line => this.isEligible(promotion, line)); const count = lines.reduce((sum, line, i) => sum + (eligible[i] ? line.cantidad : 0), 0);
      if (count < promotion.cantidadObjetivo) continue;
      const lineDiscounts = lines.map(() => 0); const quantities = lines.map(() => 0);
      if (promotion.tipoPromocion === PromotionType.COMPRA_N_LLEVA_M) {
        const free = Math.floor(count / (promotion.cantidadObjetivo + promotion.cantidadBeneficio)) * promotion.cantidadBeneficio; if (!free) continue;
        let pending = free; const indexes = lines.map((_, i) => i).filter(i => eligible[i]).sort((a, b) => lines[a].precioUnitario - lines[b].precioUnitario);
        for (const i of indexes) { const units = Math.min(pending, lines[i].cantidad); lineDiscounts[i] = units * lines[i].precioUnitario; quantities[i] = units; pending -= units; if (!pending) break; }
      } else if (promotion.tipoPromocion === PromotionType.DESCUENTO_PORCENTAJE) {
        const rate = Number(promotion.porcentajeDescuento) / 100; for (let i = 0; i < lines.length; i++) if (eligible[i]) { quantities[i] = lines[i].cantidad; lineDiscounts[i] = lines[i].cantidad * lines[i].precioUnitario * rate; }
      } else if (promotion.tipoPromocion === PromotionType.DESCUENTO_MONTO) {
        const amount = Number(promotion.montoDescuento); for (let i = 0; i < lines.length; i++) if (eligible[i]) { quantities[i] = lines[i].cantidad; lineDiscounts[i] = lines[i].cantidad * Math.min(lines[i].precioUnitario, amount); }
      }
      for (let i = 0; i < lineDiscounts.length; i++) { const requested = Math.round(lineDiscounts[i] * 100); const allowed = Math.min(requested, remainingDiscount[i]); lineDiscounts[i] = allowed / 100; remainingDiscount[i] -= allowed; if (!allowed) quantities[i] = 0; }
      if (!lineDiscounts.some(Boolean)) continue;
      applied.push({ promotion, lineDiscounts, quantities, evidence: { nombre: promotion.nombre, tipo: promotion.tipoPromocion, fechaAplicacion: now.toISOString(), cantidadElegible: count, cantidadObjetivo: promotion.cantidadObjetivo, cantidadBeneficio: promotion.cantidadBeneficio, porcentajeDescuento: promotion.porcentajeDescuento, montoDescuento: promotion.montoDescuento } });
    }
    return applied;
  }
  private isEligible(p: Promotion, line: SalePromotionLine) { const products = new Set(p.products.map(x => x.productId)); const categories = new Set(p.categories.map(x => x.categoryId)); return (!products.size && !categories.size) || products.has(line.productId) || categories.has(line.categoryId); }
  private normalize(d: Partial<PromotionDto>) { return { ...d, fechaInicio: d.fechaInicio ? new Date(d.fechaInicio) : undefined, fechaFin: d.fechaFin ? new Date(d.fechaFin) : undefined, porcentajeDescuento: d.porcentajeDescuento === undefined ? undefined : Number(d.porcentajeDescuento).toFixed(2), montoDescuento: d.montoDescuento === undefined ? undefined : Number(d.montoDescuento).toFixed(2) }; }
  private validateDefinition(d: Partial<PromotionDto>) { if (d.fechaInicio && d.fechaFin && new Date(d.fechaFin) < new Date(d.fechaInicio)) throw new BadRequestException({ message: 'La fecha final debe ser posterior a la inicial', errorCode: 'INVALID_PROMOTION_DATES' }); if (!d.cantidadObjetivo || d.cantidadObjetivo < 1) throw new BadRequestException({ message: 'cantidadObjetivo debe ser mayor a cero', errorCode: 'INVALID_PROMOTION' }); if (d.tipoPromocion === PromotionType.COMPRA_N_LLEVA_M && (!d.cantidadBeneficio || d.cantidadBeneficio < 1)) throw new BadRequestException({ message: 'Compra-N-Lleva requiere cantidadBeneficio', errorCode: 'INVALID_PROMOTION' }); if (d.tipoPromocion === PromotionType.DESCUENTO_PORCENTAJE && (!d.porcentajeDescuento || d.porcentajeDescuento <= 0 || d.porcentajeDescuento > 100)) throw new BadRequestException({ message: 'El porcentaje debe ser mayor a 0 y hasta 100', errorCode: 'INVALID_PROMOTION' }); if (d.tipoPromocion === PromotionType.DESCUENTO_MONTO && (!d.montoDescuento || d.montoDescuento <= 0)) throw new BadRequestException({ message: 'El monto debe ser mayor a cero', errorCode: 'INVALID_PROMOTION' }); }
  private async assign(id: number, d: Partial<PromotionDto>) { if (d.productosIds?.length) await this.pp.save([...new Set(d.productosIds)].map(productId => ({ promotionId: id, productId }))); if (d.categoriasIds?.length) await this.pc.save([...new Set(d.categoriasIds)].map(categoryId => ({ promotionId: id, categoryId }))); }
}
