import fetch from 'node-fetch';
import Papa from 'papaparse';
import { DataSource } from '../dataSource';
import { ExecutionInterval } from '../util';

class CNNDataSource extends DataSource {
	sourceURL: string;
	
	constructor(id: string, outputPath: string, sourceURL: string) {
		super(id, ExecutionInterval.semihourly, outputPath);
		
		this.sourceURL = sourceURL;
	}
	
	async fetch(previousDataContent: string) {
		const updatedData = await this.getCNNData(this.sourceURL);
		const lastData = this.extractLastData(previousDataContent);
		
		if (this.stripDateColumn(updatedData) == this.stripDateColumn(lastData)) {
			return null;
		}
		
		const returnData = `${previousDataContent}\n${this.stripHeader(updatedData)}`;
		return returnData;
	}
	
	async getCNNData(url: string): Promise<string> {
		const request = await fetch(url);
		if (!request.ok) {
			console.log("[Data-CNN] Status error for", url, request.status);
			return null;
		}
		
		const jsonData = await request.json();
		return this.formatCNNData(jsonData);
	}
	
	formatCNNData(jsonData: any): string {
		const candidateLines = [];
		
		const date = Date.now();
		
		for (let raceData of jsonData) {
			const raceKey = raceData['ecKey'];
			const reportingPercent = raceData['percentReporting'];
			const totalVotes = raceData['totalVote'];
			const candidates = raceData['candidates'];
			
			for (let candidateData of candidates) {
				const lastName = candidateData['lastName'];
				const candidateID = candidateData['lastNameSlug'];
				const votes = candidateData['voteNum'];
				
				candidateLines.push({
					timestamp: date,
					race: raceKey,
					reportingPercent: reportingPercent,
					lastName: lastName,
					candidateID: candidateID,
					candidateVotes: votes,
					totalVotes: totalVotes
				});
			}
		}
		
		candidateLines.sort((line1, line2) => {
			if (line1.race == line2.race) return line2.candidateID > line1.candidateID ? -1 : 1
			return line2.race > line1.race ? -1 : 1
		});
		
		return Papa.unparse(candidateLines);
	}
	
	extractLastData(csvData: string): string {
		const lastLine = csvData.substring(csvData.lastIndexOf('\n')+1);
		const lastDate = lastLine.split(',')[0];
		return `${this.getHeader(csvData)}\n${csvData.substring(csvData.indexOf(lastDate))}`;
	}
	
	stripDateColumn(csvData: string): string {
		const dateData = (Papa.parse(csvData)).data as any[][];
		for (let i = 0; i < dateData.length; i++) {
			dateData[i].shift();
			const lastIndex = dateData[i].length-1;
			dateData[i][lastIndex] = parseInt(dateData[i][lastIndex].replace('\r', ''));
		}
		return Papa.unparse(dateData);
	}
	
	getHeader(csvData: string): string {
		return csvData.substring(0, csvData.indexOf('\n'));
	}
	
	stripHeader(csvData: string): string {
		return csvData.substring(csvData.indexOf('\n')+1);
	}
}

export const cnnSources: CNNDataSource[] = [
	new CNNDataSource(
		"2024-cnn-senate",
		"2024-senate-cnn.csv",
		"https://politics.api.cnn.io/results/national-races/2024-SG.json"
	),
	new CNNDataSource(
		"2024-cnn-governor",
		"2024-governor-cnn.csv",
		"https://politics.api.cnn.io/results/national-races/2024-GG.json"
	),
	new CNNDataSource(
		"2024-cnn-house",
		"2024-house-cnn.csv",
		"https://politics.api.cnn.io/results/national-races/2024-HG.json"
	)
];