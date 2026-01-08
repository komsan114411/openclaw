
import { Module, Global } from '@nestjs/common';
import { SecurityUtil } from './security.util';

@Global()
@Module({
    providers: [SecurityUtil],
    exports: [SecurityUtil],
})
export class SecurityModule { }
