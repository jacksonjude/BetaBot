import { Client, User, TextChannel, Message, MessageReaction } from "discord.js"
import { ActionMessage, MessageReactionEventType } from "../actionMessage"
import { Firestore, Timestamp } from "firebase-admin/firestore"

import {
  PollConfiguration, PollResponseMap, PollQuestion,
  pollsCollectionID, pollResponsesCollectionID,
  pollsData,
  pollResponses,
  pollsActionMessages,
  checkVoteRequirements, getAnnouncementMessageText, updateMessageOnClose
} from "./sharedPoll"
import { Emote } from "../util"

import { BotCommand, BotCommandError, BotCommandRequirement } from "../botCommand"

import ShortUniqueID from "short-unique-id"
const uid = new ShortUniqueID({ length: 10 })

export async function interpretServerPollSetting(client: Client, pollID: string, pollDataJSON: PollConfiguration, firestoreDB: Firestore)
{
  pollsData[pollID] = pollDataJSON
  
  if (pollsActionMessages[pollID])
  {
    for (let pollActionMessage of Object.values(pollsActionMessages[pollID]) as ActionMessage<PollQuestion>[])
    {
      await pollActionMessage.removeActionMessage(false)
    }
  }

  if (pollDataJSON.channelID != null)
  {
    var uploadPollResponse = async (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => {
      await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + userID).set({responseMap: questionIDToOptionIDMap, updatedAt: Date.now()})
    }

    await sendServerVoteMessage(client, pollDataJSON, uploadPollResponse, firestoreDB)
    
    updateMessageOnClose(pollDataJSON, async (pollID) => {
      await sendServerVoteMessage(client, pollsData[pollID], uploadPollResponse, firestoreDB)
      if (pollsData[pollID].shouldDeleteOnClose)
      {
        await removeServerPollSetting(pollID, false)
        await firestoreDB.collection(pollsCollectionID).doc(pollID).delete()
      }
    })
  }

  return pollDataJSON
}

export async function removeServerPollSetting(pollID: string, deleteMessages: boolean = false)
{
  if (pollsActionMessages[pollID])
  {
    for (let pollActionMessage of Object.values(pollsActionMessages[pollID]) as ActionMessage<PollQuestion>[])
    {
      await pollActionMessage.removeActionMessage(deleteMessages)
    }
    delete pollsActionMessages[pollID]
  }

  if (pollsData[pollID])
  {
    delete pollsData[pollID]
  }
}

async function sendServerVoteMessage(client: Client, pollData: PollConfiguration, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>, firestoreDB: Firestore)
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
      return "__**" + pollData.name + "**__" + "\n" + await getAnnouncementMessageText(pollData, pollChannel, firestoreDB)
    }, async (message: Message) => {
      pollData.messageIDs["title"] = message.id
    },
    null
  )
  await titleActionMessage.initActionMessage()
  pollActionMessages["title"] = titleActionMessage
  
  let isClosed = Date.now() >= pollData.closeTime.toMillis()
  const noVoteID = "--no vote--"

  let pollResultsData: { [k: string]: { [k: string]: number } } = null
  if (isClosed)
  {
    let maximumVoterCount = pollData.maximumVoterCount
    
    let pollResultsCollection = await firestoreDB.collection(pollsCollectionID + "/" + pollData.id + "/" + pollResponsesCollectionID).get()
    pollResultsData = pollResultsCollection.docChanges().map(response => response.doc.data().responseMap).filter(r => r != null).reduce((totals, response) => {
      for (let questionID in response)
      {
        let optionID: string = response[questionID]
        
        if (!totals[questionID]) totals[questionID] = {}
        if (!totals[questionID][optionID]) totals[questionID][optionID] = 0
        totals[questionID][optionID] += 1
      }
      return totals
    }, {})
    
    if (maximumVoterCount != null)
    {
      for (let questionID in pollResultsData)
      {
        let didNotVoteCount = maximumVoterCount - Object.keys(pollResultsData[questionID]).reduce((total, optionID) => total + pollResultsData[questionID][optionID], 0)
        pollResultsData[questionID]
        pollResultsData[questionID][noVoteID] = didNotVoteCount
      }
    }
  }

  for (let questionData of pollData.questions)
  {
    let pollQuestionActionMessage = new ActionMessage<PollQuestion>(
      pollChannel,
      pollData.messageIDs[questionData.id],
      questionData,
      async (questionData: PollQuestion) => {
        let questionString = "**" + questionData.prompt + "**"
        if (isClosed)
        {
          for (let optionData of questionData.options)
          {
            questionString += "\n" + optionData.emote + " **" + (pollResultsData[questionData.id][optionData.id] ?? 0) + "**"
          }
          if (pollResultsData[questionData.id][noVoteID] != null) questionString += "\nNV **" + pollResultsData[questionData.id][noVoteID] + "**"
        }
        return questionString
      }, async (message: Message, questionData: PollQuestion) => {
        pollData.messageIDs[questionData.id] = message.id
        for (let optionData of questionData.options)
        {
          let emoji = await new Emote(optionData.emote).toEmoji(client)
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
      console.log("Invalid reqs")
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
  
  await (pollsActionMessages[currentPollID]["title"] as ActionMessage<PollQuestion>).sendMessage()
}

export function getCreateServerPollCommand(): BotCommand
{
  // TODO: Find a way of representing default emotes
  return BotCommand.fromRegex(
    "serverpoll", "create a new server poll",
    /^serverpoll\s+([\w\s\-’'".,;?!:@#$%^&*()\[\]\/]+)(?:\s+(?:<#)?(\d+)(?:>)?)?(?:\s+<@!?&?(\d+)>)?(?:\s+(\d+(?:\.\d*)?))?(?:\s+(true|false))?((?:\s*<?a?:\w+:\d*>?)+)\s*(.+)$/, /^serverpoll(\s+.*)?$/,
    "serverpoll <name> [channel] [role] [duration] [delete on close] <emotes...> <message...>",
    async (commandArguments: string[], message: Message, _, firestoreDB: Firestore) => {
      let pollName = commandArguments[1].replace(/^\s*/, "").replace(/\s*$/, "")
      let channelID = commandArguments[2] ?? message.channelId
      let roleID = commandArguments[3] ?? message.guild.roles.everyone.id
      let duration = commandArguments[4] ? parseFloat(commandArguments[4]) : 24.0
      let shouldDeleteOnClose = commandArguments[5] === "true" ? true : false

      let emotesString = commandArguments[6]
      let pollMessage = commandArguments[7]

      let emotes = Emote.fromStringList(emotesString)

      let pollID = pollName + "-" + uid()

      let pollConfig = {
        active: true,
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
        roleIDs: [roleID],
        creatorID: message.author.id,
        shouldDeleteOnClose: shouldDeleteOnClose
      } as PollConfiguration

      firestoreDB.doc(pollsCollectionID + "/" + pollID).set(pollConfig)
    }
  )
}

interface DeleteServerPollCommandArguments
{
  pollID: string
  shouldDeleteMessages: boolean
}

export function getDeleteServerPollCommand(): BotCommand<DeleteServerPollCommandArguments>
{
  return BotCommand.fromRegexWithValidation(
    "deletepoll", "delete a server poll using an ID or by replying",
    /^deletepoll(?:\s+(true|false))?(?:\s+(.+)\s*)?$/, /^deletepoll(\s+.*)?$/,
    "deletepoll [poll id]",
    async (commandArguments: string[], message: Message) => {
      const shouldDeleteMessages = commandArguments[1] === "true"
      
      let pollIDToDelete = commandArguments[2]
      const reference = message.reference
      
      if (!(pollIDToDelete || reference)) { return new BotCommandError("no poll provided", false) }
      
      if (!pollIDToDelete)
      {
        const messageChannel = await message.guild.channels.fetch(reference.channelId) as TextChannel
        if (!messageChannel) { return new BotCommandError("message not found", false) }
        
        const referencedMessage = await messageChannel.messages.fetch(reference.messageId)
        if (!referencedMessage) { return new BotCommandError("message not found", false) }
        
        messageSearch:
        for (let pollID in pollsActionMessages)
        {
          for (let message of Object.values(pollsActionMessages[pollID]))
          {
            if (message instanceof ActionMessage && message.messageID == referencedMessage.id)
            {
              pollIDToDelete = pollID
              break messageSearch
            }
          }
        }
        
        if (!pollIDToDelete) { return new BotCommandError("referenced message is not a poll", false) }
      }
      
      return {pollID: pollIDToDelete, shouldDeleteMessages: shouldDeleteMessages}
    },
    new BotCommandRequirement(async (commandArguments: DeleteServerPollCommandArguments, _user, _member, message: Message) => {
      return pollsData[commandArguments.pollID].creatorID == message.author.id
    }),
    async (commandArguments: DeleteServerPollCommandArguments, message, _client, firestoreDB: Firestore) => {
      const { pollID, shouldDeleteMessages } = commandArguments
      
      await removeServerPollSetting(pollID, shouldDeleteMessages)
      await firestoreDB.collection(pollsCollectionID).doc(pollID).delete()
      
      await message.delete()
    }
  )
}