import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BusinessMember, Session, User } from '../database/entities';
import { BusinessMembershipStatus, BusinessStatus } from '../common/enums/domain.enums';

type RequestInfo = { ip?: string; userAgent?: string; dispositivo?: string };

@Injectable()
export class AuthService {
  constructor(@InjectRepository(User) private users: Repository<User>, @InjectRepository(Session) private sessions: Repository<Session>, @InjectRepository(BusinessMember) private memberships: Repository<BusinessMember>, private jwt: JwtService, private config: ConfigService, private audit: AuditService) {}
  private async membership(userId: number) {
    const member = await this.memberships.findOne({ where: { userId, estatus: BusinessMembershipStatus.ACTIVA }, relations: { business: true, role: { permissions: true } }, order: { id: 'ASC' } });
    if (!member || member.business.estatus !== BusinessStatus.ACTIVO) throw new UnauthorizedException({ message: 'No tiene un negocio activo asignado', errorCode: 'BUSINESS_ACCESS_UNAVAILABLE' });
    return member;
  }
  private async tokens(user: User, sessionId: string, membership: Awaited<ReturnType<AuthService['membership']>>) {
    const permissions = membership.role.permissions.map(permission => permission.clave);
    const payload = { sub: user.id, username: user.username, businessId: membership.businessId, platformAdmin: user.esAdministradorPlataforma, permissions };
    return { accessToken: await this.jwt.signAsync(payload, { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_EXPIRATION', '15m') }), refreshToken: await this.jwt.signAsync({ ...payload, sid: sessionId }, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: this.config.get('JWT_REFRESH_EXPIRATION', '7d') }) };
  }
  async login(username: string, password: string, info: RequestInfo) {
    const user = await this.users.createQueryBuilder('u').addSelect('u.passwordHash').where('u.username=:username', { username }).andWhere('u.deleted_at IS NULL').getOne();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new UnauthorizedException({ message: 'Credenciales inválidas', errorCode: 'INVALID_CREDENTIALS' });
    if (!user.activo) throw new UnauthorizedException({ message: 'Usuario inactivo', errorCode: 'USER_INACTIVE' });
    const member = await this.membership(user.id);
    const session = await this.sessions.save(this.sessions.create({ userId: user.id, refreshTokenHash: 'pending', dispositivo: info.dispositivo, ip: info.ip, userAgent: info.userAgent, expiraEn: new Date(Date.now() + this.durationMs(this.config.get('JWT_REFRESH_EXPIRATION', '7d'))) }));
    const pair = await this.tokens(user, session.id, member); session.refreshTokenHash = await bcrypt.hash(pair.refreshToken, Number(this.config.get('BCRYPT_ROUNDS', 12))); await this.sessions.save(session); user.ultimoAcceso = new Date(); await this.users.save(user);
    await this.audit.log({ userId: user.id, businessId: member.businessId, modulo: 'AUTH', accion: 'LOGIN', entidad: 'sesiones', entidadId: session.id, descripcion: 'Inicio de sesión' });
    return { ...pair, sessionId: session.id, user: { id: user.id, nombre: user.nombre, username: user.username, role: member.role.nombre, permissions: member.role.permissions.map(permission => permission.clave), negocio: { id: member.business.id, nombre: member.business.nombre, slug: member.business.slug } } };
  }
  async refresh(refreshToken: string) { try { const payload = await this.jwt.verifyAsync<{ sub: number; sid: string }>(refreshToken, { secret: this.config.getOrThrow('JWT_REFRESH_SECRET') }); const session = await this.sessions.createQueryBuilder('session').addSelect('session.refreshTokenHash').leftJoinAndSelect('session.user', 'user').where('session.id=:id AND session.usuario_id=:userId AND session.revocado=false', { id: payload.sid, userId: payload.sub }).getOne(); if (!session || session.expiraEn < new Date() || !(await bcrypt.compare(refreshToken, session.refreshTokenHash))) throw new UnauthorizedException({ message: 'Sesión inválida', errorCode: 'INVALID_SESSION' }); session.revocado = true; await this.sessions.save(session); return this.loginWithRotation(session.user, session); } catch (error) { if (error instanceof UnauthorizedException) throw error; throw new UnauthorizedException({ message: 'Refresh token inválido', errorCode: 'INVALID_REFRESH_TOKEN' }); } }
  private async loginWithRotation(user: User, old: Session) { const member = await this.membership(user.id); const session = await this.sessions.save(this.sessions.create({ userId: user.id, refreshTokenHash: 'pending', dispositivo: old.dispositivo, ip: old.ip, userAgent: old.userAgent, expiraEn: new Date(Date.now() + this.durationMs(this.config.get('JWT_REFRESH_EXPIRATION', '7d'))) })); const pair = await this.tokens(user, session.id, member); session.refreshTokenHash = await bcrypt.hash(pair.refreshToken, Number(this.config.get('BCRYPT_ROUNDS', 12))); await this.sessions.save(session); return { ...pair, sessionId: session.id }; }
  async logout(userId: number, sessionId?: string) { if (sessionId) await this.sessions.update({ id: sessionId, userId }, { revocado: true }); else await this.sessions.update({ userId, revocado: false }, { revocado: true }); return { message: 'Sesión cerrada correctamente' }; }
  async profile(userId: number) { const user = await this.users.findOneBy({ id: userId }); if (!user) throw new UnauthorizedException(); const member = await this.membership(user.id); return { id: user.id, nombre: user.nombre, username: user.username, email: user.email, activo: user.activo, role: member.role.nombre, permissions: member.role.permissions.map(permission => permission.clave), negocio: { id: member.business.id, nombre: member.business.nombre, slug: member.business.slug } }; }
  async changePassword(userId: number, current: string, next: string) { const user = await this.users.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id=:userId', { userId }).getOne(); if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw new BadRequestException({ message: 'Contraseña actual incorrecta', errorCode: 'INVALID_PASSWORD' }); user.passwordHash = await bcrypt.hash(next, Number(this.config.get('BCRYPT_ROUNDS', 12))); await this.users.save(user); await this.sessions.update({ userId, revocado: false }, { revocado: true }); return { message: 'Contraseña actualizada. Inicie sesión nuevamente.' }; }
  private durationMs(value: string) { const match = /^(\d+)([mhd])$/.exec(value); return match ? Number(match[1]) * ({ m: 60000, h: 3600000, d: 86400000 }[match[2]]) : 604800000; }
}
