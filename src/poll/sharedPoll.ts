import { Client, User, GuildMember, Message, GuildEmoji, ReactionEmoji } from "discord.js"
import { ActionMessage } from "../actionMessage"
import { Firestore, Timestamp } from "firebase-admin/firestore"
import { BotCommand, BotCommandError } from "../botCommand"
import { getRolesByID } from "../util"

export const pollsCollectionID = "pollConfigurations"
export const pollResponsesCollectionID = "responses"

export const voteMessageEmoji = "🗳"
export const submitResponseEmote = "white_check_mark"

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

  roleID?: string
  serverID?: string
  iVotedRoleID?: string
  latestMembershipJoinTime?: number

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
  userID: string | null
  roleID: string | null
  afterPollClose: boolean | null
  accessTime: Timestamp | null
}

export class PollResponse
{
  responseMap: PollResponseMap | null
  messageIDs: string[] | null
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
  var meetsMembershipAge = pollData.serverID && pollData.latestMembershipJoinTime ? member.joinedTimestamp <= pollData.latestMembershipJoinTime : true
  var hasRequiredRoles = pollData.roleID ? member.roles.cache.find(role => role.id == pollData.roleID) : true

  if (!isWithinPollTimeRange)
  {
    msg && msg.channel.send(pollData.name + " has " + (Date.now() < pollData.openTime.toMillis() ? "not opened" : "closed"))
    return false
  }
  if (!inRequiredServer)
  {
    msg && msg.channel.send("Cannot vote on " + pollData.name + " in this server")
    return false
  }
  if (!meetsMembershipAge)
  {
    msg && msg.channel.send("Cannot vote on " + pollData.name + " since you have not been a member of " + msg.guild.name + " for long enough")
    return false
  }
  if (!hasRequiredRoles)
  {
    msg && msg.channel.send("Cannot vote on " + pollData.name + " without the " + pollData.roleID + " role")
    return false
  }

  return true
}

export function getExportPollResultsCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "pollresults", "get poll results",
    /^pollresults\s+(\w+)$/, /^pollresults(\s+.*)?$/,
    "pollresults <poll id>",
    async (commandArguments: string[], message: Message, __, firestoreDB: Firestore) => {
      let pollID = commandArguments[1]

      if (!(pollID in pollsData))
      {
        return new BotCommandError("Invalid poll id '" + pollID + "'", false)
      }

      let pollData = pollsData[pollID]
      let member = await message.member.fetch()

      if (!checkExportPollResultsRequirements(pollData, member, message))
      {
        return new BotCommandError("Exporting requirements not met for " + pollID, false)
      }

      await executeExportPollResultsCommand(message.author, pollID, firestoreDB)
    }
  )
}

function checkExportPollResultsRequirements(pollData: PollConfiguration, member: GuildMember, msg: Message)
{
  if (!pollData.exportAccess)
  {
    msg && msg.channel.send("Export access has not been enabled for " + pollData.name)
    return false
  }

  var userAccessData = pollData.exportAccess.find((userAccess) => userAccess.type == ExportAccessType.user && userAccess.userID == member.user.id)
  var roleAccessData = pollData.exportAccess.find((roleAccess) => roleAccess.type == ExportAccessType.role && member.roles.cache.has(roleAccess.roleID))
  var pollHasClosed = Date.now() >= pollData.closeTime.toMillis()

  if (!userAccessData && !roleAccessData)
  {
    msg && msg.channel.send("You have no access to the results of " + pollData.name)
    return false
  }
  if ((userAccessData || roleAccessData).afterPollClose && !pollHasClosed)
  {
    msg && msg.channel.send("You do not have access to the results of " + pollData.name + " until after the poll has closed")
    return false
  }
  if ((userAccessData || roleAccessData).accessTime && Date.now() < (userAccessData || roleAccessData).accessTime.toMillis())
  {
    msg && msg.channel.send("You do not have access to the results of " + pollData.name + " until " + (new Date((userAccessData || roleAccessData).accessTime.toMillis())).toString())
    return false
  }

  return true
}

import { Parser } from "json2csv"
import { MessageAttachment } from "discord.js"

export async function executeExportPollResultsCommand(user: User, pollID: string, firestoreDB: Firestore)
{
  var dmChannel = user.dmChannel || await user.createDM()
  if (!dmChannel) { return }

  var pollResultsCollection = await firestoreDB.collection(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID).get()

  var formattedPollResults = []

  pollResultsCollection.forEach((pollResultDoc) => {
    let pollResultJSON = pollResultDoc.data()

    if (!pollResultJSON.responseMap) { return }

    formattedPollResults.push({timestamp: pollResultJSON.updatedAt, responseMap: pollResultJSON.responseMap})
  })

  var responseMapKeys = new Set(["timestamp"])
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
  var responseMapKeyArray = Array.from(responseMapKeys)

  formattedPollResults.sort((pollResult1, pollResult2) => pollResult1.timestamp-pollResult2.timestamp)
  responseMapKeyArray.sort((questionID1, questionID2) => {
    let questionIndex1 = pollsData[pollID].questions.findIndex(questionData => questionData.id == questionID1)
    let questionIndex2 = pollsData[pollID].questions.findIndex(questionData => questionData.id == questionID2)

    return questionIndex1-questionIndex2
  })

  var pollResultsCSVParser = new Parser({fields: responseMapKeyArray})
  var pollResultsCSV = pollResultsCSVParser.parse(formattedPollResults)

  var pollResultsCSVFilename = "poll-results-" + pollID + ".csv"
  var csvMessageAttachment = new MessageAttachment(Buffer.from(pollResultsCSV, 'utf-8'), pollResultsCSVFilename)
  dmChannel.send({
    files: [csvMessageAttachment]
  })
}
