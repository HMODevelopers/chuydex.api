const { existsSync } = require('fs');
const { resolve } = require('path');
const dotenv = require('dotenv');

const envPath = resolve(process.cwd(), '.env.test');
if (!existsSync(envPath)) throw new Error('Falta .env.test; copie .env.test.example.');
dotenv.config({ path: envPath, override: true });
process.env.NODE_ENV = 'test';
if (process.env.DB_NAME !== 'chuydex_e2e') throw new Error('Seguridad E2E: DB_NAME debe ser chuydex_e2e.');
require('../../dist/main');
