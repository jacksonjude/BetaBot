import fs from 'fs';
import fetch from 'node-fetch';
import { sleep } from '../util';

async function getPriceHistory(region: string, token: string) {
	const priceHistory = await fetch(`https://clob.polymarket.com/prices-history?market=${token}&interval=max&fidelity=${(60*24/2)}`);
	if (!priceHistory.ok) {
		console.log("[Data-Polymarket] Status error for", region, priceHistory.status);
		if (priceHistory.status == 429 && priceHistory.headers.get('retry-after') != null) {
			const retryTime = 1000*priceHistory.headers.get('retry-after')+2000
			console.log("[Data-Polymarket] Retrying", region, "in", retryTime)
			return await sleep(retryTime, getPriceHistory, region, token);
		} else {
			return null;
		}
	}
	
	return (await priceHistory.json()).history;
}

export async function getAllPriceHistory() {
	const tokens = JSON.parse(fs.readFileSync("src/mapData/static/polymarket-tokens.json").toString());
	const prices: { [k: string]: any } = {};
	
	for (const region in tokens) {
		const regionPrices = await getPriceHistory(region, tokens[region]);
		if (regionPrices != null) {
			prices[region] = regionPrices
		}
		// break;
	}
	
	// console.log(JSON.stringify(prices));
	// .sort((t1, t2) => t1.t < t2.t).map(t => new Date(t.t*1000)))
	
	return prices;
}