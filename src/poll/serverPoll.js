import {
  pollsCollectionID, pollResponsesCollectionID,
  pollsData,
  pollResponses, pollResponseReactionCollectors,
  pollsMessageIDs,
  catchAllFilter, checkVoteRequirements, getCurrentPollQuestionIDFromMessageID, getCurrentOptionDataFromReaction, getEmoji
} from "./sharedPoll.js"

export const interpretServerPollSetting = async function(client, pollID, pollDataJSON, firestoreDB)
{
  pollsData[pollID] = pollDataJSON

  if (pollDataJSON.channelID != null)
  {
    var uploadPollResponse = async (pollID, userID, questionIDToOptionIDMap) => {
      await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + userID).set({responseMap: questionIDToOptionIDMap, updatedAt: Date.now()})
    }

    if (pollDataJSON.messageIDs == null)
    {
      pollDataJSON.messageIDs = await sendServerVoteMessage(client, pollDataJSON)
    }
    else
    {
      for (let questionData of pollDataJSON.questions)
      {
        if (pollResponseReactionCollectors[pollID] && pollResponseReactionCollectors[pollID][questionData.id]) { continue }
        await setupPollQuestionReactionCollector(client, pollID, pollDataJSON.messageIDs[questionData.id], uploadPollResponse)
      }
    }

    pollsMessageIDs[pollID] = pollDataJSON.messageIDs
  }

  return pollDataJSON
}

async function sendServerVoteMessage(client, pollData, uploadPollResponse)
{
  var pollChannel = await client.channels.fetch(pollData.channelID)
  if (!pollChannel) { return }

  var pollMessageIDs = {}

  var titleMessage = await pollChannel.send("__**" + pollData.name + "**__")
  pollMessageIDs["title"] = titleMessage.id

  for (let questionData of pollData.questions)
  {
    let questionString = "**" + questionData.prompt + "**"
    for (let optionData of questionData.options)
    {
      questionString += "\n" + ":" + optionData.emote + ": \\: " + optionData.name
    }

    let questionMessage = await pollChannel.send(questionString)
    pollMessageIDs[questionData.id] = questionMessage.id

    await setupPollQuestionReactionCollector(client, pollData.id, questionMessage.id, uploadPollResponse)

    for (let optionData of questionData.options)
    {
      let emoji = getEmoji(client, optionData.emote)
      if (emoji == null) { continue }
      await questionMessage.react(emoji)
    }
  }

  return pollMessageIDs
}

async function setupPollQuestionReactionCollector(client, pollID, messageID, uploadPollResponse)
{
  var pollData = pollsData[pollID]

  var pollChannel = await client.channels.fetch(pollData.channelID)
  if (!pollChannel) { return }

  var questionMessage = await pollChannel.messages.fetch(messageID)
  if (!questionMessage) { return }

  var questionReactionCollector = questionMessage.createReactionCollector({ catchAllFilter, dispose: true })
  questionReactionCollector.on('collect', async (reaction, user) => {
    if (user.id == client.user.id) { return }

    await user.fetch()

    let { currentPollID, currentQuestionID, currentOptionData } = getCurrentOptionDataFromReaction(reaction, user)
    if (!currentOptionData)
    {
      await reaction.users.remove(user.id)
      return
    }

    let guildMember = await pollChannel.guild.members.fetch(user.id)
    if (!checkVoteRequirements(pollData, pollChannel.guildId, guildMember))
    {
      await reaction.users.remove(user.id)
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

    await uploadPollResponse(currentPollID, user.id, pollResponses[currentPollID][user.id])

    await reaction.message.fetch()

    reaction.message.reactions.cache.forEach(async (otherReaction) => {
      if (otherReaction.emoji.name == reaction.emoji.name) { return }

      await otherReaction.users.fetch()
      if (otherReaction.users.cache.has(user.id))
      {
        otherReaction.users.remove(user.id)
      }
    })
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

    await uploadPollResponse(currentPollID, user.id, pollResponses[currentPollID][user.id])
  })

  var { currentQuestionID } = getCurrentPollQuestionIDFromMessageID(messageID)

  if (!(pollID in pollResponseReactionCollectors))
  {
    pollResponseReactionCollectors[pollID] = {}
  }

  pollResponseReactionCollectors[pollID][currentQuestionID] = questionReactionCollector
}
