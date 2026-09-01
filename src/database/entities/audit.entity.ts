import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TimestampedEntity } from './base.entity';
import { User } from './security.entities';
import { Business } from './business.entities';

@Entity('bitacora')
export class AuditLog extends TimestampedEntity {
  @Index() @Column({ name: 'negocio_id', type: 'bigint', unsigned: true, nullable: true }) businessId?: number;
  @ManyToOne(() => Business, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'negocio_id' }) business?: Business;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'usuario_id' }) user?: User;
  @Column({ name: 'usuario_id', type: 'bigint', unsigned: true, nullable: true }) userId?: number;
  @Index() @Column({ length: 60 }) modulo: string;
  @Index() @Column({ length: 80 }) accion: string;
  @Column({ length: 80 }) entidad: string;
  @Column({ name: 'entidad_id', nullable: true, length: 60 }) entidadId?: string;
  @Column({ type: 'text' }) descripcion: string;
  @Column({ name: 'datos_anteriores', type: 'json', nullable: true }) datosAnteriores?: object;
  @Column({ name: 'datos_nuevos', type: 'json', nullable: true }) datosNuevos?: object;
  @Column({ nullable: true, length: 45 }) ip?: string;
  @Column({ name: 'user_agent', nullable: true, length: 500 }) userAgent?: string;
}
