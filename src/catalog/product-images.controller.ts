import { BadRequestException, Controller, Delete, Inject, NotFoundException, Param, ParseIntPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { TenantContextGuard } from '../common/guards/tenant-context.guard';
import { TenantUser } from '../common/tenant/tenant-user';
import { Product } from '../database/entities';
import { STORAGE_PROVIDER } from '../storage/storage.module';
import { StorageProvider } from '../storage/storage.provider';
type UploadedImage={buffer:Buffer;mimetype:string};

@ApiTags('productos') @ApiBearerAuth() @UseGuards(JwtAuthGuard,TenantContextGuard,PermissionsGuard) @Controller('productos')
export class ProductImagesController {
  constructor(@InjectRepository(Product) private readonly products:Repository<Product>,@Inject(STORAGE_PROVIDER) private readonly storage:StorageProvider,private readonly audit:AuditService) {}
  @Post(':id/imagen') @Permissions('productos.editar') @UseInterceptors(FileInterceptor('imagen',{limits:{fileSize:5*1024*1024}})) @ApiConsumes('multipart/form-data') @ApiBody({schema:{type:'object',properties:{imagen:{type:'string',format:'binary'}}}})
  async upload(@Param('id',ParseIntPipe) id:number,@UploadedFile() file:UploadedImage,@CurrentUser() user:TenantUser) { if(!file||!['image/jpeg','image/png','image/webp'].includes(file.mimetype)) throw new BadRequestException({message:'Se requiere una imagen JPEG, PNG o WEBP de máximo 5 MB',errorCode:'INVALID_IMAGE'}); const product=await this.products.findOne({where:{id,businessId:user.businessId}}); if(!product) throw new NotFoundException({message:'Producto no encontrado',errorCode:'PRODUCT_NOT_FOUND'}); const ext=file.mimetype==='image/jpeg'?'jpg':file.mimetype==='image/png'?'png':'webp'; const key=`negocios/${user.businessId}/productos/${id}/${randomUUID()}.${ext}`; const url=await this.storage.save(key,file); const previous=product.imagenUrl; product.imagenUrl=url; await this.products.save(product); if(previous) await this.storage.remove(previous); await this.audit.log({userId:user.id,businessId:user.businessId,modulo:'PRODUCTOS',accion:'PRODUCTO_IMAGEN_ACTUALIZADA',entidad:'productos',entidadId:String(id),descripcion:`Imagen de ${product.nombre} actualizada`}); return {imagenUrl:url}; }
  @Delete(':id/imagen') @Permissions('productos.editar') async remove(@Param('id',ParseIntPipe) id:number,@CurrentUser() user:TenantUser) { const product=await this.products.findOne({where:{id,businessId:user.businessId}}); if(!product) throw new NotFoundException({message:'Producto no encontrado',errorCode:'PRODUCT_NOT_FOUND'}); if(!product.imagenUrl) throw new NotFoundException({message:'El producto no tiene imagen',errorCode:'IMAGE_NOT_FOUND'}); const previous=product.imagenUrl; product.imagenUrl=undefined; await this.products.save(product); await this.storage.remove(previous); await this.audit.log({userId:user.id,businessId:user.businessId,modulo:'PRODUCTOS',accion:'PRODUCTO_IMAGEN_ELIMINADA',entidad:'productos',entidadId:String(id),descripcion:`Imagen de ${product.nombre} eliminada`}); return {message:'Imagen eliminada'}; }
}
