import { IsString, IsOptional } from 'class-validator'

export class AwsS3ConfigDto {
	@IsString()
	AWS_S3_BUCKET_NAME!: string

	@IsOptional()
	@IsString()
	AWS_S3_REGION?: string
}
