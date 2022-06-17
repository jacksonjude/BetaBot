import { Client, User, TextChannel, Message, MessageReaction } from "discord.js"
import { ActionMessage, MessageReactionEventType } from "../actionMessage"
import { Firestore, Timestamp } from "firebase-admin/firestore"

import {
  PollConfiguration, PollResponseMap, PollQuestion,
  pollsCollectionID, pollResponsesCollectionID,
  pollsData,
  pollResponses,
  pollsActionMessages,
  checkVoteRequirements
} from "./sharedPoll"
import { Emote } from "../util"

import { BotCommand } from "../botCommand"

import ShortUniqueID from "short-unique-id"
const uid = new ShortUniqueID({ length: 10 })

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

  if (!pollData.messageIDs)
  {
    pollData.messageIDs = {}
  }

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
        if (questionData.showOptionNames)
        {
          for (let optionData of questionData.options)
          {
            questionString += "\n" + ":" + optionData.emote + ": \\: " + optionData.name
          }
        }
        return questionString
      }, async (message: Message, questionData: PollQuestion) => {
        pollData.messageIDs[questionData.id] = message.id
        for (let optionData of questionData.options)
        {
          let emoji = new Emote(optionData.emote).toEmoji(client)
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
    let emoteName = Emote.fromEmoji(reaction.emoji).toString()
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

export function getCreateServerPollCommand(): BotCommand
{
  // TODO: Find a way of representing default emotes
  return BotCommand.fromRegex(
    "serverpoll", "create a new server poll",
    /^serverpoll\s+([\w\s]+)(?:\s+(?:<#)?(\d+)(?:>)?)?(?:\s+<@!?&?(\d+)>)?(?:\s+(\d+(?:\.\d*)?))?((?:\s*<?a?:\w+:\d*>?)+)\s*(.+)$/, /^serverpoll(\s+.*)?$/,
    "serverpoll <name> [channel] [role] [duration] <emotes...> <message...>",
    async (commandArguments: string[], message: Message, _, firestoreDB: Firestore) => {
      let pollName = commandArguments[1].replace(/^\s*/, "").replace(/\s*$/, "")
      let channelID = commandArguments[2] ?? message.channelId
      let roleID = commandArguments[3] ?? message.guild.roles.everyone.id
      let duration = commandArguments[4] ? parseFloat(commandArguments[4]) : 24.0

      let emotesString = commandArguments[5]
      let pollMessage = commandArguments[6]

      let emotes = Emote.fromStringList(emotesString)

      let pollID = pollName + "-" + uid()

      let pollConfig = {
        id: pollID,
        name: pollName,
        pollType: "server" as "server",
        openTime: Timestamp.fromMillis(Date.now()),
        closeTime: Timestamp.fromMillis(Date.now()+duration*1000*60*60),
        questions: [
          {
            id: uid(),
            prompt: pollMessage,
            showOptionNames: false,
            options: emotes.map(emote => {
              return {
                id: uid(),
                emote: emote.toString()
              }
            })
          }
        ],
        channelID: channelID,
        roleID: roleID
      }

      firestoreDB.doc(pollsCollectionID + "/" + pollID).set(pollConfig)
    }
  )
}
