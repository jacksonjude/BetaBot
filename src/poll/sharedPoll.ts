import { User, GuildMember, Message, Client, TextChannel } from "discord.js"
import { ActionMessage } from "../actionMessage"
import { Firestore, Timestamp } from "firebase-admin/firestore"
import { BotCommand, BotCommandError, BotCommandRequirement } from "../botCommand"

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
  var meetsMembershipAge = pollData.serverID && pollData.latestMembershipJoinTime ? member.joinedTimestamp <= pollData.latestMembershipJoinTime.toMillis() : true
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

export function getExportPollResultsCommand(overrideCommandRequirement: BotCommandRequirement): BotCommand
{
  return BotCommand.fromRegex(
    "pollresults", "get poll results",
    /^pollresults\s+(\w+)(?:\s+(true|false))?$/, /^pollresults(\s+.*)?$/,
    "pollresults <poll id> [show user tags]",
    async (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => {
      let pollID = commandArguments[1]
      let showUserTags = commandArguments[2] === "true"

      if (!(pollID in pollsData))
      {
        return new BotCommandError("Invalid poll id '" + pollID + "'", false)
      }

      let pollData = pollsData[pollID]
      let member = await message.member.fetch()

      let isBotAdmin = overrideCommandRequirement.requirementTest(message.author, message.member, message, message.channel as TextChannel, message.guild)

      if (!isBotAdmin && !checkExportPollResultsRequirements(pollData, member, message, showUserTags))
      {
        return new BotCommandError("Exporting requirements not met for " + pollID, false)
      }

      await executeExportPollResultsCommand(message.author, pollID, showUserTags, client, firestoreDB)
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

export async function executeExportPollResultsCommand(user: User, pollID: string, showUserTags: boolean, client: Client, firestoreDB: Firestore)
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
      resultRow.user = user.tag
    }
  }

  let responseMapKeys = new Set(["timestamp", "user"])
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
