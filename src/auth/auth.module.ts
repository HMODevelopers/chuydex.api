import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessMember, Session, User } from '../database/entities';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
@Module({ imports: [TypeOrmModule.forFeature([User, Session, BusinessMember]), PassportModule, JwtModule.register({})], providers: [AuthService, JwtStrategy], controllers: [AuthController], exports: [AuthService] }) export class AuthModule {}
