import { PromotionType } from '../src/common/enums/domain.enums';
import { Promotion } from '../src/database/entities';
import { PromotionsService } from '../src/promotions/promotions.service';

type TestPromotion = Pick<Promotion, 'id' | 'nombre' | 'activo' | 'requiereCliente' | 'fechaInicio' | 'tipoPromocion' | 'cantidadObjetivo' | 'cantidadBeneficio' | 'products' | 'categories'> & Partial<Promotion>;
type TestBuilder = { leftJoinAndSelect: () => TestBuilder; where: () => TestBuilder; andWhere: () => TestBuilder; orderBy: () => TestBuilder; getMany: () => Promise<TestPromotion[]> };
const active = (overrides: Partial<TestPromotion> = {}): TestPromotion => ({ id: 1, nombre: 'Promoción', activo: true, requiereCliente: false, fechaInicio: new Date('2020-01-01'), tipoPromocion: PromotionType.COMPRA_N_LLEVA_M, cantidadObjetivo: 7, cantidadBeneficio: 1, products: [], categories: [], ...overrides });
const managerFor = (promotions: TestPromotion[]) => ({ createQueryBuilder: () => { const builder: TestBuilder = { leftJoinAndSelect: () => builder, where: () => builder, andWhere: () => builder, orderBy: () => builder, getMany: async () => promotions }; return builder; } });

describe('PromotionsService immediate promotions', () => {
  const service = new PromotionsService({} as never, {} as never, {} as never);
  it.each([[6, 0], [7, 0], [8, 1], [14, 1], [16, 2]])('Compra 7 y lleva 1: %i unidades descuenta %i', async (cantidad, free) => {
    const result = await service.applyImmediateSale(undefined, [{ productId: 10, categoryId: 1, cantidad, precioUnitario: 12 }], managerFor([active()]) as never);
    expect(result).toHaveLength(free ? 1 : 0);
    if (free) { expect(result[0].quantities).toEqual([free]); expect(result[0].lineDiscounts).toEqual([free * 12]); }
  });
  it('aplica porcentaje y monto por categoría/producto y no aplica fuera del alcance', async () => {
    const percent = active({ id: 2, tipoPromocion: PromotionType.DESCUENTO_PORCENTAJE, cantidadObjetivo: 1, porcentajeDescuento: '10.00', products: [{ productId: 10 } as never] });
    const amount = active({ id: 3, tipoPromocion: PromotionType.DESCUENTO_MONTO, cantidadObjetivo: 1, montoDescuento: '3.00', categories: [{ categoryId: 2 } as never] });
    const result = await service.applyImmediateSale(undefined, [{ productId: 10, categoryId: 1, cantidad: 2, precioUnitario: 20 }, { productId: 11, categoryId: 2, cantidad: 2, precioUnitario: 2 }, { productId: 12, categoryId: 3, cantidad: 1, precioUnitario: 20 }], managerFor([percent, amount]) as never);
    expect(result.map(x => x.lineDiscounts)).toEqual([[4, 0, 0], [0, 4, 0]]);
  });
  it('omite una promoción que exige cliente cuando no hay cliente', async () => {
    const result = await service.applyImmediateSale(undefined, [{ productId: 10, categoryId: 1, cantidad: 8, precioUnitario: 12 }], managerFor([active({ requiereCliente: true })]) as never);
    expect(result).toEqual([]);
  });
});
