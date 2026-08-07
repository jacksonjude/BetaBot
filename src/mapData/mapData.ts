import { CronJob } from 'cron';
import { DataSource } from './dataSource';
import { ExecutionInterval, HOUR_MS, MINUTE_MS, SECOND_MS } from './util';

const cronJobInstances = [];
const fetchQueue = [];

import { polymarketSources } from './sources/polymarket';
import { cnnSources } from './sources/cnn';
import { votehubForecastDataSources } from './sources/votehub-forecast';
import { votehubPollDataSources } from './sources/votehub-polls';

const sourceGroups: { id: string; sources: DataSource[] }[] = [
	{ id: 'polymarket', sources: polymarketSources }, 
	{ id: 'cnn', sources: cnnSources },
	{ id: 'votehub-forecast', sources: votehubForecastDataSources },
	{ id: 'votehub-poll', sources: votehubPollDataSources },
];

const ACTIVE_SOURCE_GROUPS: string[] = (() => {
	try {
		return JSON.parse(process.env.FETCH_ACTIVE_SOURCE_GROUPS);
	} catch {
		return [];
	}
})();

const BASE_OFFSET_MS = parseInt(process.env.FETCH_BASE_OFFSET_MS) || 0;
const GAP_MS = parseInt(process.env.FETCH_GAP_MS) || 5*MINUTE_MS;

export async function initDataFetch() {
	for (const sourceGroup of sourceGroups) {
		if (!ACTIVE_SOURCE_GROUPS.includes(sourceGroup.id)) { continue; }
		
		for (const [i, source] of sourceGroup.sources.entries()) {
			const offsetMs = (BASE_OFFSET_MS + i * GAP_MS) % source.runInterval;
			const cron = generateCronString(source.runInterval, offsetMs);
			
			cronJobInstances.push(new CronJob(cron, () => {
				fetchQueue.push(source.id);
			}, null, true, "Etc/UTC"));
		}
	}
	
	cycleFetchQueue();
}

function generateCronString(runInterval: ExecutionInterval, offsetMs: number) {
	const second = Math.floor((offsetMs % MINUTE_MS) / SECOND_MS);
	const minute = Math.floor((offsetMs % HOUR_MS) / MINUTE_MS);
	const hour = Math.floor(offsetMs / HOUR_MS);
	
	switch (runInterval) {
		case ExecutionInterval.daily:
		return `${second} ${minute} ${hour} * * *`;
		
		case ExecutionInterval.semidaily:
		return `${second} ${minute} ${hour},${hour+12} * * *`;
		
		case ExecutionInterval.hourly:
		return `${second} ${minute} * * * *`;
		
		case ExecutionInterval.semihourly:
		return `${second} ${minute},${minute+30} * * * *`;
	}
}

async function cycleFetchQueue() {
	while (fetchQueue.length > 0) {
		const source = sourceGroups.map(g => g.sources).flat().find(s => s.id == fetchQueue[0]);
		await source.executeSync();
		fetchQueue.shift();
	}
	
	setTimeout(() => {
		cycleFetchQueue();
	}, 60*1000);
}