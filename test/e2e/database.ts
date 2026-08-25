import * as bcrypt from 'bcrypt';
import { createConnection } from 'mysql2/promise';
import dataSource from '../../src/database/data-source';
import { BusinessConfig, Permission, Role, User } from '../../src/database/entities';

const permissions = ['productos.ver','productos.crear','productos.editar','productos.eliminar','inventario.ver','inventario.entrada','inventario.ajuste','ventas.ver','ventas.crear','ventas.cancelar','clientes.ver','clientes.crear','clientes.editar','promociones.ver','promociones.crear','promociones.editar','dashboard.ver','usuarios.ver','usuarios.crear','usuarios.editar','bitacora.ver','configuracion.editar'];

export function assertE2eDatabase() {
  if (process.env.NODE_ENV !== 'test' || process.env.DB_NAME !== 'chuydex_e2e') throw new Error('Seguridad E2E: solo se permite operar sobre chuydex_e2e con NODE_ENV=test');
}

export async function resetE2eDatabase() {
  assertE2eDatabase();
  if (dataSource.isInitialized) await dataSource.destroy();
  const admin = await createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: 'root', password: process.env.MYSQL_ROOT_PASSWORD });
  await admin.query('DROP DATABASE IF EXISTS `chuydex_e2e`');
  await admin.query('CREATE DATABASE `chuydex_e2e` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await admin.end();
  await dataSource.initialize();
  await dataSource.runMigrations();
  const roles = dataSource.getRepository(Role), perms = dataSource.getRepository(Permission), users = dataSource.getRepository(User), configs = dataSource.getRepository(BusinessConfig);
  const role = await roles.save(roles.create({ nombre: 'ADMIN', descripcion: 'Administrador E2E' }));
  const saved = await perms.save(permissions.map(clave => perms.create({ clave, nombre: clave.replace('.', ' '), modulo: clave.split('.')[0] })));
  role.permissions = saved;
  await roles.save(role);
  await users.save(users.create({ nombre: 'Administrador E2E', username: process.env.SEED_ADMIN_USERNAME ?? 'admin', passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD!, Number(process.env.BCRYPT_ROUNDS ?? 10)), roleId: role.id, activo: true }));
  await configs.save(configs.create({ nombreNegocio: 'ChuyDex E2E', slogan: 'Datos aislados', moneda: 'MXN', zonaHoraria: 'America/Hermosillo' }));
}

if (require.main === module) resetE2eDatabase().then(() => dataSource.destroy()).catch(error => { console.error(error); process.exit(1); });
