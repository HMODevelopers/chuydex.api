import { Injectable } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { StorageProvider } from './storage.provider';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly root=resolve(process.cwd(),'uploads');
  async save(key:string,file:{buffer:Buffer}){const target=resolve(this.root,key);if(!target.startsWith(this.root))throw new Error('Ruta de almacenamiento inválida');await mkdir(join(target,'..'),{recursive:true});await writeFile(target,file.buffer);return `/uploads/${key.replace(/\\/g,'/')}`;}
  async remove(key:string){const target=resolve(this.root,key.replace(/^\/uploads\//,''));if(target.startsWith(this.root))await rm(target,{force:true});}
}
