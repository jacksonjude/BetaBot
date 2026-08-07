import { Impit } from 'impit';
import { ExecutionInterval, timeout } from '../util';
import { DataSource } from '../dataSource';

const impit = new Impit({
	browser: 'chrome',
});

export interface RaceInfo {
	race_id: string;
	state: string;
	previous_winner: string;
	cands: {
		candidate_id: string;
		candidate_name: string;
		party: string;
		unopposed: boolean;
		caucus: string;
	}[];
}

export abstract class VotehubBaseDataSource extends DataSource {
	static raceInfoCache?: {
		data: RaceInfo[];
		expiry: number;
	}
	
	raceType: string;
	
	constructor(id: string, raceType: string) {
		super(id, ExecutionInterval.daily, `${id}.json`);
		
		this.raceType = raceType;
	}
	
	async getRaceTypeInfoList(raceType: string) {
		const allRaceInfo = await this.getAllRaceInfo();
		if (!allRaceInfo) { return null; }
		
		return allRaceInfo.filter(r => this.getRaceIDParts(r.race_id)?.type == raceType);
	}
	
	async getAllRaceInfo(): Promise<RaceInfo[] | null> {
		const currentCache = VotehubBaseDataSource.raceInfoCache;
		if (currentCache && currentCache.expiry > Date.now()) {
			return currentCache.data;
		}
		
		const totalItems = [];
		const fetchSize = 50;
		let cursor = "";
		
		do {
			console.log(`[VoteHub Base] Fetching race info ${totalItems.length}-${totalItems.length+fetchSize}`);
			
			const json = await this.browserFetch(`https://2026-forecast.votehub.com/v1/races?limit=${fetchSize}&cursor=${cursor}`);
			if (!json || !json.items) {
				console.log(json);
				return null;
			}
			
			cursor = json.next_cursor;
			totalItems.push(...json.items);
		} while (cursor != null);
		
		VotehubBaseDataSource.raceInfoCache = {
			data: totalItems,
			expiry: Date.now() + this.runInterval/2
		};
		
		return totalItems;
	}
	
	getRaceIDParts(raceID: string) {
		const raceIDRegex = /^(\w)(\d{4})(\w{2})(\d{2})$/;
		
		const groups = raceID.match(raceIDRegex);
		if (groups.length <= 0) return null;
		
		return {
			type: groups[1],
			year: groups[2],
			state: groups[3],
			number: groups[4]
		}
	}
	
	async browserFetch(url: string) {
		await timeout(100);
		const response = await impit.fetch(url);
		if (!response.ok) {
			const body = await response.text();
			console.log("[VoteHub Base]", response.status, response.statusText, body);
			return null;
		}
		
		const json = await response.json();
		return json;
	}
}