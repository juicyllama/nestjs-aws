import { getConfigToken } from './config.provider'
import { DynamicModule, Module, Type } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

@Module({})
export class ConfigValidationModule {
	/**
	 * @param Abstracted validation using DTO class that represents the schema to validate
	 */
	static register(schema: Type<object>): DynamicModule {
		const token = getConfigToken(schema)
		return {
			module: ConfigModule,
			providers: [
				{
					provide: token,
					useFactory: async () => {
						await ConfigModule.envVariablesLoaded
						const inst = plainToInstance(schema, process.env)
						const errors = await validate(inst)
						if (errors.length) {
							throw new Error(errors.map(e => e.toString()).join('\n'))
						}

						return inst
					},
				},
			],
			exports: [token],
		}
	}
}
