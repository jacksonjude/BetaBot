import fetch from 'node-fetch';
import Papa from 'papaparse';

export async function getCNNData(url: string): Promise<string> {
	const request = await fetch(url);
	if (!request.ok) {
		console.log("[Data-CNN] Status error for", url, request.status);
		return null;
	}
	
	const jsonData = await request.json();
	return formatCNNData(jsonData);
}

function formatCNNData(jsonData: any): string {
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

export function extractLastData(csvData: string): string {
	const lastLine = csvData.substring(csvData.lastIndexOf('\n')+1);
	const lastDate = lastLine.split(',')[0];
	return `${getHeader(csvData)}\n${csvData.substring(csvData.indexOf(lastDate))}`;
}

export function stripDateColumn(csvData: string): string {
	const dateData = (Papa.parse(csvData)).data as any[][];
	for (let i = 0; i < dateData.length; i++) {
		dateData[i].shift();
		const lastIndex = dateData[i].length-1;
		dateData[i][lastIndex] = parseInt(dateData[i][lastIndex].replace('\r', ''));
	}
	return Papa.unparse(dateData);
}

function getHeader(csvData: string): string {
	return csvData.substring(0, csvData.indexOf('\n'));
}

export function stripHeader(csvData: string): string {
	return csvData.substring(csvData.indexOf('\n')+1);
}

// import fs from 'fs';

(async () => {
	// console.log(await getCNNData('https://politics.api.cnn.io/results/national-races/2024-PG.json'));
	// console.log(await getCNNData('https://politics.api.cnn.io/results/national-races/2024-SG.json'));
	// console.log(await getCNNData('https://politics.api.cnn.io/results/national-races/2024-GG.json'));
	// console.log(await getCNNData('https://politics.api.cnn.io/results/national-races/2024-HG.json'));
	
	// const previousDataContent = fs.readFileSync('../static/cnn-pres-test.csv').toString();
	// 
	// const updatedData = await getCNNData('https://politics.api.cnn.io/results/national-races/2024-PG.json');
	// const lastData = extractLastData(previousDataContent);
	// 
	// if (stripDateColumn(updatedData) == stripDateColumn(lastData)) {
	// 	console.log("[Data-Cron] Skipping upload, last update identical");
	// 	return;
	// }
	// 
	// const returnData = `${previousDataContent}\n${stripHeader(updatedData)}`;
	// console.log(returnData);
});//();