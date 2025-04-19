import { Message, TextChannel } from "discord.js"
import { Firestore, DocumentReference } from "firebase-admin/firestore"

export class BadWordServerConfiguration
{
	b64: string
	timeoutLength: number
	auditChannel?: string
	
	timeoutCount?: {[k: string]: number}
}

const badWordsCollectionID = "badWordConfigurations"

export let badWords: {[k: string]: {
	config: BadWordServerConfiguration,
	words: string[],
	ref: DocumentReference
}} = {}

export function interpretBadWordServerSetting(serverID: string, badWordServerConfig: BadWordServerConfiguration, firestoreDB: Firestore)
{
	const badWordList = JSON.parse(Buffer.from(badWordServerConfig.b64, 'base64').toString()) as string[]
	const ref = firestoreDB.doc(`${badWordsCollectionID}/${serverID}`)
	badWords[serverID] = {config: badWordServerConfig, words: badWordList, ref: ref}
}

export async function checkWords(message: Message): Promise<boolean>
{
	if (!badWords[message.guildId]) return
	
	const badWordList = badWords[message.guildId].words
	const wordsToScan = message.content.replace(/[^a-zA-Z]/g, ' ').toLowerCase().split(/\s/)
	for (let word of wordsToScan)
	{
		if (badWordList.includes(word))
		{
			const { timeoutLength, auditChannel, timeoutCount } = badWords[message.guildId].config
			
			const newCount = (timeoutCount?.[message.author.id] ?? 0)+1
			
			message.member.timeout(timeoutLength*1000*60*newCount, "Naughty words!")
			
			const channel = (await message.guild.channels.fetch(auditChannel)) as TextChannel
			channel.send(`<@${message.author.id}> timed out for ${timeoutLength*newCount}m (<#${message.channelId}>): ${message.content}`)
			
			await message.delete()
			
			badWords[message.guildId].config.timeoutCount = {
				...timeoutCount ?? {},
				[message.author.id]: newCount
			}
			await badWords[message.guildId].ref.set(badWords[message.guildId].config)
			
			return true
		}
	}
	
	return false
}