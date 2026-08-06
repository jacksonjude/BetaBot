export function timeout(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sleep(ms: number, fn: (...args: any[]) => Promise<any>, ...args: any[]) {
	await timeout(ms);
	return await fn(...args);
}