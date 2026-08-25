import { Type } from 'class-transformer'; import { ArrayMinSize, IsArray, IsInt, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
export class SaleLineDto { @Type(()=>Number) @IsInt() @IsPositive() productoId:number; @Type(()=>Number) @IsInt() @IsPositive() cantidad:number; }
export class CreateSaleDto { @IsOptional() @Type(()=>Number) @IsInt() @IsPositive() clienteId?:number; @IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>SaleLineDto) productos:SaleLineDto[]; @IsOptional() @IsString() observaciones?:string; }
