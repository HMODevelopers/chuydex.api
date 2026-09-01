import { Module } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider';
export const STORAGE_PROVIDER='STORAGE_PROVIDER';
@Module({providers:[LocalStorageProvider,{provide:STORAGE_PROVIDER,useExisting:LocalStorageProvider}],exports:[STORAGE_PROVIDER]}) export class StorageModule {}
