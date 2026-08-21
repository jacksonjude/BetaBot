import { VotehubBaseDataSource, RaceInfo, FormattedRaceTimeseries } from './votehub-base';

interface RawRaceTimeseries {
	[date: string]: {
		[candidateName: string]: {
			vh_candidate_id: string;
			average: number;
		}
	}
}

class VotehubPollDataSource extends VotehubBaseDataSource {
	constructor(id: string, raceType: string) {
		super(id, raceType);
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
		
		const candidates = raceInfo.cands.map(c => ({
			id: c.candidate_id,
			name: c.candidate_name,
			party: c.party,
			caucus: c.caucus
		}));
		
		return {
			state,
			number: parseInt(number),
			previousPartyWinner: raceInfo.previous_winner,
			candidates: candidates,
			timeseries: Object.entries(raceTimeseries).map(([date, timeseriesCandidates]) => ({
				date: date,
				candidates: Object.entries(timeseriesCandidates).map(([name, timeseriesCandidate]) => ({
					id: timeseriesCandidate.vh_candidate_id ?? candidates.find(c => c.name == name).id,
					voteshare: timeseriesCandidate.average
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
		"S"
	),
	new VotehubPollDataSource(
		"2026-votehub-poll-governor",
		"G"
	),
];