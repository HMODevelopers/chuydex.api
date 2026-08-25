import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from '../database/entities';
const sensitiveKeys = new Set(['password', 'passwordHash', 'password_hash', 'refreshToken', 'refresh_token', 'refreshTokenHash', 'refresh_token_hash', 'authorization', 'jwt', 'secret']);
@Injectable() export class AuditService { constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {} async log(input: Partial<AuditLog>, manager?: EntityManager) { const repository = manager ? manager.getRepository(AuditLog) : this.repo; await repository.save(repository.create(this.sanitize(input) as Partial<AuditLog>)); } private sanitize(value: unknown): unknown { if (Array.isArray(value)) return value.map((item) => this.sanitize(item)); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !sensitiveKeys.has(key)).map(([key, item]) => [key, this.sanitize(item)])); } }
