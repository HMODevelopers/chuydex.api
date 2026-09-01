export interface StorageProvider { save(key:string,file:{buffer:Buffer}):Promise<string>; remove(key:string):Promise<void>; }
