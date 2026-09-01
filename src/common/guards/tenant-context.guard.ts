import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessMember } from '../../database/entities';
import { BusinessMembershipStatus, BusinessStatus } from '../enums/domain.enums';

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(@InjectRepository(BusinessMember) private readonly memberships: Repository<BusinessMember>) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const identity = request.user as { id?: number; businessId?: number } | undefined;
    if (!identity?.id || !identity.businessId) throw new UnauthorizedException({ message: 'La sesión no tiene un negocio activo', errorCode: 'BUSINESS_CONTEXT_REQUIRED' });
    const match = await this.memberships.findOne({
      where: { userId: identity.id, businessId: identity.businessId, estatus: BusinessMembershipStatus.ACTIVA },
      relations: { business: true, role: { permissions: true } },
    });
    if (!match || match.estatus !== BusinessMembershipStatus.ACTIVA) throw new ForbiddenException({ message: 'No tiene acceso al negocio seleccionado', errorCode: 'BUSINESS_MEMBERSHIP_REQUIRED' });
    if (match.business.estatus !== BusinessStatus.ACTIVO) throw new ForbiddenException({ message: 'El negocio no está activo', errorCode: 'BUSINESS_NOT_ACTIVE' });
    request.user = { ...identity, businessId: match.businessId, membershipId: match.id, role: match.role.nombre, permissions: match.role.permissions.map(permission => permission.clave), platformAdmin: Boolean((identity as { platformAdmin?: boolean }).platformAdmin) };
    return true;
  }
}
