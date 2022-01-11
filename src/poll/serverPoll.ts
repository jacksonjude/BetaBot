import { Client, User, TextChannel, Message, MessageReaction } from "discord.js"
import { ActionMessage, MessageReactionEventType } from "../actionMessage"
import { Firestore } from "firebase-admin/firestore"

import {
  PollConfiguration, PollResponseMap, PollQuestion,
  pollsCollectionID, pollResponsesCollectionID,
  pollsData,
  pollResponses,
  pollsActionMessages,
  checkVoteRequirements, getEmoji, getEmoteName
} from "./sharedPoll"

export async function interpretServerPollSetting(client: Client, pollID: string, pollDataJSON: PollConfiguration, firestoreDB: Firestore)
{
  pollsData[pollID] = pollDataJSON

  if (pollDataJSON.channelID != null && !pollsActionMessages[pollID])
  {
    var uploadPollResponse = async (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => {
      await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + userID).set({responseMap: questionIDToOptionIDMap, updatedAt: Date.now()})
    }

    await sendServerVoteMessage(client, pollDataJSON, uploadPollResponse)
  }

  return pollDataJSON
}

export async function removeServerPollSetting(pollID: string)
{
  if (pollsActionMessages[pollID])
  {
    for (let pollActionMessage of Object.values(pollsActionMessages[pollID]) as ActionMessage<PollQuestion>[])
    {
      pollActionMessage.removeActionMessage()
    }
    delete pollsActionMessages[pollID]
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

  var pollActionMessages = {}

  let titleActionMessage = new ActionMessage(pollChannel, pollData.messageIDs["title"], null,
    async () => {
      return "__**" + pollData.name + "**__"
    }, async (message: Message) => {
      pollData.messageIDs["title"] = message.id
    },
    null
  )
  await titleActionMessage.initActionMessage()
  pollActionMessages["title"] = titleActionMessage

  for (let questionData of pollData.questions)
  {
    let pollQuestionActionMessage = new ActionMessage<PollQuestion>(
      pollChannel,
      pollData.messageIDs[questionData.id],
      questionData,
      async (questionData: PollQuestion) => {
        let questionString = "**" + questionData.prompt + "**"
        for (let optionData of questionData.options)
        {
          questionString += "\n" + ":" + optionData.emote + ": \\: " + optionData.name
        }
        return questionString
      }, async (message: Message, questionData: PollQuestion) => {
        pollData.messageIDs[questionData.id] = message.id
        for (let optionData of questionData.options)
        {
          let emoji = getEmoji(client, optionData.emote)
          if (emoji == null) { continue }
          await message.react(emoji)
        }
      }, (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion) => {
        handlePollMessageReaction(client, reaction, user, reactionEventType, questionData, pollData.id, uploadPollResponse)
      }
    )
    await pollQuestionActionMessage.initActionMessage()
    pollActionMessages[questionData.id] = pollQuestionActionMessage
  }

  pollsActionMessages[pollData.id] = pollActionMessages
}

async function handlePollMessageReaction(client: Client, reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion, currentPollID: string, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>)
{
  if (user.id == client.user.id) { return }

  let currentOptionData = questionData.options.find(optionData => {
    let emoteName = getEmoteName(reaction.emoji)
    return optionData.emote == emoteName
  })
  if (!currentOptionData)
  {
    if (reactionEventType != "added") { return }
    try
    {
      await reaction.users.remove(user.id)
    }
    catch {}
    return
  }

  let guildMember = await reaction.message.guild.members.fetch(user.id)
  if (!checkVoteRequirements(pollsData[currentPollID], reaction.message.guildId, guildMember))
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

  switch (reactionEventType)
  {
    case "added":
    pollResponses[currentPollID][user.id][questionData.id] = currentOptionID
    break

    case "removed":
    if (pollResponses[currentPollID][user.id][questionData.id] == currentOptionID)
    {
      delete pollResponses[currentPollID][user.id][questionData.id]
    }
    break
  }

  await uploadPollResponse(currentPollID, user.id, pollResponses[currentPollID][user.id])

  if (reactionEventType == "added")
  {
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
  }
}
