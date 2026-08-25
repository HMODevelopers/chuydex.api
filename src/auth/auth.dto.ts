import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class LoginDto { @ApiProperty({ example: 'admin' }) @IsString() @IsNotEmpty() username:string; @ApiProperty({ example: 'contraseña-segura' }) @IsString() @MinLength(8) password:string; @ApiPropertyOptional({ example: 'chuydex.app' }) @IsOptional() @IsString() dispositivo?:string; }
export class RefreshDto { @ApiProperty() @IsString() @IsNotEmpty() refreshToken:string; }
export class ChangePasswordDto { @ApiProperty() @IsString() @MinLength(8) currentPassword:string; @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) newPassword:string; }
