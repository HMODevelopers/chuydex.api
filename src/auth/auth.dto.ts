import { IsNotEmpty, IsString, MinLength } from 'class-validator';
export class LoginDto { @IsString() @IsNotEmpty() username:string; @IsString() @MinLength(8) password:string; @IsString() dispositivo?:string; }
export class RefreshDto { @IsString() @IsNotEmpty() refreshToken:string; }
export class ChangePasswordDto { @IsString() @MinLength(8) currentPassword:string; @IsString() @MinLength(8) newPassword:string; }
