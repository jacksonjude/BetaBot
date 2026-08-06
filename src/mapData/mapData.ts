import { CronJob } from 'cron';
import { DataSource } from './dataSource';
const cronJobInstances = [];
const fetchQueue = [];

// import { polymarketSources } from './sources/polymarket';
// import { cnnSources } from './sources/cnn';

const sources: DataSource[] = [
	// ...polymarketSources,
	// ...cnnSources
];

export async function initDataFetch() {
	for (const source of sources) {
		cronJobInstances.push(new CronJob(source.cron, () => {
			fetchQueue.push(source.id);
		}, null, true, "Etc/UTC"));
	}
	
	cycleFetchQueue();
}

async function cycleFetchQueue() {
	while (fetchQueue.length > 0) {
		const source = sources.find(s => s.id == fetchQueue[0]);
		await source.executeSync();
		fetchQueue.shift();
	}
	
	setTimeout(() => {
		cycleFetchQueue();
	}, 60*1000)
}