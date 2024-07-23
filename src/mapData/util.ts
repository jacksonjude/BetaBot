export function timeout(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export async function sleep(ms, fn, ...args) {
	await timeout(ms);
	return await fn(...args);
}