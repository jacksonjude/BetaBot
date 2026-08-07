export function timeout(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sleep(ms: number, fn: (...args: any[]) => Promise<any>, ...args: any[]) {
	await timeout(ms);
	return await fn(...args);
}

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;

export const ExecutionInterval = {
	daily: 24*HOUR_MS,
	semidaily: 12*HOUR_MS,
	hourly: HOUR_MS,
	semihourly: HOUR_MS/2
} as const;
export type ExecutionInterval = typeof ExecutionInterval[keyof typeof ExecutionInterval];