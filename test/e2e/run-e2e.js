const { existsSync } = require('fs');
const { resolve } = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const envPath = resolve(process.cwd(), '.env.test');
if (!existsSync(envPath)) {
  console.error('Falta .env.test. Cree una copia de .env.test.example; las pruebas E2E nunca usan .env.');
  process.exit(1);
}
dotenv.config({ path: envPath, override: true });
process.env.NODE_ENV = 'test';
if (process.env.DB_NAME !== 'chuydex_e2e') {
  console.error('Seguridad E2E: DB_NAME debe ser exactamente chuydex_e2e. Operación cancelada.');
  process.exit(1);
}
const action = process.argv[2];
const args = action === 'db'
  ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', 'test/e2e/database.ts']
  : action === 'test'
    ? ['node_modules/jest/bin/jest.js', '--config', 'test/jest-e2e.json', '--runInBand']
    : [];
if (!args.length) process.exitCode = 1;
else {
  const child = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  process.exitCode = child.status ?? 1;
}
