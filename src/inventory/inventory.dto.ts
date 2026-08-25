import { Type } from 'class-transformer'; import { IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class InventoryEntryDto { @ApiProperty() @Type(()=>Number) @IsInt() @IsPositive() productoId:number; @ApiProperty({ example: 24 }) @Type(()=>Number) @IsInt() @IsPositive() cantidad:number; @ApiPropertyOptional() @IsOptional() @IsString() motivo?:string; @ApiPropertyOptional() @IsOptional() @IsString() observaciones?:string; }
export class InventoryAdjustmentDto extends InventoryEntryDto { @ApiProperty({ minimum: 0 }) @Type(()=>Number) @IsInt() @Min(0) cantidad:number; @ApiProperty({ enum: ['POSITIVO', 'NEGATIVO'] }) @IsString() tipo:'POSITIVO'|'NEGATIVO'; }
