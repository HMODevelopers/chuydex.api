import { Type } from 'class-transformer'; import { IsInt, IsOptional, IsPositive, IsString, Min } from 'class-validator';
export class InventoryEntryDto { @Type(()=>Number) @IsInt() @IsPositive() productoId:number; @Type(()=>Number) @IsInt() @IsPositive() cantidad:number; @IsOptional() @IsString() motivo?:string; @IsOptional() @IsString() observaciones?:string; }
export class InventoryAdjustmentDto extends InventoryEntryDto { @Type(()=>Number) @IsInt() @Min(0) cantidad:number; @IsString() tipo:'POSITIVO'|'NEGATIVO'; }
