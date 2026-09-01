import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../common/enums/domain.enums';

export class CreateCustomerPaymentDto {
  @ApiProperty({ example: 50 }) @Type(() => Number) @IsNumber() @IsPositive() monto: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) metodo: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}
export class CancelCustomerPaymentDto {
  @ApiProperty() @IsString() @MaxLength(1000) motivo: string;
}
