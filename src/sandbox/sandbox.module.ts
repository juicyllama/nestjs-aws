import { Logger } from '@juicyllama/utils'
import { AwsS3Module } from '../index'
import { SandboxS3Service } from './s3.service'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		AwsS3Module
	],
	controllers: [],
	providers: [SandboxS3Service,
		 {
            provide: Logger,
            useFactory: () => {
                return new Logger(['@sandbox', 'SandboxModule'])
            },
        },
	],
	exports: [SandboxS3Service],
})
export class SandboxModule {}
