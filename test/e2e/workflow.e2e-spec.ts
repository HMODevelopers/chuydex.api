import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { HttpErrorFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { InventoryMovementType, RewardStatus } from '../../src/common/enums/domain.enums';
import dataSource from '../../src/database/data-source';
import { CustomerPromotion, InventoryMovement, Reward, Sale, SalePromotionApplication } from '../../src/database/entities';
import { resetE2eDatabase } from './database';

type Login = { accessToken: string; refreshToken: string; sessionId: string };
const money = (value: unknown) => Number(value);

describe('E2E: flujo aislado de ChuyDex', () => {
  let app: INestApplication;
  let api: request.SuperTest<request.Test>;
  let login: Login;
  let cookieId: number;
  let drinkId: number;
  let cookiesCategoryId: number;
  let drinksCategoryId: number;
  let customerId: number;

  const auth = () => ({ Authorization: `Bearer ${login.accessToken}` });
  const post = (path: string, body: object) => api.post(`/api${path}`).set(auth()).send(body);
  const put = (path: string, body: object) => api.put(`/api${path}`).set(auth()).send(body);
  const get = (path: string) => api.get(`/api${path}`).set(auth());
  const promotion = (overrides: Record<string, unknown> = {}) => ({ nombre: 'Promoción E2E', tipoPromocion: 'COMPRA_N_LLEVA_M', cantidadObjetivo: 7, cantidadBeneficio: 1, fechaInicio: '2020-01-01T00:00:00.000Z', activo: true, ...overrides });
  const deactivate = async (id: number, body: Record<string, unknown>) => put(`/promociones/${id}`, { ...body, activo: false }).expect(200);
  const sale = async (cantidad: number, productId = cookieId, clienteId?: number) => {
    const response = await post('/ventas', { ...(clienteId ? { clienteId } : {}), productos: [{ productoId: productId, cantidad }] }).expect(201);
    return response.body.data;
  };

  beforeAll(async () => {
    await resetE2eDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpErrorFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('ChuyDex API').setVersion('1.0').addBearerAuth().build()));
    await app.init();
    api = request(app.getHttpServer());
    const response = await api.post('/api/auth/login').send({ username: 'admin', password: process.env.SEED_ADMIN_PASSWORD, dispositivo: 'jest-e2e' }).expect(200);
    login = response.body.data;
  });

  afterAll(async () => {
    await app?.close();
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it('expone Swagger útil y realiza el flujo de catálogo, inventario y código de barras', async () => {
    const docs = await api.get('/api/docs-json').expect(200);
    expect(docs.body.paths['/api/auth/login']).toBeDefined();
    expect(docs.body.paths['/api/productos']).toBeDefined();
    expect(docs.body.paths['/api/ventas']).toBeDefined();
    expect(docs.body.paths['/api/recompensas/{id}/canjear']).toBeDefined();
    expect(docs.body.components.schemas).toEqual(expect.objectContaining({ LoginDto: expect.any(Object), ProductDto: expect.any(Object), InventoryEntryDto: expect.any(Object), PromotionDto: expect.any(Object), CreateSaleDto: expect.any(Object) }));

    const category = await post('/categorias', { nombre: 'Galletas', icono: 'cookie', orden: 1 }).expect(201);
    cookiesCategoryId = category.body.data.id;
    const drinks = await post('/categorias', { nombre: 'Bebidas', icono: 'drink', orden: 2 }).expect(201);
    drinksCategoryId = drinks.body.data.id;
    const cookie = await post('/productos', { categoriaId: cookiesCategoryId, nombre: 'Galleta E2E', sku: 'E2E-COOKIE', codigoBarras: '750000000001', precioVenta: 10, stockMinimo: 10 }).expect(201);
    cookieId = Number(cookie.body.data.id);
    const drink = await post('/productos', { categoriaId: drinksCategoryId, nombre: 'Bebida E2E', sku: 'E2E-DRINK', codigoBarras: '750000000002', precioVenta: 5, stockMinimo: 5 }).expect(201);
    drinkId = Number(drink.body.data.id);
    await post('/inventario/entrada', { productoId: cookieId, cantidad: 500, motivo: 'Carga E2E' }).expect(201);
    await post('/inventario/entrada', { productoId: drinkId, cantidad: 100, motivo: 'Carga E2E' }).expect(201);

    await post('/productos', { categoriaId: cookiesCategoryId, nombre: 'Duplicado E2E', sku: 'E2E-DUP', codigoBarras: '750000000001', precioVenta: 10 }).expect(409);
    const indexes = await dataSource.query("SHOW INDEX FROM productos WHERE Key_name = 'UQ_productos_codigo_barras'");
    expect(indexes).toHaveLength(1);
    expect(Number(indexes[0].Non_unique)).toBe(0);

    const customer = await post('/clientes', { nombre: 'Carlos', alias: 'carlos-e2e' }).expect(201);
    customerId = Number(customer.body.data.id);
    const catalog = await api.get('/api/catalogo').expect(200);
    expect(catalog.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: String(cookieId), nombre: 'Galleta E2E', stock: 500 })]));
  });

  it('aplica Compra 7 y lleva 1 mediante ventas reales, con evidencia y stock', async () => {
    const definition = promotion({ nombre: 'Compra 7 y lleva 1 E2E', productosIds: [cookieId] });
    const created = await post('/promociones', definition).expect(201);
    const promotionId = created.body.data.id;
    for (const [quantity, free] of [[6, 0], [7, 0], [8, 1], [14, 1], [16, 2]]) {
      const createdSale = await sale(quantity);
      const detail = createdSale.details[0];
      expect(money(detail.subtotal)).toBe(quantity * 10);
      expect(money(detail.descuento)).toBe(free * 10);
      expect(money(detail.total)).toBe((quantity - free) * 10);
      expect(money(createdSale.subtotal)).toBe(quantity * 10);
      expect(money(createdSale.descuento)).toBe(free * 10);
      expect(money(createdSale.total)).toBe((quantity - free) * 10);
      expect(quantity - money(detail.descuento) / money(detail.precioUnitario)).toBe(quantity - free);
      const evidence = await dataSource.getRepository(SalePromotionApplication).findOne({ where: { saleId: createdSale.id, promotionId } });
      if (free) expect(evidence).toEqual(expect.objectContaining({ cantidadBeneficiada: free, descuento: `${free * 10}.00`, evidencia: expect.objectContaining({ nombre: definition.nombre }) }));
      else expect(evidence).toBeNull();
    }
    const product = await get(`/productos/${cookieId}`).expect(200);
    expect(product.body.data.stockActual).toBe(449);
    await deactivate(promotionId, definition);
  });

  it('aplica descuentos de porcentaje y monto respetando alcance, vigencia y total no negativo', async () => {
    const percent = promotion({ nombre: '10% galleta E2E', tipoPromocion: 'DESCUENTO_PORCENTAJE', cantidadObjetivo: 1, porcentajeDescuento: 10, productosIds: [cookieId] });
    const percentId = (await post('/promociones', percent).expect(201)).body.data.id;
    const percentSale = await sale(2);
    expect([percentSale.subtotal, percentSale.descuento, percentSale.total].map(money)).toEqual([20, 2, 18]);
    await deactivate(percentId, percent);

    const expired = promotion({ nombre: 'Vencida E2E', tipoPromocion: 'DESCUENTO_MONTO', cantidadObjetivo: 1, montoDescuento: 20, productosIds: [cookieId], fechaFin: '2021-01-01T00:00:00.000Z' });
    await post('/promociones', expired).expect(201);
    expect([...(await sale(1)).details].map((detail: { descuento: string }) => money(detail.descuento))).toEqual([0]);

    const amount = promotion({ nombre: '20 MXN bebidas E2E', tipoPromocion: 'DESCUENTO_MONTO', cantidadObjetivo: 1, montoDescuento: 20, categoriasIds: [drinksCategoryId] });
    const amountId = (await post('/promociones', amount).expect(201)).body.data.id;
    const outOfScope = await sale(1);
    expect([outOfScope.subtotal, outOfScope.descuento, outOfScope.total].map(money)).toEqual([10, 0, 10]);
    const capped = await sale(2, drinkId);
    expect([capped.subtotal, capped.descuento, capped.total].map(money)).toEqual([10, 10, 0]);
    await deactivate(amountId, amount);
  });

  it('genera, consulta, canjea y protege recompensas de lealtad', async () => {
    const loyalty = promotion({ nombre: 'Lealtad compra 7 E2E', tipoPromocion: 'LEALTAD', cantidadObjetivo: 7, cantidadBeneficio: 1, requiereCliente: true, productosIds: [cookieId] });
    const loyaltyId = (await post('/promociones', loyalty).expect(201)).body.data.id;
    await sale(5, cookieId, customerId);
    const generator = await sale(2, cookieId, customerId);
    const rewards = await get(`/clientes/${customerId}/recompensas`).expect(200);
    const reward = rewards.body.data.find((item: { promotionId: number; estatus: string }) => item.promotionId === loyaltyId);
    expect(reward).toEqual(expect.objectContaining({ estatus: 'DISPONIBLE', saleGeneradoraId: generator.id }));
    await post(`/recompensas/${reward.id}/canjear`, { clienteId: customerId + 1 }).expect(409);
    const redeemed = await post(`/recompensas/${reward.id}/canjear`, { clienteId: customerId }).expect(201);
    expect(redeemed.body.data).toEqual(expect.objectContaining({ estatus: 'CANJEADA', usuarioCanjeId: '1' }));
    await post(`/recompensas/${reward.id}/canjear`, { clienteId: customerId }).expect(409);
    await post('/recompensas/999999/canjear', { clienteId: customerId }).expect(404);

    const expired = await dataSource.getRepository(Reward).save({ customerId, promotionId: loyaltyId, productId: cookieId, descripcion: 'Expirada E2E', evidencia: {}, estatus: RewardStatus.DISPONIBLE, generadaEn: new Date(), expiraEn: new Date('2020-01-01'), saleGeneradoraId: generator.id });
    await post(`/recompensas/${expired.id}/canjear`, { clienteId: customerId }).expect(409);
    expect((await get(`/recompensas/${expired.id}`).expect(200)).body.data.estatus).toBe('EXPIRADA');

    const available = await dataSource.getRepository(Reward).save({ customerId, promotionId: loyaltyId, productId: cookieId, descripcion: 'Cancelable E2E', evidencia: {}, estatus: RewardStatus.DISPONIBLE, generadaEn: new Date(), saleGeneradoraId: generator.id });
    const cancelled = await post(`/recompensas/${available.id}/cancelar`, {}).expect(201);
    expect(cancelled.body.data.estatus).toBe('CANCELADA');
    await post(`/recompensas/${available.id}/canjear`, { clienteId: customerId }).expect(409);
    const audit = await get('/bitacora?modulo=RECOMPENSAS&limit=100').expect(200);
    expect(audit.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ accion: 'RECOMPENSA_CANJEADA' }), expect.objectContaining({ accion: 'RECOMPENSA_CANCELADA' })]));
    await deactivate(loyaltyId, loyalty);
  });

  it('revierte lealtad e inventario al cancelar, y rechaza una inconsistencia con recompensa canjeada', async () => {
    const loyalty = promotion({ nombre: 'Cancelación lealtad E2E', tipoPromocion: 'LEALTAD', cantidadObjetivo: 7, cantidadBeneficio: 1, requiereCliente: true, productosIds: [cookieId] });
    const promotionId = (await post('/promociones', loyalty).expect(201)).body.data.id;
    await sale(5, cookieId, customerId);
    const before = (await get(`/productos/${cookieId}`)).body.data.stockActual;
    const completingSale = await sale(2, cookieId, customerId);
    const generated = await dataSource.getRepository(Reward).findOneOrFail({ where: { customerId, promotionId, estatus: RewardStatus.DISPONIBLE }, order: { id: 'DESC' } });
    await post(`/ventas/${completingSale.id}/cancelar`, {}).expect(201);
    expect((await dataSource.getRepository(Reward).findOneByOrFail({ id: generated.id })).estatus).toBe('CANCELADA');
    expect((await dataSource.getRepository(CustomerPromotion).findOneByOrFail({ customerId, promotionId })).progresoActual).toBe(5);
    expect((await get(`/productos/${cookieId}`)).body.data.stockActual).toBe(before);
    expect(await dataSource.getRepository(InventoryMovement).exists({ where: { referenciaId: String(completingSale.id), tipoMovimiento: InventoryMovementType.CANCELACION_VENTA } })).toBe(true);
    expect((await dataSource.getRepository(Sale).findOneByOrFail({ id: completingSale.id })).estatus).toBe('CANCELADA');

    const second = await sale(2, cookieId, customerId);
    const reward = await dataSource.getRepository(Reward).findOneOrFail({ where: { customerId, promotionId, estatus: RewardStatus.DISPONIBLE }, order: { id: 'DESC' } });
    await post(`/recompensas/${reward.id}/canjear`, { clienteId: customerId }).expect(201);
    await post(`/ventas/${second.id}/cancelar`, {}).expect(409);
    expect((await dataSource.getRepository(Sale).findOneByOrFail({ id: second.id })).estatus).toBe('COMPLETADA');
    await deactivate(promotionId, loyalty);
  });

  it('calcula rankings sin ventas canceladas y comprueba logout/refresh revocado', async () => {
    const cancelled = await sale(3, drinkId);
    await post(`/ventas/${cancelled.id}/cancelar`, {}).expect(201);
    const expectedProducts = await dataSource.query("SELECT d.producto_id AS productId, SUM(d.cantidad) AS cantidad FROM venta_detalle d INNER JOIN ventas v ON v.id=d.venta_id WHERE v.estatus='COMPLETADA' GROUP BY d.producto_id");
    const expectedCategories = await dataSource.query("SELECT c.id AS categoryId, SUM(d.cantidad) AS cantidad FROM venta_detalle d INNER JOIN ventas v ON v.id=d.venta_id INNER JOIN productos p ON p.id=d.producto_id INNER JOIN categorias c ON c.id=p.categoria_id WHERE v.estatus='COMPLETADA' GROUP BY c.id");
    const products = await get('/dashboard/productos-mas-vendidos?limit=100').expect(200);
    const categories = await get('/dashboard/categorias-mas-vendidas?limit=100').expect(200);
    expect(products.body.data.map((row: { productoId: string; cantidadVendida: string }) => [Number(row.productoId), Number(row.cantidadVendida)]).sort()).toEqual(expectedProducts.map((row: { productId: string; cantidad: string }) => [Number(row.productId), Number(row.cantidad)]).sort());
    expect(categories.body.data.map((row: { categoriaId: string; cantidadVendida: string }) => [Number(row.categoriaId), Number(row.cantidadVendida)]).sort()).toEqual(expectedCategories.map((row: { categoryId: string; cantidad: string }) => [Number(row.categoryId), Number(row.cantidad)]).sort());
    expect(products.body.data.find((row: { productoId: string }) => Number(row.productoId) === drinkId).cantidadVendida).toBe('2');

    await api.post('/api/auth/logout').set(auth()).set('x-session-id', login.sessionId).expect(200);
    await api.post('/api/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);
  });
});
