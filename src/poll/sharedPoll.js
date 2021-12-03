export const pollsCollectionID = "pollConfigurations"
export const pollResponsesCollectionID = "responses"

export const voteMessageEmoji = "🗳"
export const submitResponseEmote = "white_check_mark"

const ExportAccessType = {
  user: "user",
  role: "role"
}

export var pollsData = {}

export var pollResponses = {}
export var pollResponseReactionCollectors = {}

export var pollsMessageIDs = {}
export var pollVoteMessageReactionCollectors = {}

export const catchAllFilter = () => true

import emojiConverter from 'node-emoji'

export const sendExportPollResultsCommand = async function(msg, messageContent)
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

function checkExportPollResultsRequirements(pollData, member, msg)
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
  if ((userAccessData || roleAccessData).accessTime && Date.now() < (userAccessData || roleAccessData).accessTime)
  {
    msg && msg.channel.send("You do not have access to the results of " + pollData.name + " until " + (new Date((userAccessData || roleAccessData).accessTime)).toString())
    return false
  }

  return true
}

import { Parser } from "json2csv"
import { MessageAttachment } from "discord.js"

export const executeExportPollResultsCommand = async function(user, pollID, firestoreDB)
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
  responseMapKeys = Array.from(responseMapKeys)

  formattedPollResults.sort((pollResult1, pollResult2) => pollResult1.timestamp-pollResult2.timestamp)

  var pollResultsCSVParser = new Parser({fields: responseMapKeys})
  var pollResultsCSV = pollResultsCSVParser.parse(formattedPollResults)

  var pollResultsCSVFilename = "poll-results-" + pollID + ".csv"
  var csvMessageAttachment = new MessageAttachment(Buffer.from(pollResultsCSV, 'utf-8'), pollResultsCSVFilename)
  dmChannel.send({
    files: [csvMessageAttachment]
  })
}

export const getCurrentPollQuestionIDFromMessageID = function(messageID, userID)
{
  var currentQuestionID
  var currentPollID = Object.keys(pollsMessageIDs).find((pollID) => {
    if (pollsMessageIDs[pollID][userID])
    {
      let questionID = Object.keys(pollsMessageIDs[pollID][userID]).find((questionID) => pollsMessageIDs[pollID][userID][questionID] == messageID)
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

export const getCurrentOptionDataFromReaction = function(reaction, user)
{
  var emoteName = getEmoteName(reaction.emoji)

  var { currentPollID, currentQuestionID } = getCurrentPollQuestionIDFromMessageID(reaction.message.id, user.id)
  var currentQuestionData = pollsData[currentPollID].questions.find(questionData => questionData.id == currentQuestionID)
  var currentOptionData = currentQuestionData.options.find(optionData => optionData.emote == emoteName)

  return { currentPollID: currentPollID, currentQuestionID: currentQuestionID, currentOptionData: currentOptionData }
}

export const getEmoji = function(client, emoteName)
{
  var emote = client.emojis.cache.find(emoji => emoji.name == emoteName)
  if (emote != null)
  {
    return emote.id
  }

  emote = emojiConverter.get(":" + emoteName + ":")
  if (emote != null && !emote.includes(":"))
  {
    return emote
  }

  return null
}

export const getEmoteName = function(emoji)
{
  return emojiConverter.unemojify(emoji.name).replace(/:/g, '')
}
