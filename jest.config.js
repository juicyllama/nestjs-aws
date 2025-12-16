module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	bail: true,
	detectOpenHandles: true,
	resetModules: true,
	forceExit: true,
	rootDir: 'src',
	testTimeout: 120000,
	testRegex: [/.*\.spec\.ts$/],
	transform: {
		'^.+\\.{ts|tsx}?$': [
			'ts-jest',
			{
				babel: true,
				tsConfig: 'tsconfig.json',
				isolatedModules: true,
			},
		],
	},
}