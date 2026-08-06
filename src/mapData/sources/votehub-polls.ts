import { VotehubBaseDataSource, RaceInfo } from './votehub-base';

interface RawRaceTimeseries {
	[date: string]: {
		[candidateName: string]: {
			vh_candidate_id: string;
			average: number;
		}
	}
}

interface FormattedRaceTimeseries {
	state: string;
	number: number;
	previousPartyWinner: string;
	candidates: {
		id: string;
		name: string;
		party: string;
		unopposed: boolean;
	}[];
	timeseries: {
		date: string;
		candidates: {
			id: string;
			voteshare: number;
		}[];
	}[];
}

class VotehubPollDataSource extends VotehubBaseDataSource {
	constructor(id: string, cron: string, raceType: string) {
		super(id, cron, raceType);
	}
	
	protected override async fetch(_previousDataContent: string) {
		const raceData = await this.getAllRaceTimeseries(this.raceType);
		if (!raceData) { return null; }
		
		return JSON.stringify(raceData);
	}
	
	async getAllRaceTimeseries(raceType: string) {
		const raceTypeInfoList = await this.getRaceTypeInfoList(raceType);
		if (!raceTypeInfoList) { return null; }
		
		const allTimeseries: FormattedRaceTimeseries[] = [];
		for (const [i, raceInfo] of raceTypeInfoList.entries()) {
			const pollRaceID = this.getPollRaceID(raceInfo.race_id);
			
			console.log(`[VoteHub Polls] Fetching ${pollRaceID} (${i+1}/${raceTypeInfoList.length})`);
			const raceTimeseries: RawRaceTimeseries = await this.browserFetch(`https://polling.votehub.com/averages/${pollRaceID}/values`);
			if (!raceTimeseries) { continue; }
			
			const formattedRaceTimeseries = this.formatRaceTimeseries(raceInfo, raceTimeseries);
			
			allTimeseries.push(formattedRaceTimeseries);
		}
		
		return allTimeseries;
	}
	
	formatRaceTimeseries(raceInfo: RaceInfo, raceTimeseries: RawRaceTimeseries): FormattedRaceTimeseries {
		const { state, number } = this.getRaceIDParts(raceInfo.race_id);
		
		return {
			state,
			number: parseInt(number),
			previousPartyWinner: raceInfo.previous_winner,
			candidates: raceInfo.cands.map(c => ({
				id: c.candidate_id,
				name: c.candidate_name,
				party: c.caucus ?? c.party,
				unopposed: c.unopposed
			})),
			timeseries: Object.entries(raceTimeseries).map(([date, candidates]) => ({
				date: date,
				candidates: Object.values(candidates).map(candidate => ({
					id: candidate.vh_candidate_id,
					voteshare: candidate.average
				}))
			}))
		}
	}
	
	getPollRaceID(raceID: string) {
		const { type, year, state, number } = this.getRaceIDParts(raceID);
		const pollRaceID = `${type.toLowerCase()}_${year}_${state.toLowerCase()}_${number}`;
		return pollRaceID;
	}
}

export const votehubPollDataSources: VotehubPollDataSource[] = [
	new VotehubPollDataSource(
		"2026-votehub-poll-senate",
		"1 5 0 * * *",
		"S"
	),
	new VotehubPollDataSource(
		"2026-votehub-poll-governor",
		"1 15 0 * * *",
		"G"
	),
];