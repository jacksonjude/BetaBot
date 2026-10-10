import { Client, TextChannel } from 'discord.js';
import { Firestore } from 'firebase-admin/firestore';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { fetchAllMessages } from '../../util';
import { DataSource } from '../dataSource';
import { ExecutionInterval } from '../util';
import { initFirestore } from '../../firebase';

enum RaceType {
	senate = "USA-Senate",
	governor = "USA-Governor"
}

interface MapMetadata {
	mapType: RaceType;
}

interface MapContent {
	compressedData: string;
}

interface MapDataRow {
	region: string;
	party: string;
	voteshare: number;
	disabled: string;
}

const positivePartyID = "DEM";
const negativePartyID = "REP";

const partyIDToCandidate = {
	"DEM": "Democratic",
	"REP": "Republican"
};

const firestoreMapMetaCache: Record<string, {data: MapMetadata, updated: Date}> = {};
const firestoreMapMetaCacheExpiry = 1*60*60*1000;

class DiscordContestSource extends DataSource {
	getFirestore: () => Firestore;
	channelID: string;
	submissionRegex: RegExp;
	mapIDRegex: RegExp;
	raceType: RaceType;
	specialRaceIDs?: string[];
	
	constructor(id: string, outputPath: string, getFirestore: () => Firestore, channelID: string, submissionRegex: RegExp, mapIDRegex: RegExp, raceType: RaceType, specialRaceIDs?: string[]) {
		super(id, ExecutionInterval.daily, outputPath);
		
		this.getFirestore = getFirestore;
		this.channelID = channelID;
		this.submissionRegex = submissionRegex;
		this.mapIDRegex = mapIDRegex;
		this.raceType = raceType;
		this.specialRaceIDs = specialRaceIDs;
	}
	
	async fetch(previousDataContent: string, client: Client) {
		const updatedData = await this.getCurrentAverageData(client);
		
		const returnData = `${previousDataContent}\n${this.stripHeader(updatedData)}`;
		return returnData;
	}
	
	async getCurrentAverageData(client: Client): Promise<string> {
		const mapIDs = await this.getDiscordMapIDs(client);
		const rawMapStrings = await this.getFirestoreMapData(mapIDs);
		const mapDataRows = this.parseMapData(rawMapStrings);
		const averageMapData = this.getAverageMapData(mapDataRows);
		const averageMapDataString = this.unparseMapData(averageMapData);
		return averageMapDataString;
	}
	
	async getDiscordMapIDs(client: Client): Promise<string[]> {
		const channel = await client.channels.fetch(this.channelID) as TextChannel;
		const messages = await fetchAllMessages(channel);
		
		const mapIDs = messages.map(m => m.content).filter(c => this.submissionRegex.test(c)).flatMap(c => {
			const matches = this.mapIDRegex.exec(c);
			return matches ? matches.slice(1) : [];
		});
		
		return mapIDs;
	}
	
	async getFirestoreMapData(mapIDs: string[]): Promise<string[]> {
		const firestoreDB = this.getFirestore();
		
		const rawMapStrings: string[] = [];
		
		for (const mapID of mapIDs) {
			let cacheEntry = firestoreMapMetaCache[mapID];
			if (!cacheEntry || Date.now() - cacheEntry.updated.getTime() > firestoreMapMetaCacheExpiry) {
				const mapMetadataDoc = await firestoreDB.doc(`maps/${mapID}`).get();
				const mapMetadata = mapMetadataDoc.data() as MapMetadata;
				if (!mapMetadata) {
					continue;
				}
				cacheEntry = firestoreMapMetaCache[mapID] = {data: mapMetadata, updated: new Date()};
			}
			
			if (cacheEntry.data.mapType != this.raceType) {
				continue;
			}
			
			const mapContentDoc = await firestoreDB.doc(`maps/${mapID}/content/data`).get();
			const mapContent = mapContentDoc.data() as MapContent;
			if (!mapContent) {
				continue;
			}
			
			const zippedMap = await JSZip.loadAsync(mapContent.compressedData, { base64: true });
			const jsonMapData = await zippedMap.file("data").async("string");
			if (!jsonMapData) {
				continue;
			}
			
			let csvMapData: string;
			try {
				csvMapData = JSON.parse(jsonMapData)?.mapData
			} catch {
				continue;
			}
			if (!csvMapData) {
				continue;
			}
			
			rawMapStrings.push(csvMapData);
		}
		
		return rawMapStrings;
	}
	
	parseMapData(rawMapStrings: string[]): MapDataRow[][] {
		const formattedMapData: MapDataRow[][] = rawMapStrings.map(rawMapString => {
			const mapData = Papa.parse<MapDataRow>(rawMapString, {
				header: true,
				skipEmptyLines: true,
				dynamicTyping: { voteshare: true }
			});
			
			return mapData.data;
		});
		
		return formattedMapData;
	}
	
	getAverageMapData(mapData: MapDataRow[][]): any[] {
		const regionMargins: Record<string, number[]> = {};
		
		for (const mapRows of mapData) {
			const mapRegionRows: Record<string, MapDataRow[]> = {};
			
			for (const mapDataRow of mapRows) {
				let { region, voteshare, disabled } = mapDataRow;
				
				if (voteshare <= 0 || voteshare > 1 || disabled == "TRUE") {
					continue;
				}
				
				if (this.raceType == RaceType.senate) {
					region = `${mapDataRow.region}-${mapDataRow['class']}`;
				}
				
				if (!mapRegionRows[region]) {
					mapRegionRows[region] = [mapDataRow];
				} else {
					mapRegionRows[region].push(mapDataRow);
				}
			}
			
			for (const [region, rows] of Object.entries(mapRegionRows)) {
				const [winner, runnerUp] = rows.sort((a, b) => b.voteshare - a.voteshare);
				const margin = winner.voteshare - (runnerUp?.voteshare ?? 0);
				const signedMargin = margin*(winner.party == positivePartyID ? 1 : -1);
				
				if (!regionMargins[region]) {
					regionMargins[region] = [signedMargin];
				} else {
					regionMargins[region].push(signedMargin);
				}
			}
		}
		
		const currentDate = new Date();
		const formattedDateString = `${currentDate.getMonth()+1}/${currentDate.getDate()}/${currentDate.getFullYear()}`;
		
		const regionAverages = Object.entries(regionMargins).map(([region, margins]) => {
			const avgMargin = margins.reduce((prev, curr) => prev + curr, 0)/margins.length;
			const partyID = Math.sign(avgMargin) >= 0 ? positivePartyID : negativePartyID;
			
			const regionRow = {
				date: formattedDateString,
				region,
				special: this.specialRaceIDs && this.specialRaceIDs.includes(region) ? "TRUE" : "FALSE",
				runoff: "FALSE",
				offyear: "FALSE",
				disabled: "FALSE",
				candidate: partyIDToCandidate[partyID],
				party: partyID,
				voteshare: Math.abs(avgMargin)
			};
			
			if (this.raceType == RaceType.senate) {
				const [state, classNum] = region.split('-');
				regionRow['region'] = state;
				regionRow['class'] = classNum;
			}
			
			return regionRow;
		});
		
		return regionAverages;
	}
	
	unparseMapData(mapData: MapDataRow[]): string {
		return Papa.unparse(mapData, {
			header: true,
			skipEmptyLines: true
		});
	}
	
	stripHeader(csvData: string): string {
		return csvData.substring(csvData.indexOf('\n')+1);
	}
}

const JJ_DISCORD_2026_CONTEST_CHANNEL_ID = "1556438961428103278";
const JJ_DISCORD_SUBMISSION_REGEX = /^<@\d+>'s submission: .+/;
const JJ_SITE_MAP_ID_REGEX = /https:\/\/map\.jacksonjude\.com\/\?id=([\w-]+)/;

let jjMapFirestore: Firestore | undefined;
const getJJMapFirestore = () => jjMapFirestore ??= initFirestore(process.env.JJ_MAP_FIRESTORE_KEY_JSON, "jj-map");

const SENATE_2026_SPECIAL_RACES = [
	"Florida-3",
	"Ohio-3"
];

export const discordContestSources: DiscordContestSource[] = [
	new DiscordContestSource(
		"2026-jj-discord-senate",
		"2026-jj-discord-senate.csv",
		getJJMapFirestore,
		JJ_DISCORD_2026_CONTEST_CHANNEL_ID,
		JJ_DISCORD_SUBMISSION_REGEX,
		JJ_SITE_MAP_ID_REGEX,
		RaceType.senate,
		SENATE_2026_SPECIAL_RACES
	),
	new DiscordContestSource(
		"2026-jj-discord-governor",
		"2026-jj-discord-governor.csv",
		getJJMapFirestore,
		JJ_DISCORD_2026_CONTEST_CHANNEL_ID,
		JJ_DISCORD_SUBMISSION_REGEX,
		JJ_SITE_MAP_ID_REGEX,
		RaceType.governor
	)
];