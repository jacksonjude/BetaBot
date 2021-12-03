import {
  pollsCollectionID, pollResponsesCollectionID,
  pollsData,
  pollResponses, pollResponseReactionCollectors,
  pollsMessageIDs, pollVoteMessageReactionCollectors,
  voteMessageEmoji, submitResponseEmote,
  catchAllFilter, checkVoteRequirements, getCurrentPollQuestionIDFromMessageID, getCurrentOptionDataFromReaction, getEmoji, getEmoteName
} from "./sharedPoll.js"

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
  if (!pollResponseData.messageIDs) { return }

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
      let emoji = getEmoji(client, optionData.emote)
      if (emoji == null) { continue }
      await questionMessage.react(emoji)
    }
  }

  var submitMessage = await dmChannel.send("**" + ":arrow_down: Submit below :arrow_down:" + "**")
  pollMessageIDs["submit"] = submitMessage.id

  await setupPollSubmitReactionCollector(client, pollID, user, submitMessage.id, uploadPollResponse)

  var submitEmoji = getEmoji(client, submitResponseEmote)
  await submitMessage.react(submitEmoji)

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
    pollResponses[currentPollID][user.id][currentQuestionID] = currentOptionID
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
    if (getEmoteName(reaction.emoji) != submitResponseEmote) { return }

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
