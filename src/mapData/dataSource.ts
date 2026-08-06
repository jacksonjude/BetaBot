import { Octokit } from '@octokit/core';
import { OctokitResponse } from '@octokit/types';
import fetch from "node-fetch";

const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN,
	request: {
		fetch: fetch,
	}
});

type OctokitContentsResponseData = {
	size?: number;
	name?: string;
	path?: string;
	content?: string;
	sha?: string;
}

export abstract class DataSource {
	id: string;
	cron: string;
	outputPath: string;
	startTime: number;
	endTime: number;
	
	isFetching: boolean;
	
	constructor(id: string, cron: string, outputPath: string, startTime?: number, endTime?: number) {
		this.id = id;
		this.cron = cron;
		this.outputPath = outputPath;
		this.startTime = startTime;
		this.endTime = endTime;
		
		this.isFetching = false;
	}
	
	async executeSync() {
		if (this.isFetching || (this.startTime && Date.now() < this.startTime) || (this.endTime && Date.now() > this.endTime)) { return };
		this.isFetching = true;
		
		console.log("[Data-Cron] Start fetching", this.id);
		
		const githubResponse = await this.getGitHubFile(this.outputPath);
		const previousData = githubResponse.data;
		
		if (!previousData?.content) {
			console.log("[Data-Cron] Error fetching previous data", githubResponse);
			return;
		}
		
		const previousDataContent = Buffer.from(previousData.content, 'base64').toString('utf-8');
		const updatedDataContent = await this.fetch(previousDataContent);
		
		if (updatedDataContent) {
			console.log("[Data-Cron] Complete fetching new", this.id);
			
			await this.putGitHubFile(this.outputPath, updatedDataContent, previousData.sha, `${this.id} data ${Date.now()}`);
			console.log("[Data-Cron] Uploaded", this.id);
		} else {
			console.log("[Data-Cron] Skipping upload, last update identical", this.id);
		}
		
		this.isFetching = false;
	}
	
	protected abstract fetch(previousDataContent: string): Promise<string | null>
	
	async getGitHubFile(outputPath: string): Promise<OctokitResponse<OctokitContentsResponseData,number>> {
		const githubResponse = await octokit.request(`GET /repos/jacksonjude/USA-Election-Map-Data/contents/data/${outputPath}`, {
			owner: 'OWNER',
			repo: 'REPO',
			path: 'PATH',
			headers: {
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
		return githubResponse;
	}
	
	async putGitHubFile(outputPath: string, content: string, sha: string, message: string) {
		await octokit.request(`PUT /repos/jacksonjude/USA-Election-Map-Data/contents/data/${outputPath}`, {
			owner: 'OWNER',
			repo: 'REPO',
			path: 'PATH',
			message: message,
			committer: {
				name: 'BetaBot',
				email: 'betabot@jacksonjude.com'
			},
			content: Buffer.from(content).toString('base64'),
			sha: sha,
			headers: {
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
	}
}