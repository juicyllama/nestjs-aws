import { AwsS3Format, AwsS3Service } from '../modules/s3'
import { Logger } from '@juicyllama/utils'
import { Injectable, OnModuleInit } from '@nestjs/common'

@Injectable()
export class SandboxS3Service implements OnModuleInit {
	constructor(
		private readonly awsS3Service: AwsS3Service,
		private readonly logger: Logger,
	) {}

	async onModuleInit() {
		this.logger.log('SandboxService has been initialized.', {
			context: ['SandboxService', 'onModuleInit'],
		})

		// 1. Download a random image from Unsplash
		const imageUrl = 'https://placehold.co/400x400/png'
		this.logger.log(`Downloading image from: ${imageUrl}`)

		const image = await fetch(imageUrl)
		if (!image.ok) {
			this.logger.error(`Failed to download image: ${image.status} ${image.statusText}`)
			return
		}
		this.logger.log(`Image downloaded successfully: ${image.url}`)

		// 2. Upload the image to S3

		const buffer = Buffer.from(await image.arrayBuffer())

		const uploadResult = await this.awsS3Service.create({
			location: 'sandbox/400x400-image.png',
			file: buffer,
		})
		this.logger.log(`Image uploaded to S3`, {
			context: ['SandboxService', 'onModuleInit'],
			params: { uploadResult },
		})

		// 3. Retrieve the image from S3
		const s3Object = (await this.awsS3Service.findOne({
			location: 'sandbox/400x400-image.png',
			format: AwsS3Format.Express_Multer_File,
		})) as Express.Multer.File

		let imageBuffer: Buffer
		if (s3Object && Buffer.isBuffer(s3Object.buffer)) {
			imageBuffer = s3Object.buffer
		} else {
			this.logger.error('Failed to retrieve image from S3 or invalid format', {
				context: ['SandboxService', 'onModuleInit'],
			})
			return
		}
		this.logger.log(`Retrieved image from S3, size: ${imageBuffer.length} bytes`)

		// 4. Delete the image from S3
		await this.awsS3Service.remove({
			location: 'sandbox/400x400-image.png',
		})
		this.logger.log('Deleted image from S3: sandbox/400x400-image.png')
	}
}
