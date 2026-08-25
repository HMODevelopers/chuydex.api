import { CreateDateColumn, DeleteDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
export abstract class TimestampedEntity { @PrimaryGeneratedColumn('increment',{type:'bigint',unsigned:true}) id:number; @CreateDateColumn({name:'created_at',type:'datetime'}) createdAt:Date; @UpdateDateColumn({name:'updated_at',type:'datetime'}) updatedAt:Date; }
export abstract class SoftDeleteEntity extends TimestampedEntity { @DeleteDateColumn({name:'deleted_at',type:'datetime',nullable:true}) deletedAt?:Date; }
