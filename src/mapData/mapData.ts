import { CronJob } from 'cron';
import { Octokit } from '@octokit/core';
import { OctokitResponse } from '@octokit/types';
import { getAllPriceHistory } from './sources/polymarket';
import { getCNNData, extractLastData, stripDateColumn, stripHeader } from './sources/cnn';
import fetch from "node-fetch";

const cronJobInstances = [];
const fetchQueue = [];

const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN,
	request: {
		fetch: fetch,
	}
});

class DataSource {
	id: string
	_fetch: ((source: DataSource, fallback: boolean) => Promise<any>)
	cron: string
	startTime: number
	endTime: number
	
	isFetching: boolean
	data: any
	
	constructor(id: string, _fetch: ((source: DataSource, fallback: boolean) => Promise<any>), cron: string, startTime?: number, endTime?: number) {
		this.id = id;
		this._fetch = _fetch;
		this.cron = cron;
		this.startTime = startTime;
		this.endTime = endTime;
		
		this.isFetching = false;
		this.data = null;
	}
	
	async fetch(fallback: boolean) {
		if (this.isFetching || (this.startTime && Date.now() < this.startTime) || (this.endTime && Date.now() > this.endTime)) { return };
		this.isFetching = true;
		
		this.data = await this._fetch(this, fallback);
		
		this.isFetching = false;
	}
}

const sources = [
	// new DataSource(
	// 	"2024-president-polymarket",
	// 	(source: DataSource, fallback: boolean) => 
	// 		polymarketFetch("2024-president-polymarket-prices.json", "2024-president-polymarket-tokens.json", source, fallback),
	// 	"1 1 0,12 * * *"
	// ),
	// new DataSource(
	// 	"2024-senate-polymarket",
	// 	(source: DataSource, fallback: boolean) => 
	// 		polymarketFetch("2024-senate-polymarket-prices.json", "2024-senate-polymarket-tokens.json", source, fallback),
	// 	"1 1 2,14 * * *"
	// ),
	// new DataSource(
	// 	"2024-governor-polymarket",
	// 	(source: DataSource, fallback: boolean) => 
	// 		polymarketFetch("2024-governor-polymarket-prices.json", "2024-governor-polymarket-tokens.json", source, fallback),
	// 	"1 1 3,15 * * *"
	// ),
	// new DataSource(
	// 	"2024-cnn-president",
	// 	(source: DataSource, fallback: boolean) => 
	// 		cnnFetch("2024-president-cnn-3.csv", "https://politics.api.cnn.io/results/national-races/2024-PG.json", source, fallback),
	// 	"1 15,45 * * * *"
	// ),
	// new DataSource(
	// 	"2024-cnn-senate",
	// 	(source: DataSource, fallback: boolean) => 
	// 		cnnFetch("2024-senate-cnn.csv", "https://politics.api.cnn.io/results/national-races/2024-SG.json", source, fallback),
	// 	"1 15,45 * * * *"
	// ),
	// new DataSource(
	// 	"2024-cnn-governor",
	// 	(source: DataSource, fallback: boolean) => 
	// 		cnnFetch("2024-governor-cnn.csv", "https://politics.api.cnn.io/results/national-races/2024-GG.json", source, fallback),
	// 	"1 15,45 * * * *"
	// ),
	// new DataSource(
	// 	"2024-cnn-house",
	// 	(source: DataSource, fallback: boolean) => 
	// 		cnnFetch("2024-house-cnn.csv", "https://politics.api.cnn.io/results/national-races/2024-HG.json", source, fallback),
	// 	"1 15,45 * * * *"
	// )
];

async function polymarketFetch(dataFile: string, tokenFile: string, source: DataSource, fallback: boolean) {
	console.log("[Data-Cron] Start fetching", source.id);
	
	let returnData: {};
	
	const githubResponse = await getGitHubFile(dataFile);
	const previousData = githubResponse.data;
	
	if (!previousData.content) {
		console.log("[Data-Cron] Error fetching uploaded data", githubResponse);
		return;
	}
	
	if (fallback) {
		returnData = JSON.parse(Buffer.from(previousData.content, 'base64').toString('utf-8'));
		console.log("[Data-Cron] Complete fetching cached", source.id);
	} else {
		const currentPrices: { [k: string]: any } = source.data ?? {}
		const updatedPrices = await getAllPriceHistory(tokenFile);
		for (const region in updatedPrices) {
			currentPrices[region] = updatedPrices[region];
		}
		returnData = currentPrices
		
		console.log("[Data-Cron] Complete fetching new", source.id);
		
		await putGitHubFile(dataFile, JSON.stringify(returnData), previousData.sha, `Polymarket data ${Date.now()}`);
		console.log("[Data-Cron] Uploaded", source.id);
	}
	
	return returnData;
}

async function cnnFetch(dataFile: string, sourceFile: string, source: DataSource, fallback: boolean) {
	console.log("[Data-Cron] Start fetching", source.id);
	
	let returnData: string;
	
	const githubResponse = await getGitHubFile(dataFile);
	const previousData = githubResponse.data;
	
	if (!previousData.content) {
		console.log("[Data-Cron] Error fetching uploaded data", githubResponse);
		return;
	}
	
	const previousDataString = Buffer.from(previousData.content, 'base64').toString('utf-8');
	
	if (fallback) {
		returnData = previousDataString;
		console.log("[Data-Cron] Complete fetching cached", source.id);
	} else {
		const updatedData = await getCNNData(sourceFile);
		const lastData = extractLastData(previousDataString);
		
		if (stripDateColumn(updatedData) == stripDateColumn(lastData)) {
			console.log("[Data-Cron] Skipping upload, last update identical", source.id);
			return returnData;
		}
		
		returnData = `${previousDataString}\n${stripHeader(updatedData)}`;
		
		console.log("[Data-Cron] Complete fetching new", source.id);
		
		await putGitHubFile(dataFile, returnData, previousData.sha, `CNN data ${Date.now()}`)
		console.log("[Data-Cron] Uploaded", source.id);
	}
	
	return returnData;
}

async function getGitHubFile(dataFile: string): Promise<OctokitResponse<any,number>> {
	const githubResponse = await octokit.request(`GET /repos/jacksonjude/USA-Election-Map-Data/contents/data/${dataFile}`, {
		owner: 'OWNER',
		repo: 'REPO',
		path: 'PATH',
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
	return githubResponse;
}

async function putGitHubFile(dataFile: string, content: any, sha: any, message: string) {
	await octokit.request(`PUT /repos/jacksonjude/USA-Election-Map-Data/contents/data/${dataFile}`, {
		owner: 'OWNER',
		repo: 'REPO',
		path: 'PATH',
		message: message,
		committer: {
			name: 'BetaBot',
			email: 'betabot@jacksonjude.com'
		},
		content: Buffer.from(content).toString('base64'),
		sha: sha,
		headers: {
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});
}

export async function initDataFetch() {
	for (const source of sources) {
		await source.fetch(true);
		cronJobInstances.push(new CronJob(source.cron, () => {
			fetchQueue.push(source.id);
		}, null, true, "Etc/UTC"));
	}
	
	cycleFetchQueue();
}

async function cycleFetchQueue() {
	while (fetchQueue.length > 0) {
		const source = sources.find(s => s.id == fetchQueue[0]);
		await source.fetch(false);
		fetchQueue.shift();
	}
	
	setTimeout(() => {
		cycleFetchQueue();
	}, 60*1000)
}