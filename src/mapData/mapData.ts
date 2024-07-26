import { CronJob } from 'cron';
import { Octokit } from '@octokit/core';
import { getAllPriceHistory } from './sources/polymarket';
import fetch from "node-fetch";

const cronJobInstances = [];

const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN,
	request: {
		fetch: fetch,
	}
});

class DataSource {
	id: string
	_fetch: ((source: DataSource, fallback: boolean) => Promise<void>)
	cron: string
	isFetching: boolean
	data: any
	
	constructor(id: string, _fetch: ((source: DataSource, fallback: boolean) => Promise<void>), cron: string) {
		this.id = id;
		this._fetch = _fetch;
		this.cron = cron;
		
		this.isFetching = false;
		this.data = null;
	}
	
	async fetch(fallback: boolean) {
		if (this.isFetching) { return };
		this.isFetching = true;
		
		this.data = await this._fetch(this, fallback);
		
		this.isFetching = false;
	}
}

const sources = [
	new DataSource(
		"2024-president-polymarket",
		(source: DataSource, fallback: boolean) => 
			polymarketFetch("2024-president-polymarket-prices.json", "2024-president-polymarket-tokens.json", source, fallback),
		"1 1 0,12 * * *"
	),
	new DataSource(
		"2024-senate-polymarket",
		(source: DataSource, fallback: boolean) => 
			polymarketFetch("2024-senate-polymarket-prices.json", "2024-senate-polymarket-tokens.json", source, fallback),
		"1 1 2,14 * * *"
	)
];

async function polymarketFetch(dataFile: string, tokenFile: string, source: DataSource, fallback: boolean) {
	console.log("[Data-Cron] Start fetching", source.id);
	
	let returnData;
	
	const {data} = await octokit.request(`GET /repos/jacksonjude/USA-Election-Map-Data/contents/data/${dataFile}`, {
		owner: 'OWNER',
		repo: 'REPO',
		path: 'PATH',
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
	
	if (fallback) {
		returnData = JSON.parse(Buffer.from(data.content, 'base64').toString('ascii'));
		console.log("[Data-Cron] Complete fetching cached", source.id);
	} else {
		const currentPrices: { [k: string]: any } = source.data ?? {}
		const updatedPrices = await getAllPriceHistory(tokenFile);
		for (const region in updatedPrices) {
			currentPrices[region] = updatedPrices[region];
		}
		returnData = currentPrices
		
		console.log("[Data-Cron] Complete fetching new", source.id);
		
		await octokit.request(`PUT /repos/jacksonjude/USA-Election-Map-Data/contents/data/${dataFile}`, {
			owner: 'OWNER',
			repo: 'REPO',
			path: 'PATH',
			message: `Polymarket data ${Date.now()}`,
			committer: {
				name: 'BetaBot',
				email: 'betabot@jacksonjude.com'
			},
			content: Buffer.from(JSON.stringify(returnData)).toString('base64'),
			sha: data.sha,
			headers: {
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
		console.log("[Data-Cron] Uploaded", source.id);
	}
	
	return returnData;
}

export async function initDataFetch() {
	for (const source of sources) {
		await source.fetch(true);
		cronJobInstances.push(new CronJob(source.cron, () => { source.fetch(false) }, null, true, "Etc/UTC"));
	}
}