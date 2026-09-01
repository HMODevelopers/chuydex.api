import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (context.switchToHttp().getRequest().user?.platformAdmin) return true;
    throw new ForbiddenException({ message: 'Se requiere administración de plataforma', errorCode: 'PLATFORM_ADMIN_REQUIRED' });
  }
}
