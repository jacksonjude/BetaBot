import { Client, User, GuildMember, Message, MessageReaction, GuildEmoji, ReactionEmoji, ReactionCollector } from "discord.js"
import { Firestore, Timestamp } from "firebase-admin/firestore"

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
export var pollResponseReactionCollectors: { [k: string]: { [k: string]: ReactionCollector[] } | ReactionCollector[] } = {}

export var pollsMessageIDs: { [k: string]: { [k: string]: { [k: string]: string } | string } } = {}
export var pollVoteMessageReactionCollectors: { [k: string]: ReactionCollector } = {}

export class PollConfiguration
{
  id: string
  name: string
  pollType: "dm" | "server"
  openTime: Timestamp
  closeTime: Timestamp

  roleID: string
  serverID: string

  channelID: string
  messageIDs: { [k: string]: string }

  questions: PollQuestion[]
  voteMessageSettings: PollVoteMessageConfiguration
  exportAccess: PollExportAccessConfiguration[]
}

class PollQuestion
{
  id: string
  prompt: string
  options: PollQuestionOption[]
}

class PollQuestionOption
{
  id: string
  name: string
  emote: string
}

export class PollVoteMessageConfiguration
{
  channelID: string
  messageID: string | null
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

import * as emojiConverter from 'node-emoji'

export const checkVoteRequirements = function(pollData: PollConfiguration, serverID: string, member: GuildMember, msg: Message = null)
{
  var isWithinPollTimeRange = Date.now() >= pollData.openTime.toMillis() && Date.now() <= pollData.closeTime.toMillis()
  var inRequiredServer = pollData.serverID ? serverID == pollData.serverID : true
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
  if (!hasRequiredRoles)
  {
    msg && msg.channel.send("Cannot vote on " + pollData.name + " without the " + pollData.roleID + " role")
    return false
  }

  return true
}

export const sendExportPollResultsCommand = async function(msg: Message, messageContent: string)
{
  if (/^pollresults\s(.+)$/.test(messageContent.toLowerCase()))
  {
    await msg.member.fetch()

    var pollID = /^pollresults\s(.+)$/.exec(messageContent)[1]

    if (!(pollID in pollsData))
    {
      msg.channel.send("Invalid poll name: " + pollID)
      return false
    }

    var pollData = pollsData[pollID]

    if (!checkExportPollResultsRequirements(pollData, msg.member, msg)) { return }

    return pollID
  }

  return false
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

export const executeExportPollResultsCommand = async function(user: User, pollID: string, firestoreDB: Firestore)
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
      responseMapKeys.add(responseMapKey)
      pollResponseData[responseMapKey] = pollResponseData.responseMap[responseMapKey]
    })
    delete pollResponseData.responseMap

    return pollResponseData
  })
  var responseMapKeyArray = Array.from(responseMapKeys)

  formattedPollResults.sort((pollResult1, pollResult2) => pollResult1.timestamp-pollResult2.timestamp)

  var pollResultsCSVParser = new Parser({fields: responseMapKeyArray})
  var pollResultsCSV = pollResultsCSVParser.parse(formattedPollResults)

  var pollResultsCSVFilename = "poll-results-" + pollID + ".csv"
  var csvMessageAttachment = new MessageAttachment(Buffer.from(pollResultsCSV, 'utf-8'), pollResultsCSVFilename)
  dmChannel.send({
    files: [csvMessageAttachment]
  })
}

export const getCurrentPollQuestionIDFromMessageID = function(messageID: string, userID: string = null)
{
  var currentQuestionID: string
  var currentPollID = Object.keys(pollsMessageIDs).find((pollID) => {
    if (userID && pollsMessageIDs[pollID][userID])
    {
      let questionID = Object.keys(pollsMessageIDs[pollID][userID]).find((questionID) => pollsMessageIDs[pollID][userID][questionID] == messageID)
      if (questionID)
      {
        currentQuestionID = questionID
        return true
      }
    }
    else
    {
      let questionID = Object.keys(pollsMessageIDs[pollID]).find((questionID) => pollsMessageIDs[pollID][questionID] == messageID)
      if (questionID)
      {
        currentQuestionID = questionID
        return true
      }
    }
    return false
  })

  return { currentQuestionID: currentQuestionID, currentPollID: currentPollID }
}

export const getCurrentOptionDataFromReaction = function(reaction: MessageReaction, user: User)
{
  var emoteName = getEmoteName(reaction.emoji)

  var { currentPollID, currentQuestionID } = getCurrentPollQuestionIDFromMessageID(reaction.message.id, user.id)
  var currentQuestionData = pollsData[currentPollID].questions.find(questionData => questionData.id == currentQuestionID)
  var currentOptionData = currentQuestionData.options.find(optionData => optionData.emote == emoteName)

  return { currentPollID: currentPollID, currentQuestionID: currentQuestionID, currentOptionData: currentOptionData }
}

export const getEmoji = function(client: Client, emoteName: string)
{
  var emoji = client.emojis.cache.find(emoji => emoji.name == emoteName)
  if (emoji != null)
  {
    return emoji.id
  }

  var emote = emojiConverter.get(":" + emoteName + ":")
  if (emote != null && !emote.includes(":"))
  {
    return emote
  }

  return null
}

export const getEmoteName = function(emoji: GuildEmoji | ReactionEmoji)
{
  return emojiConverter.unemojify(emoji.name).replace(/:/g, '')
}
