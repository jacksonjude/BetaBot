import { Message, TextChannel } from "discord.js"

export class BadWordServerConfiguration
{
	b64: string
	timeoutLength: number
	auditChannel?: string
	
	words?: string[]
}

let badWords: {[k: string]: BadWordServerConfiguration} = {}

export function interpretBadWordServerSetting(serverID: string, badWordServerConfig: BadWordServerConfiguration)
{
	const badWordList = JSON.parse(Buffer.from(badWordServerConfig.b64, 'base64').toString()) as string[]
	badWordServerConfig.words = badWordList
	badWords[serverID] = badWordServerConfig
}

export async function checkWords(message: Message): Promise<boolean>
{
	const badWordList = badWords[message.guildId].words
	const wordsToScan = message.content.replace(/[^a-zA-Z]/g, ' ').toLowerCase().split(/\s/)
	for (let word of wordsToScan)
	{
		if (badWordList.includes(word))
		{
			const { timeoutLength, auditChannel } = badWords[message.guildId]
			message.member.timeout(timeoutLength*1000*60, "Naughty words!")
			
			const channel = (await message.guild.channels.fetch(auditChannel)) as TextChannel
			channel.send(`<@${message.author.id}> timed out for ${timeoutLength}s: ${message.content}`)
			
			await message.delete()
			return true
		}
	}
	
	return false
}