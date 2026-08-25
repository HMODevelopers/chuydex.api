import { MigrationInterface, QueryRunner } from 'typeorm';
export class RewardEvidence1720000000001 implements MigrationInterface { name='RewardEvidence1720000000001'; async up(q:QueryRunner) { await q.query('ALTER TABLE recompensas ADD COLUMN evidencia JSON NULL AFTER descripcion'); } async down(q:QueryRunner) { await q.query('ALTER TABLE recompensas DROP COLUMN evidencia'); } }
