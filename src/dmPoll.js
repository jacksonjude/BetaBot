const voteMessageEmoji = "🗳"
const submitResponseEmote = "white_check_mark"

const pollsCollectionID = "pollConfigurations"
const pollResponsesCollectionID = "responses"

const ExportAccessType = {
  user: "user",
  role: "role"
}

var pollsData = {}
var pollResponses = {}
var pollResponseReactionCollectors = {}
var pollsMessageIDs = {}
var pollVoteMessageReactionCollectors = {}

const catchAllFilter = () => true

import emojiConverter from 'node-emoji'

export const interpretDMPollSetting = async function(client, pollID, pollDataJSON, firestoreDB)
{
  pollsData[pollID] = pollDataJSON

  if (pollDataJSON.voteMessageSettings != null && pollDataJSON.voteMessageSettings.channelID != null)
  {
    if (pollDataJSON.voteMessageSettings.messageID == null)
    {
      await sendVoteMessage(client, pollDataJSON.voteMessageSettings)
    }
    else
    {
      await editVoteMessage(client, pollDataJSON.voteMessageSettings)
    }

    if (pollDataJSON.voteMessageSettings.messageID != null)
    {
      var channel = await client.channels.fetch(pollDataJSON.voteMessageSettings.channelID)
      var voteMessage = await channel.messages.fetch(pollDataJSON.voteMessageSettings.messageID)

      var voteReactionCollector = voteMessage.createReactionCollector({ catchAllFilter })
      voteReactionCollector.on('collect', async (reaction, user) => {
        if (user.id == client.user.id) { return }
        if (reaction.emoji.name != voteMessageEmoji)
        {
          reaction.users.remove(user.id)
          return
        }

        await user.fetch()
        if (!checkVoteRequirements(pollDataJSON, channel.guildId, channel.members.get(user.id)))
        {
          reaction.users.remove(user.id)
          return
        }
        executeDMVoteCommand(client, user, pollID, firestoreDB)
      })

      pollVoteMessageReactionCollectors[pollDataJSON.id] = voteReactionCollector
    }
  }

  return pollDataJSON
}

async function sendVoteMessage(client, voteMessageSettings)
{
  var channel = await client.channels.fetch(voteMessageSettings.channelID)
  var messageContent = voteMessageSettings.messageText
  var sentMessage = await channel.send(messageContent)
  voteMessageSettings.messageID = sentMessage.id

  sentMessage.react(voteMessageEmoji)
}

async function editVoteMessage(client, voteMessageSettings)
{
  var channel = await client.channels.fetch(voteMessageSettings.channelID)
  try
  {
    var message = await channel.messages.fetch(voteMessageSettings.messageID)
    var messageContent = voteMessageSettings.messageText

    if (message.content != messageContent)
    {
      await message.edit(messageContent)
      message.react(voteMessageEmoji)
    }
  }
  catch
  {
    await sendVoteMessage(client, voteMessageSettings)
  }
}

export const cleanDMPollResponseMessages = async function(client, userID, pollResponseData)
{
  if (!("messageIDs" in pollResponseData)) { return }

  var user = await client.users.fetch(userID)
  if (!user) { return }

  var dmChannel = user.dmChannel || await user.createDM()
  if (!dmChannel) { return }

  for (let messageID of Object.values(pollResponseData.messageIDs))
  {
    try
    {
      await user.dmChannel.messages.delete(messageID)
    }
    catch {}
  }
}

export const sendDMVoteCommand = async function(msg, messageContent)
{
  if (/^vote\s(.+)$/.test(messageContent.toLowerCase()))
  {
    await msg.member.fetch()

    var pollID = /^vote\s(.+)$/.exec(messageContent)[1]

    if (!(pollID in pollsData))
    {
      msg.channel.send("Invalid poll name: " + pollID)
      return false
    }

    var pollData = pollsData[pollID]

    if (!checkVoteRequirements(pollData, msg.channel.guildId, msg.member, msg)) { return }

    return pollID
  }

  return false
}

function checkVoteRequirements(pollData, serverID, member, msg)
{
  var isWithinPollTimeRange = Date.now() >= pollData.openTime.toMillis() && Date.now() <= pollData.closeTime.toMillis()
  var inRequiredServer = pollData.serverID ? serverID == pollData.serverID : true
  var hasRequiredRoles = pollData.roleName ? member.roles.cache.find(role => role.name == pollData.roleName) : true

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
    msg && msg.channel.send("Cannot vote on " + pollData.name + " without the " + pollData.roleName + " role")
    return false
  }

  return true
}

export const executeDMVoteCommand = async function(client, user, pollID, firestoreDB)
{
  console.log("Init vote " + pollID + " for " + user.id)

  var uploadPollResponse = async (pollID, userID, questionIDToOptionIDMap) => {
    await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + userID).set({responseMap: questionIDToOptionIDMap, updatedAt: Date.now()})
  }

  let pollResponsePath = pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + user.id
  let pollResponseDoc = await firestoreDB.doc(pollResponsePath).get()
  let previousPollResponseMessageIDs
  if (pollResponseDoc != null && pollResponseDoc.data() != null && pollResponseDoc.data().messageIDs != null)
  {
    previousPollResponseMessageIDs = pollResponseDoc.data().messageIDs
  }

  try
  {
    let newPollResponseMessageIDs = await sendVoteDM(client, user, pollID, uploadPollResponse, previousPollResponseMessageIDs)
    await firestoreDB.doc(pollResponsePath).set({messageIDs: newPollResponseMessageIDs})
  }
  catch (error)
  {
    console.log("Vote DM Error: " + error)
  }
}

async function sendVoteDM(client, user, pollID, uploadPollResponse, previousPollResponseMessageIDs)
{
  var dmChannel = user.dmChannel || await user.createDM()

  var pollData = pollsData[pollID]
  var pollMessageIDs = {}

  var titleMessage = await dmChannel.send("__**" + pollData.name + "**__")
  pollMessageIDs["title"] = titleMessage.id

  for (let questionData of pollData.questions)
  {
    let questionString = "**" + questionData.prompt + "**"
    for (let optionData of questionData.options)
    {
      questionString += "\n" + ":" + optionData.emote + ": \\: " + optionData.name
    }

    let questionMessage = await dmChannel.send(questionString)
    pollMessageIDs[questionData.id] = questionMessage.id

    await setupPollQuestionReactionCollector(client, pollID, user, questionMessage.id)

    for (let optionData of questionData.options)
    {
      let emoteID = getEmoteID(client, optionData.emote)
      if (emoteID == null) { continue }
      await questionMessage.react(emoteID)
    }
  }

  var submitMessage = await dmChannel.send("**" + ":arrow_down: Submit below :arrow_down:" + "**")
  pollMessageIDs["submit"] = submitMessage.id

  await setupPollSubmitReactionCollector(client, pollID, user, submitMessage.id, uploadPollResponse)

  var submitEmoteID = getEmoteID(client, submitResponseEmote)
  await submitMessage.react(submitEmoteID)

  if (previousPollResponseMessageIDs)
  {
    for (let previousPollResponseMessageID of Object.values(previousPollResponseMessageIDs))
    {
      try
      {
        await user.dmChannel.messages.delete(previousPollResponseMessageID)
      }
      catch {}
    }
  }

  if (!(pollID in pollsMessageIDs))
  {
    pollsMessageIDs[pollID] = {}
  }
  pollsMessageIDs[pollID][user.id] = pollMessageIDs

  return pollMessageIDs
}

async function setupPollQuestionReactionCollector(client, pollID, user, messageID)
{
  var dmChannel = user.dmChannel || await user.createDM()
  if (!dmChannel) { return }

  var questionMessage = await dmChannel.messages.fetch(messageID)
  if (!questionMessage) { return }

  var questionReactionCollector = questionMessage.createReactionCollector({ catchAllFilter, dispose: true })
  questionReactionCollector.on('collect', async (reaction, user) => {
    if (user.id == client.user.id) { return }
    await user.fetch()

    let { currentPollID, currentQuestionID, currentOptionData } = getCurrentOptionDataFromReaction(reaction, user)
    if (!currentOptionData)
    {
      // await reaction.users.remove(user.id)
      return
    }

    let currentOptionID = currentOptionData.id

    if (!(currentPollID in pollResponses))
    {
      pollResponses[currentPollID] = {}
    }
    if (!(user.id in pollResponses[currentPollID]))
    {
      pollResponses[currentPollID][user.id] = {}
    }
    pollResponses[currentPollID][user.id][currentQuestionID] = currentOptionID

    // await reaction.message.reactions.fetch()
    //
    // for (let otherReaction in reaction.message.reactions)
    // {
    //   if (otherReaction.emoji.name == reaction.emoji.name) { return }
    //
    //   await otherReaction.users.fetch()
    //   if (otherReaction.users.cache.has(user.id))
    //   {
    //     otherReaction.users.remove(user.id)
    //   }
    // }
  })
  questionReactionCollector.on('remove', async (reaction, user) => {
    if (user.id == client.user.id) { return }
    await user.fetch()

    let { currentPollID, currentQuestionID, currentOptionData } = getCurrentOptionDataFromReaction(reaction, user)
    if (!currentOptionData) { return }

    let currentOptionID = currentOptionData.id

    if (!(currentPollID in pollResponses))
    {
      pollResponses[currentPollID] = {}
    }
    if (!(user.id in pollResponses[currentPollID]))
    {
      pollResponses[currentPollID][user.id] = {}
    }
    if (pollResponses[currentPollID][user.id][currentQuestionID] == currentOptionID)
    {
      delete pollResponses[currentPollID][user.id][currentQuestionID]
    }
  })

  if (!(pollID in pollResponseReactionCollectors))
  {
    pollResponseReactionCollectors[pollID] = {}
  }
  if (!(user.id in pollResponseReactionCollectors[pollID]))
  {
    pollResponseReactionCollectors[pollID][user.id] = []
  }

  pollResponseReactionCollectors[pollID][user.id].push(questionReactionCollector)
}

async function setupPollSubmitReactionCollector(client, pollID, user, messageID, uploadPollResponse)
{
  var dmChannel = user.dmChannel || await user.createDM()
  if (!dmChannel) { return }

  var submitMessage = await dmChannel.messages.fetch(messageID)
  if (!submitMessage) { return }

  var submitReactionCollector = submitMessage.createReactionCollector({ catchAllFilter })
  submitReactionCollector.on('collect', async (reaction, user) => {
    if (user.id == client.user.id) { return }
    if (emojiConverter.unemojify(reaction.emoji.name).replace(/:/g, '') != submitResponseEmote) { return }

    await user.fetch()

    let { currentPollID } = getCurrentPollQuestionIDFromMessageID(reaction.message.id, user.id)
    if (pollResponses[currentPollID] == null || pollResponses[currentPollID][user.id] == null) { return }

    await uploadPollResponse(currentPollID, user.id, pollResponses[currentPollID][user.id])

    for (let reactionCollector of pollResponseReactionCollectors[currentPollID][user.id])
    {
      reactionCollector.stop()
    }
    delete pollResponseReactionCollectors[currentPollID][user.id]

    if (!(currentPollID in pollsMessageIDs && user.id in pollsMessageIDs[currentPollID])) { return }

    for (let questionKey of Object.keys(pollsMessageIDs[currentPollID][user.id]))
    {
      if (questionKey == "submit")
      {
        let message = await user.dmChannel.messages.fetch(pollsMessageIDs[currentPollID][user.id][questionKey])
        await message.edit(":" + submitResponseEmote + ": Submitted " + pollsData[pollID].name)
      }
      else
      {
        await user.dmChannel.messages.delete(pollsMessageIDs[currentPollID][user.id][questionKey])
      }
    }
  })

  pollResponseReactionCollectors[pollID][user.id].push(submitReactionCollector)
}

function getCurrentPollQuestionIDFromMessageID(messageID, userID)
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

function getCurrentOptionDataFromReaction(reaction, user)
{
  var emoteName = emojiConverter.unemojify(reaction.emoji.name).replace(/:/g, '')

  var { currentPollID, currentQuestionID } = getCurrentPollQuestionIDFromMessageID(reaction.message.id, user.id)
  var currentQuestionData = pollsData[currentPollID].questions.find(questionData => questionData.id == currentQuestionID)
  var currentOptionData = currentQuestionData.options.find(optionData => optionData.emote == emoteName)

  return { currentPollID: currentPollID, currentQuestionID: currentQuestionID, currentOptionData: currentOptionData }
}

function getEmoteID(client, emoteName)
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
