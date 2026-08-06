import fs from 'fs';
import fetch from 'node-fetch';
import { sleep } from '../util';
import { DataSource } from '../dataSource';

class PolymarketDataSource extends DataSource {
	tokenPath: string;
	
	constructor(id: string, cron: string, outputPath: string, tokenPath: string) {
		super(id, cron, outputPath);
		
		this.tokenPath = tokenPath;
	}
	
	protected override async fetch(previousDataContent: string) {
		const previousData = JSON.parse(previousDataContent);
		
		const currentPrices: { [k: string]: any } = previousData;
		const updatedPrices = await this.getAllPriceHistory(this.tokenPath);
		for (const region in updatedPrices) {
			currentPrices[region] = updatedPrices[region];
		}
		const returnData = currentPrices
		
		return JSON.stringify(returnData);
	}
	
	async getAllPriceHistory(tokenPath: string) {
		const tokens = JSON.parse(fs.readFileSync(`src/mapData/static/${tokenPath}`).toString());
		const prices: { [k: string]: any } = {};
		
		for (const region in tokens) {
			const regionPrices = await this.getPriceHistory(region, tokens[region]);
			if (regionPrices != null) {
				prices[region] = regionPrices
			}
		}
		
		return prices;
	}
	
	async getPriceHistory(region: string, token: string) {
		const priceHistory = await fetch(`https://clob.polymarket.com/prices-history?market=${token}&interval=max&fidelity=${(60*24/2)}`);
		if (!priceHistory.ok) {
			console.log("[Data-Polymarket] Status error for", region, priceHistory.status);
			if (priceHistory.status == 429 && priceHistory.headers.get('retry-after') != null) {
				const retryTime = 1000*parseFloat(priceHistory.headers.get('retry-after'))+2000
				console.log("[Data-Polymarket] Retrying", region, "in", retryTime)
				return await sleep(retryTime, this.getPriceHistory, region, token);
			} else {
				return null;
			}
		}
		
		return (await priceHistory.json() as any).history;
	}
}

export const polymarketSources: PolymarketDataSource[] = [
	new PolymarketDataSource(
		"2024-president-polymarket",
		"1 1 0,12 * * *",
		"2024-president-polymarket-prices.json",
		"2024-president-polymarket-tokens.json"
	),
	new PolymarketDataSource(
		"2024-senate-polymarket",
		"1 1 2,14 * * *",
		"2024-senate-polymarket-prices.json",
		"2024-senate-polymarket-tokens.json"
	),
	new PolymarketDataSource(
		"2024-governor-polymarket",
		"1 1 3,15 * * *",
		"2024-governor-polymarket-prices.json",
		"2024-governor-polymarket-tokens.json"
	),
];