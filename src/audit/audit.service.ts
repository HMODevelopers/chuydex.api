import { Injectable } from '@nestjs/common'; import { InjectRepository } from '@nestjs/typeorm'; import { Repository } from 'typeorm'; import { AuditLog } from '../database/entities';
@Injectable() export class AuditService { constructor(@InjectRepository(AuditLog) private readonly repo:Repository<AuditLog>){} async log(input:Partial<AuditLog>) { await this.repo.save(this.repo.create(input)); } }
