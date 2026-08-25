import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Max, Min } from 'class-validator';
export class PaginationDto { @Transform(({value}) => Number(value)) @IsOptional() @Min(1) page=1; @Transform(({value}) => Number(value)) @IsOptional() @Min(1) @Max(100) limit=20; @IsOptional() @IsString() search?: string; @IsOptional() @IsString() sort?: string; @IsOptional() @IsIn(['ASC','DESC','asc','desc']) order: 'ASC'|'DESC'='DESC'; }
