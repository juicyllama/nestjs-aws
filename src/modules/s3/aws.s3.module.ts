import { ConfigValidationModule } from '../../config/config.module'
import { getConfigToken } from '../../config/config.provider'
import { AWS_DEFAULT_REGION, AwsConfigDto } from '../aws.config.dto'
import { S3Client } from './aws.s3.constants'
import { AwsS3Service } from './aws.s3.service'
import { AwsS3ConfigDto } from './config/aws.s3.config.dto'
import { S3Client as AWSS3Client } from '@aws-sdk/client-s3'
import { Logger } from '@juicyllama/utils'
import { Module } from '@nestjs/common'

@Module({
	imports: [ConfigValidationModule.register(AwsS3ConfigDto), ConfigValidationModule.register(AwsConfigDto)],
	controllers: [],
	providers: [
		AwsS3Service,
		{
			provide: Logger,
			useFactory: () => {
				return new Logger(['@juicyllama/nestjs-aws', 'AwsS3Module'])
			},
		},
		{
			provide: S3Client,
			inject: [getConfigToken(AwsS3ConfigDto), getConfigToken(AwsConfigDto)],
			useFactory: (s3Config: AwsS3ConfigDto, awsConfig: AwsConfigDto) => {
				return new AWSS3Client({
					region: s3Config.AWS_S3_REGION ?? awsConfig.AWS_DEFAULT_REGION ?? AWS_DEFAULT_REGION,
					endpoint: awsConfig.AWS_ENDPOINT_URL ?? undefined,
					credentials: {
						accessKeyId: awsConfig.AWS_ACCESS_KEY_ID,
						secretAccessKey: awsConfig.AWS_SECRET_ACCESS_KEY,
					},
				})
			},
		},
	],
	exports: [AwsS3Service],
})
export class AwsS3Module {}
