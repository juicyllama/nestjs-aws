import { InjectConfig } from '../../config/config.provider'
import { InjectS3 } from './aws.s3.constants'
import { AwsS3Format } from './aws.s3.enums'
import { AwsS3ConfigDto } from './config/aws.s3.config.dto'
import {
	CompleteMultipartUploadCommandOutput,
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsCommand,
	PutObjectCommandInput,
	S3Client,
	ServiceInputTypes,
	ServiceOutputTypes,
} from '@aws-sdk/client-s3'
import { Hash } from '@aws-sdk/hash-node'
import { Upload, Configuration } from '@aws-sdk/lib-storage'
import { HttpRequest } from '@aws-sdk/protocol-http'
import { getSignedUrl, S3RequestPresigner } from '@aws-sdk/s3-request-presigner'
import { MiddlewareStack, SourceData } from '@aws-sdk/types'
import { parseUrl } from '@aws-sdk/url-parser'
import { formatUrl } from '@aws-sdk/util-format-url'
import { Logger } from '@juicyllama/utils'
import { Injectable } from '@nestjs/common'
import { getApplyMd5BodyChecksumPlugin } from '@smithy/middleware-apply-body-checksum'
import { Readable } from 'stream'

function streamToString(stream: Readable): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		stream.on('data', (chunk: Buffer) => chunks.push(chunk))
		stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
		stream.on('error', (error: Error) => reject(error))
	})
}

class Sha256Hash extends Hash {
	constructor(secret?: SourceData) {
		super('sha256', secret)
	}
}

@Injectable()
export class AwsS3Service {
	constructor(
		private readonly logger: Logger,
		@InjectS3() private readonly s3Client: S3Client,
		@InjectConfig(AwsS3ConfigDto) private readonly s3Config: AwsS3ConfigDto,
	) {}

	/**
	 * Writes the content to S3
	 *
	 * @param {
	 * 		{String} location where in the bucket to store the file
	 * 		{AwsS3Format} format the file format we are working with
	 * 		{any} file the file contents to create (blob, json etc)
	 * 		{object} params additional params to pass to the s3 client
	 * } options
	 */

	async create(options: {
		location: string
		format?: AwsS3Format
		file: Express.Multer.File | string | Buffer | ArrayBuffer | Readable
		sizing?: Configuration
	}): Promise<CompleteMultipartUploadCommandOutput> {
		this.logger.debug(`Create: ${options.location}`, {
			context: ['AwsS3Service', 'create'],
			params: options,
		})

		if (options.format) {
			switch (options.format) {
				case AwsS3Format.JSON:
					options.file = Buffer.from(JSON.stringify(options.file))
					break
				case AwsS3Format.Express_Multer_File: {
					const multerFile = options.file as Express.Multer.File
					if (multerFile?.buffer) {
						options.file = multerFile.buffer
					} else if (multerFile?.stream) {
						options.file = multerFile.stream
					} else {
						throw new Error('Invalid Express.Multer.File: missing buffer/stream')
					}
					break
				}
			}
		}

		// fetch in Node can return ArrayBuffer; convert to Buffer so the AWS SDK accepts it
		if (options.file instanceof ArrayBuffer) {
			options.file = Buffer.from(options.file)
		}

		try {
			this.s3Client.middlewareStack.use(
				getApplyMd5BodyChecksumPlugin(this.s3Client.config) as any as MiddlewareStack<
					ServiceInputTypes,
					ServiceOutputTypes
				>,
			)

			if (!options.sizing) {
				options.sizing = <Configuration>{
					queueSize: 4,
					partSize: 1024 * 1024 * 5,
					leavePartsOnError: false,
				}
			}

			const upload = new Upload({
				client: this.s3Client,
				params: <PutObjectCommandInput>{
					Bucket: this.s3Config.AWS_S3_BUCKET_NAME,
					Key: options.location,
					Body: options.file,
					...options.sizing,
				},
			})

			upload.on('httpUploadProgress', progress => {
				this.logger.debug(`Progress`, {
					context: ['AwsS3Service', 'create', 'httpUploadProgress'],
					params: {
						progress,
					},
				})
			})

			return await upload.done()
		} catch (err) {
			const e = err as Error
			this.logger.error(e.message, {
				context: ['AwsS3Service', 'create'],
				params: {
					options,
					error: e,
				},
			})

			throw Error(e.message)
		}
	}

	/**
	 * List files in a s3 directory
	 *
	 * @param {
	 * 		{String} location where in the bucket to store the file
	 * 		{AwsS3Bucket} bucket the bucket to access
	 * } options
	 */

	async findAll(options: { location: string }): Promise<any> {
		this.logger.debug(`Find all: ${options.location}`, {
			context: ['AwsS3Service', 'findAll'],
			params: options,
		})

		const command = new ListObjectsCommand({
			Bucket: this.s3Config.AWS_S3_BUCKET_NAME,
			Prefix: options.location,
		})
		const data = await this.s3Client.send(command)

		const files: string[] = []

		if (data && data.Contents) {
			for (const file of data.Contents) {
				let fileName = file.Key
				if (!fileName) {
					this.logger.warn(`No file name found`, {
						context: ['AwsS3Service', 'findAll'],
						params: {
							file,
						},
					})
					continue
				}
				fileName = fileName.replace(options.location, '')
				files.push(fileName)
			}
		}

		this.logger.debug(`Find all: ${options.location} - ${files.length} files found`, {
			context: ['AwsS3Service', 'findAll'],
			params: {
				files,
			},
		})
		return files
	}

	/**
	 * Return the content from S3
	 *
	 * @param {
	 * 		{String} location where in the bucket to store the file
	 * 		{AwsS3Bucket} bucket the bucket to access
	 * 		{AwsS3Format} format the file format we are working with
	 * } options
	 */

	async findOne(options: {
		location: string
		format: AwsS3Format
	}): Promise<Express.Multer.File | string | undefined> {
		this.logger.debug(`Find one: ${options.location}`, {
			context: ['AwsS3Service', 'findOne'],
			params: options,
		})

		const command = new GetObjectCommand({
			Bucket: this.s3Config.AWS_S3_BUCKET_NAME,
			Key: options.location,
		})

		let result

		try {
			const data = await this.s3Client.send(command)
			if (data.Body && data.Body instanceof Readable) {
				result = await streamToString(data.Body)
			} else {
				throw new Error('No body found in response')
			}
		} catch (err) {
			const e = err as Error
			this.logger.error(e.message, {
				context: ['AwsS3Service', 'findOne'],
				params: {
					options,
					error: e,
				},
			})
			throw Error(e.message)
		}

		if (!result) {
			this.logger.warn(`No file found`, {
				context: ['AwsS3Service', 'findOne'],
				params: {
					options,
				},
			})
			return undefined
		}

		if (options.format) {
			switch (options.format) {
				case AwsS3Format.Express_Multer_File: {
					const fileName = options.location.split('/').pop() ?? 'unknown'
					const file: Express.Multer.File = {
						originalname: fileName,
						buffer: Buffer.from(result as string),
						fieldname: fileName,
						size: Buffer.byteLength(result as string),
						encoding: '7bit',
						mimetype: 'application/octet-stream',
						destination: '',
						filename: fileName,
						stream: Readable.from(result as string),
						path: '',
					}
					return file
				}
				case AwsS3Format.JSON:
					try {
						result = JSON.parse((result as string).toString()) as unknown
						return result as string
					} catch (err) {
						const e = err as Error
						this.logger.error(e.message, {
							context: ['AwsS3Service', 'findOne'],
							params: {
								error: e,
							},
						})
						throw e
					}
			}
		}
	}

	/**
	 * Return the signed url from S3 for a private file
	 *
	 * @param {
	 * 		{String} location where in the bucket to store the file
	 * 		{AwsS3Bucket} bucket the bucket to access
	 * 		{expiresIn} the time in seconds the url is valid
	 * } options
	 */

	async getSignedFileUrl(options: { location: string; expiresIn: number }): Promise<string> {
		this.logger.debug(`Get signed URL`, {
			context: ['AwsS3Service', 'getSignedFileUrl'],
			params: options,
		})

		const command = new GetObjectCommand({
			Bucket: this.s3Config.AWS_S3_BUCKET_NAME,
			Key: options.location,
		})

		const url = await getSignedUrl(this.s3Client, command, { expiresIn: options.expiresIn ?? 3600 })

		this.logger.debug(`Signed URL generated`, {
			context: ['AwsS3Service', 'getSignedFileUrl'],
			params: {
				url,
			},
		})
		return url
	}

	/**
	 * Return the signed url from S3 for a private object url
	 *
	 * @param {
	 * 		{url} url of the file in s3
	 * 		{expiresIn} the time in seconds the url is valid
	 * } options
	 */

	async getSignedUrl(options: { url: string; expiresIn: number }): Promise<string> {
		this.logger.debug(`Get signed URL for ${options.url}`, {
			context: ['AwsS3Service', 'getSignedUrl'],
			params: options,
		})

		const s3ObjectUrl = parseUrl(options.url)
		const presigner = new S3RequestPresigner({
			credentials: this.s3Client.config.credentials,
			region: this.s3Client.config.region,
			sha256: Sha256Hash,
		})

		// Create a GET request from S3 url.
		const result = await presigner.presign(new HttpRequest(s3ObjectUrl))
		this.logger.debug(`Result: ${formatUrl(result)}`, {
			context: ['AwsS3Service', 'getSignedUrl'],
			params: {
				result: formatUrl(result),
			},
		})
		return formatUrl(result)
	}

	/**
	 * Deletes the content to S3
	 *
	 * @param {
	 * 		{String} location where in the bucket to store the file
	 * 		{AwsS3Bucket} bucket the bucket to access
	 * } options
	 */

	async remove(options: { location: string }): Promise<any> {
		this.logger.debug(`Delete: ${options.location}`, {
			context: ['AwsS3Service', 'remove'],
			params: options,
		})

		const command = new DeleteObjectCommand({
			Bucket: this.s3Config.AWS_S3_BUCKET_NAME,
			Key: options.location,
		})

		return await this.s3Client.send(command)
	}
}
