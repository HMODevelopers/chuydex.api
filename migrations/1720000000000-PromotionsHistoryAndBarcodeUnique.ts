import { MigrationInterface, QueryRunner } from 'typeorm';

export class PromotionsHistoryAndBarcodeUnique1720000000000 implements MigrationInterface {
  name = 'PromotionsHistoryAndBarcodeUnique1720000000000';

  async up(q: QueryRunner) {
    await q.query('ALTER TABLE productos DROP INDEX codigo_barras, ADD UNIQUE INDEX UQ_productos_codigo_barras (codigo_barras)');
    await q.query('ALTER TABLE recompensas ADD COLUMN expira_en DATETIME NULL AFTER generada_en, ADD COLUMN usuario_canje_id BIGINT UNSIGNED NULL AFTER canjeada_en, ADD CONSTRAINT FK_recompensas_usuario_canje FOREIGN KEY (usuario_canje_id) REFERENCES usuarios(id)');
    await q.query("CREATE TABLE progreso_lealtad_ventas (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, venta_id BIGINT UNSIGNED NOT NULL, cliente_id BIGINT UNSIGNED NOT NULL, promocion_id BIGINT UNSIGNED NOT NULL, cantidad_elegible INT UNSIGNED NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY UQ_progreso_lealtad_venta_promocion (venta_id,promocion_id), FOREIGN KEY (venta_id) REFERENCES ventas(id), FOREIGN KEY (cliente_id) REFERENCES clientes(id), FOREIGN KEY (promocion_id) REFERENCES promociones(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    await q.query("CREATE TABLE venta_promociones (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, venta_id BIGINT UNSIGNED NOT NULL, venta_detalle_id BIGINT UNSIGNED NULL, promocion_id BIGINT UNSIGNED NOT NULL, tipo_promocion ENUM('COMPRA_N_LLEVA_M','DESCUENTO_PORCENTAJE','DESCUENTO_MONTO','LEALTAD') NOT NULL, cantidad_beneficiada INT UNSIGNED NOT NULL DEFAULT 0, descuento DECIMAL(12,2) NOT NULL, evidencia JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, FOREIGN KEY (venta_id) REFERENCES ventas(id), FOREIGN KEY (venta_detalle_id) REFERENCES venta_detalle(id), FOREIGN KEY (promocion_id) REFERENCES promociones(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  }

  async down(q: QueryRunner) {
    await q.query('DROP TABLE venta_promociones');
    await q.query('DROP TABLE progreso_lealtad_ventas');
    await q.query('ALTER TABLE recompensas DROP FOREIGN KEY FK_recompensas_usuario_canje, DROP COLUMN usuario_canje_id, DROP COLUMN expira_en');
    await q.query('ALTER TABLE productos DROP INDEX UQ_productos_codigo_barras, ADD INDEX codigo_barras (codigo_barras)');
  }
}
