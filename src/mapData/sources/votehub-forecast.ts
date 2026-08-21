import { VotehubBaseDataSource, RaceInfo, FormattedRaceTimeseries } from './votehub-base';

interface RawRaceTimeseries {
	race_id: string;
	state: string;
	previous_winner: string;
	items: {
		date: string; // MM-DD-YYYY
		probability: number; // % chance of R victory
		vote_share: number; // voteshare of R candidate
		margin: number; // margin between R vs second-place candidate
	}[];
}

class VotehubForecastDataSource extends VotehubBaseDataSource {
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
			console.log(`[VoteHub Forecast] Fetching ${raceInfo.race_id} (${i+1}/${raceTypeInfoList.length})`);
			const raceTimeseries: RawRaceTimeseries = await this.browserFetch(`https://2026-forecast.votehub.com/v1/timeseries?race_id=${raceInfo.race_id}`);
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
			previousPartyWinner: raceTimeseries.previous_winner,
			candidates: candidates,
			timeseries: raceTimeseries.items.map(t => ({
				date: t.date,
				candidates: [
					{
						id: candidates.find(c => c.party == 'R')?.id,
						probability: t.probability,
						voteshare: t.vote_share,
						margin: t.margin
					}
				]
			}))
		}
	}
}

export const votehubForecastDataSources: VotehubForecastDataSource[] = [
	new VotehubForecastDataSource(
		"2026-votehub-forecast-senate",
		"S"
	),
	new VotehubForecastDataSource(
		"2026-votehub-forecast-governor",
		"G"
	),
	new VotehubForecastDataSource(
		"2026-votehub-forecast-house",
		"H"
	),
];