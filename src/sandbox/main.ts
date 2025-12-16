//import 'module-alias/register'
import { SandboxModule } from './sandbox.module'
import { NestFactory } from '@nestjs/core'
import 'reflect-metadata'
import { Logger } from '@juicyllama/utils'

async function bootstrap() {

	try {

		const app = await NestFactory.create(SandboxModule, {
			cors: true,
			logger: new Logger(['@sandbox', 'Bootstrap']),
		})

		await app.listen(process.env['PORT'] || 3000)

	} catch (err) {
		const e = err as Error
		console.error(`Error during bootstrap: ${e.message}`)
		throw err
	}

}

void bootstrap()