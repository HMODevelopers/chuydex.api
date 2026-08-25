import 'reflect-metadata'; import { validate } from 'class-validator'; import { CreateSaleDto } from '../src/sales/sales.dto';
describe('CreateSaleDto',()=>{it('requiere al menos un producto',async()=>{const dto=new CreateSaleDto();dto.productos=[];expect((await validate(dto)).length).toBeGreaterThan(0);});});
