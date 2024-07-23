import { CronJob } from 'cron';
import { Octokit } from '@octokit/core';
import { getAllPriceHistory } from './sources/polymarket';

const cronJobInstances = [];

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const sources = {
	polymarket: {
		id: "polymarket",
		fetch: async (fallback: boolean) => {
			if (sources.polymarket.isFetching) { return };
			sources.polymarket.isFetching = true;
			
			console.log("[Data-Cron] Start fetching polymarket data");
			
			const {data} = await octokit.request('GET /repos/jacksonjude/USA-Election-Map-Data/contents/polymarket-prices.json', {
				owner: 'OWNER',
				repo: 'REPO',
				path: 'PATH',
				headers: {
					'X-GitHub-Api-Version': '2022-11-28'
				}
			});
			
			if (fallback) {
				sources.polymarket.data = JSON.parse(Buffer.from(data.content, 'base64').toString('ascii'));
				console.log("[Data-Cron] Complete fetching cached polymarket data");
			} else {
				const currentPrices: { [k: string]: any } = sources.polymarket.data
				const updatedPrices = await getAllPriceHistory();
				for (const region in updatedPrices) {
					currentPrices[region] = updatedPrices[region];
				}
				sources.polymarket.data = currentPrices
				
				console.log("[Data-Cron] Complete fetching new polymarket data");
				
				await octokit.request('PUT /repos/jacksonjude/USA-Election-Map-Data/contents/polymarket-prices.json', {
					owner: 'OWNER',
					repo: 'REPO',
					path: 'PATH',
					message: `Polymarket data ${Date.now()}`,
					committer: {
						name: 'BetaBot',
						email: 'betabot@jacksonjude.com'
					},
					content: Buffer.from(JSON.stringify(sources.polymarket.data)).toString('base64'),
					sha: data.sha,
					headers: {
						'X-GitHub-Api-Version': '2022-11-28'
					}
				});
				console.log("[Data-Cron] Uploaded polymarket data");
			}
			
			sources.polymarket.isFetching = false;
		},
		cron: "1 1 0,12 * * *",
		isFetching: false,
		data: {}
	}
};

export async function initDataFetch() {
	for (const source of Object.values(sources)) {
		await source.fetch(true);
		cronJobInstances.push(new CronJob(source.cron, () => { source.fetch(false) }, null, true, "Etc/UTC"));
	}
}