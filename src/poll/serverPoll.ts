import { Client, TextChannel } from "discord.js"
import { Firestore } from "firebase-admin/firestore"

import {
  PollConfiguration, PollResponseMap,
  pollsCollectionID, pollResponsesCollectionID,
  pollsData,
  pollResponses, pollResponseReactionCollectors,
  pollsMessageIDs,
  catchAllFilter, checkVoteRequirements, getCurrentPollQuestionIDFromMessageID, getCurrentOptionDataFromReaction, getEmoji
} from "./sharedPoll"

export async function interpretServerPollSetting(client: Client, pollID: string, pollDataJSON: PollConfiguration, firestoreDB: Firestore)
{
  pollsData[pollID] = pollDataJSON

  if (pollDataJSON.channelID != null)
  {
    var uploadPollResponse = async (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => {
      await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + userID).set({responseMap: questionIDToOptionIDMap, updatedAt: Date.now()})
    }

    if (pollDataJSON.messageIDs == null)
    {
      pollDataJSON.messageIDs = await sendServerVoteMessage(client, pollDataJSON, uploadPollResponse)
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

export async function removeServerPollSetting(client: Client, pollID: string, pollDataJSON: PollConfiguration)
{
  if (pollDataJSON.channelID != null && pollDataJSON.messageIDs != null)
  {
    var channel = await client.channels.fetch(pollDataJSON.channelID) as TextChannel
    for (let messageID of Object.values(pollDataJSON.messageIDs))
    {
      var message = await channel.messages.fetch(messageID)
      await message.delete()
    }
  }

  if (pollsMessageIDs[pollID])
  {
    delete pollsMessageIDs[pollID]
  }

  if (pollResponseReactionCollectors[pollID])
  {
    for (let responseReactionCollector of Object.values(pollResponseReactionCollectors[pollID]))
    {
      responseReactionCollector.stop()
    }
    delete pollResponseReactionCollectors[pollID]
  }

  if (pollsData[pollID])
  {
    delete pollsData[pollID]
  }
}

async function sendServerVoteMessage(client: Client, pollData: PollConfiguration, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>)
{
  var pollChannel = await client.channels.fetch(pollData.channelID) as TextChannel
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

async function setupPollQuestionReactionCollector(client: Client, pollID: string, messageID: string, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>)
{
  var pollData = pollsData[pollID]

  var pollChannel = await client.channels.fetch(pollData.channelID) as TextChannel
  if (!pollChannel) { return }

  var questionMessage = await pollChannel.messages.fetch(messageID)
  if (!questionMessage) { return }

  var questionReactionCollector = questionMessage.createReactionCollector({ filter: catchAllFilter, dispose: true })
  questionReactionCollector.on('collect', async (reaction, user) => {
    if (user.id == client.user.id) { return }

    await user.fetch()

    let { currentPollID, currentQuestionID, currentOptionData } = getCurrentOptionDataFromReaction(reaction, user)
    if (!currentOptionData)
    {
      try
      {
        await reaction.users.remove(user.id)
      }
      catch {}
      return
    }

    let guildMember = await pollChannel.guild.members.fetch(user.id)
    if (!checkVoteRequirements(pollData, pollChannel.guildId, guildMember))
    {
      try
      {
        await reaction.users.remove(user.id)
      }
      catch {}
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
        try
        {
          await otherReaction.users.remove(user.id)
        }
        catch {}
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
