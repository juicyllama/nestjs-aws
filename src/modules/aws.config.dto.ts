import { IsOptional, IsString } from 'class-validator'

export class AwsConfigDto {
	@IsString()
	@IsOptional()
	AWS_DEFAULT_REGION?: string

	@IsString()
	AWS_ACCESS_KEY_ID!: string

	@IsString()
	AWS_SECRET_ACCESS_KEY!: string

	@IsString()
	@IsOptional()
	AWS_ENDPOINT_URL?: string
}

export const AWS_DEFAULT_REGION = 'eu-west-2'
