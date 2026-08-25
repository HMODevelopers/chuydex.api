import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

export default new DataSource({
  type: 'mysql',

  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),

  username: process.env.DB_USER ?? 'chuydex_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME ?? 'chuydex_db',

  entities: [
    join(__dirname, 'entities/*.{ts,js}'),
  ],

  migrations: [
    join(__dirname, '../../migrations/*.{ts,js}'),
  ],

  synchronize: false,
  charset: 'utf8mb4',
  logging: false,
});