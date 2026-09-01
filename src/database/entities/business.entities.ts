import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from 'typeorm';
import { BusinessMembershipStatus, BusinessStatus } from '../../common/enums/domain.enums';
import { SoftDeleteEntity, TimestampedEntity } from './base.entity';
import { Role, User } from './security.entities';

@Entity('negocios')
export class Business extends SoftDeleteEntity {
  @Column({ length: 150 }) nombre: string;
  @Index({ unique: true }) @Column({ length: 160 }) slug: string;
  @Column({ name: 'logo_url', nullable: true, length: 500 }) logoUrl?: string;
  @Column({ nullable: true, length: 30 }) telefono?: string;
  @Column({ nullable: true, length: 30 }) whatsapp?: string;
  @Column({ length: 8, default: 'MXN' }) moneda: string;
  @Column({ name: 'zona_horaria', length: 80, default: 'America/Hermosillo' }) zonaHoraria: string;
  @Index() @Column({ type: 'enum', enum: BusinessStatus, default: BusinessStatus.ACTIVO }) estatus: BusinessStatus;
  @OneToMany(() => BusinessMember, membership => membership.business) memberships: BusinessMember[];
}

@Entity('negocio_usuarios')
@Unique(['businessId', 'userId'])
export class BusinessMember extends TimestampedEntity {
  @ManyToOne(() => Business, business => business.memberships, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'negocio_id' }) business: Business;
  @Column({ name: 'negocio_id', type: 'bigint', unsigned: true }) businessId: number;
  @ManyToOne(() => User, user => user.businessMemberships, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'usuario_id' }) user: User;
  @Column({ name: 'usuario_id', type: 'bigint', unsigned: true }) userId: number;
  @ManyToOne(() => Role, { eager: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'rol_id' }) role: Role;
  @Column({ name: 'rol_id', type: 'bigint', unsigned: true }) roleId: number;
  @Index() @Column({ type: 'enum', enum: BusinessMembershipStatus, default: BusinessMembershipStatus.ACTIVA }) estatus: BusinessMembershipStatus;
}
