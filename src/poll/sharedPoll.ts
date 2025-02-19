import { User, GuildMember, Message, Client, TextChannel, Guild } from "discord.js"
import { ActionMessage } from "../actionMessage"
import { Firestore, Timestamp } from "firebase-admin/firestore"
import { BotCommand, BotCommandError, BotCommandRequirement } from "../botCommand"
import { getRolesByID } from "../util"
import { roleGroups } from "../roleGroup"

import { CronJob } from "cron"

export const pollsCollectionID = "pollConfigurations"
export const pollResponsesCollectionID = "responses"

export const voteMessageEmoji = "🗳"
export const submitResponseEmote = ":white_check_mark:"

const ExportAccessType = {
  user: "user",
  role: "role"
}

export var pollsData: { [k: string]: PollConfiguration } = {}

export var pollResponses: { [k: string]: { [k: string]: { [k: string]: string } } } = {}

export var pollsActionMessages: { [k: string]: { [k: string]: { [k: string]: ActionMessage<PollQuestion> } | ActionMessage<PollQuestion> } } = {}
export var pollVoteActionMessages: { [k: string]: ActionMessage<PollConfiguration> } = {}

export var pollUpdateCronJobs: { [k: string]: CronJob } = {}

export class PollConfiguration
{
  id: string
  name: string
  pollType: "dm" | "server"
  openTime: Timestamp
  closeTime: Timestamp

  roleIDs?: string[]
  serverID?: string
  iVotedRoleID?: string
  latestMembershipJoinTime?: Timestamp

  channelID?: string
  messageIDs?: { [k: string]: string }

  questions: PollQuestion[]
  voteMessageSettings?: PollVoteMessageConfiguration
  exportAccess?: PollExportAccessConfiguration[]
  
  maximumVoterCount?: number
}

export class PollQuestion
{
  id: string
  prompt: string
  showOptionNames?: boolean = false
  roleIDs?: string[]
  options: PollQuestionOption[]
}

class PollQuestionOption
{
  id: string
  name?: string
  emote: string
}

export class PollVoteMessageConfiguration
{
  channelID: string
  messageID?: string
  messageText: string
  shouldPost: boolean
}

export class PollExportAccessConfiguration
{
  type: "user" | "role"
  userID?: string
  roleID?: string
  afterPollClose?: boolean
  canViewUserTags?: boolean
  accessTime?: Timestamp
}

export class PollResponse
{
  responseMap?: PollResponseMap
  messageIDs?: string[]
  updatedAt: number
}

export class PollResponseMap
{
  [k: string]: string
}

export const catchAllFilter = () => true

export function checkVoteRequirements(pollData: PollConfiguration, serverID: string, member: GuildMember, msg: Message = null)
{
  var isWithinPollTimeRange = Date.now() >= pollData.openTime.toMillis() && Date.now() <= pollData.closeTime.toMillis()
  var inRequiredServer = pollData.serverID ? serverID == pollData.serverID : true
  var meetsMembershipAge = pollData.latestMembershipJoinTime ? member.joinedTimestamp <= pollData.latestMembershipJoinTime.toMillis() : true
  var hasRequiredRoles = pollData.roleIDs ? member.roles.cache.some(role => pollData.roleIDs.includes(role.id)) : true

  if (!isWithinPollTimeRange)
  {
    msg && (msg.channel as TextChannel).send(pollData.name + " has " + (Date.now() < pollData.openTime.toMillis() ? "not opened" : "closed"))
    return false
  }
  if (!inRequiredServer)
  {
    msg && (msg.channel as TextChannel).send("Cannot vote on " + pollData.name + " in this server")
    return false
  }
  if (!meetsMembershipAge)
  {
    msg && (msg.channel as TextChannel).send("Cannot vote on " + pollData.name + " since you have not been a member of " + msg.guild.name + " for long enough")
    return false
  }
  if (!hasRequiredRoles)
  {
    msg && (msg.channel as TextChannel).send("Cannot vote on " + pollData.name + " without one of these roles: " + pollData.roleIDs)
    return false
  }

  return true
}

export async function getAnnouncementMessageText(pollData: PollConfiguration, channel: TextChannel, firestoreDB: Firestore): Promise<string>
{
  let closeTime = Math.round(pollData.closeTime.toMillis()/1000)
  let isClosed = Date.now() > pollData.closeTime.toMillis()
  
  let roleObjects = pollData.roleIDs ? await getRolesByID(pollData.roleIDs, channel.guild) : [channel.guild.roles.everyone]
  let maximumVoters = pollData.maximumVoterCount
  if (!isClosed || maximumVoters == null)
  {
    maximumVoters = roleObjects.reduce((total, role) => 
      total + role.members.filter(m => 
          pollData.latestMembershipJoinTime ? m.joinedTimestamp <= pollData.latestMembershipJoinTime.toMillis() : true
      ).size,
    0)
    
    pollData.maximumVoterCount = maximumVoters
  }
  
  let pollResultsCollection = await firestoreDB.collection(pollsCollectionID + "/" + pollData.id + "/" + pollResponsesCollectionID).get()
  let currentVoters = pollResultsCollection.docChanges().map(response => response.doc.data()).filter(data => data.responseMap && Object.keys(data.responseMap).length > 0).length
  let turnoutPercentage = Math.round(currentVoters/maximumVoters*100*100)/100
  
  return `:alarm_clock: Close${isClosed ? 'd' : 's'} <t:${closeTime}:R>` + "\n" + `:ballot_box: Turnout at ${turnoutPercentage}% (${currentVoters}/${maximumVoters})`
}

export function updateMessageOnClose(pollData: PollConfiguration, updatePoll: (pollID: string) => Promise<void>)
{
  if (Date.now() >= pollData.closeTime.toMillis()) return
  
  if (pollUpdateCronJobs[pollData.id]) pollUpdateCronJobs[pollData.id].stop()
  
  const pollUpdateJob = new CronJob(new Date(pollData.closeTime.toMillis()+300), async () => {
    await updatePoll(pollData.id)
    delete pollUpdateCronJobs[pollData.id]
  })
  pollUpdateJob.start()
  
  pollUpdateCronJobs[pollData.id] = pollUpdateJob
}

export function getExportPollResultsCommand(overrideCommandRequirement: BotCommandRequirement): BotCommand
{
  return BotCommand.fromRegex(
    "pollresults", "get poll results",
    /^pollresults\s+(\w+)(?:\s+(true|false))?((?:\s+[\w-]+)*)$/, /^pollresults(\s+.*)?$/,
    "pollresults <poll id> [show user tags]",
    async (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => {
      let pollID = commandArguments[1]
      let showUserTags = commandArguments[2] === "true"
      let roleGroupIDs = commandArguments[3].trim().split(/\s+/)

      if (!(pollID in pollsData))
      {
        return new BotCommandError("Invalid poll id '" + pollID + "'", false)
      }

      let pollData = pollsData[pollID]
      let member = await message.member.fetch()

      let isBotAdmin = overrideCommandRequirement.requirementTest(message.author, message.member, message, message.channel as TextChannel, message.guild, false)

      if (!isBotAdmin && !checkExportPollResultsRequirements(pollData, member, message, showUserTags))
      {
        return new BotCommandError("Exporting requirements not met for " + pollID, false)
      }

      await executeExportPollResultsCommand(message.author, pollID, showUserTags, roleGroupIDs, message.guild, client, firestoreDB)
    }
  )
}

function checkExportPollResultsRequirements(pollData: PollConfiguration, member: GuildMember, msg: Message, showUserTags: boolean)
{
  if (!pollData.exportAccess)
  {
    msg && (msg.channel as TextChannel).send("Export access has not been enabled for " + pollData.name)
    return false
  }

  var userAccessData = pollData.exportAccess.find((userAccess) => userAccess.type == ExportAccessType.user && userAccess.userID == member.user.id)
  var roleAccessData = pollData.exportAccess.find((roleAccess) => roleAccess.type == ExportAccessType.role && member.roles.cache.has(roleAccess.roleID))
  var pollHasClosed = Date.now() >= pollData.closeTime.toMillis()

  if (!userAccessData && !roleAccessData)
  {
    msg && (msg.channel as TextChannel).send("You have no access to the results of " + pollData.name)
    return false
  }
  if ((userAccessData || roleAccessData).afterPollClose && !pollHasClosed)
  {
    msg && (msg.channel as TextChannel).send("You do not have access to the results of " + pollData.name + " until after the poll has closed")
    return false
  }
  if ((userAccessData || roleAccessData).accessTime && Date.now() < (userAccessData || roleAccessData).accessTime.toMillis())
  {
    msg && (msg.channel as TextChannel).send("You do not have access to the results of " + pollData.name + " until " + (new Date((userAccessData || roleAccessData).accessTime.toMillis())).toString())
    return false
  }
  if (!(userAccessData || roleAccessData).canViewUserTags && showUserTags)
  {
    msg && (msg.channel as TextChannel).send("You do not have access to the user tags in " + pollData.name)
    return false
  }

  return true
}

import { Parser } from "json2csv"
import { AttachmentBuilder } from "discord.js"

export async function executeExportPollResultsCommand(user: User, pollID: string, showUserTags: boolean, roleGroupIDs: string[], server: Guild, client: Client, firestoreDB: Firestore)
{
  let dmChannel = user.dmChannel || await user.createDM()
  if (!dmChannel) { return }

  let pollResultsCollection = await firestoreDB.collection(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID).get()

  let formattedPollResults = []
  let userIDs = []

  pollResultsCollection.forEach((pollResultDoc) => {
    let pollResultJSON = pollResultDoc.data()

    if (!pollResultJSON.responseMap) { return }

    formattedPollResults.push({timestamp: pollResultJSON.updatedAt, responseMap: pollResultJSON.responseMap})
    userIDs.push(pollResultDoc.id)
  })

  if (showUserTags)
  {
    for (let resultOn in formattedPollResults)
    {
      let userID = userIDs[resultOn]
      let resultRow = formattedPollResults[resultOn]

      let user = await client.users.fetch(userID)
      resultRow.user = user.username
    }
  }
  
  for (let roleGroupID of roleGroupIDs)
  {
    if (!roleGroups[roleGroupID]) { continue }
    
    for (let resultOn in formattedPollResults)
    {
      let user = await client.users.fetch(userIDs[resultOn])
      let resultRow = formattedPollResults[resultOn]
      
      let role = await roleGroups[roleGroupID].getUserRole(user, client, server)
      if (!role) { continue }
      
      resultRow[roleGroupID] = role.name
    }
  }

  let responseMapKeys = new Set(["timestamp", "user", ...roleGroupIDs])
  formattedPollResults = formattedPollResults.map((pollResponseData) => {
    Object.keys(pollResponseData.responseMap).forEach((responseMapKey) => {
      let responseValueID = pollResponseData.responseMap[responseMapKey]

      let currentQuestionData = pollsData[pollID].questions.find(questionData => questionData.id == responseMapKey)
      let currentOptionData = currentQuestionData ? currentQuestionData.options.find(optionData => optionData.id == responseValueID) : null

      let questionKey = currentQuestionData ? currentQuestionData.prompt : responseMapKey
      responseMapKeys.add(questionKey)

      pollResponseData[questionKey] = currentOptionData ? currentOptionData.name : responseValueID
    })
    delete pollResponseData.responseMap

    return pollResponseData
  })
  let responseMapKeyArray = Array.from(responseMapKeys)

  formattedPollResults.sort((pollResult1, pollResult2) => pollResult1.timestamp-pollResult2.timestamp)
  responseMapKeyArray.sort((questionID1, questionID2) => {
    let questionIndex1 = pollsData[pollID].questions.findIndex(questionData => questionData.id == questionID1)
    let questionIndex2 = pollsData[pollID].questions.findIndex(questionData => questionData.id == questionID2)

    return questionIndex1-questionIndex2
  })

  let pollResultsCSVParser = new Parser({fields: responseMapKeyArray})
  let pollResultsCSV = pollResultsCSVParser.parse(formattedPollResults)

  let pollResultsCSVFilename = "poll-results-" + pollID + ".csv"
  let csvMessageAttachment = new AttachmentBuilder(Buffer.from(pollResultsCSV, 'utf-8'), { name: pollResultsCSVFilename })
  dmChannel.send({
    files: [csvMessageAttachment]
  })
}
