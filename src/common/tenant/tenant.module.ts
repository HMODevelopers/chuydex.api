import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessMember } from '../../database/entities';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';
import { TenantContextGuard } from '../guards/tenant-context.guard';
@Module({
  imports: [TypeOrmModule.forFeature([BusinessMember])],
  providers: [TenantContextGuard, PlatformAdminGuard],
  exports: [TypeOrmModule, TenantContextGuard, PlatformAdminGuard],
})
export class TenantModule {}
