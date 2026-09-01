import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessMember } from '../../database/entities';
import { PlatformAdminGuard } from '../guards/platform-admin.guard';
import { TenantContextGuard } from '../guards/tenant-context.guard';
@Global() @Module({ imports: [TypeOrmModule.forFeature([BusinessMember])], providers: [TenantContextGuard, PlatformAdminGuard], exports: [TenantContextGuard, PlatformAdminGuard] }) export class TenantModule {}
