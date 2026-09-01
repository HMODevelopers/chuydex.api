import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
@Injectable() export class JwtStrategy extends PassportStrategy(Strategy) { constructor(config: ConfigService) { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET') }); } validate(payload: { sub: number; username: string; permissions: string[]; businessId: number; platformAdmin?: boolean }) { if (!payload?.sub || !payload.businessId) throw new UnauthorizedException(); return { id: payload.sub, username: payload.username, businessId: payload.businessId, permissions: payload.permissions, platformAdmin: Boolean(payload.platformAdmin) }; } }
