import { Client, User, TextChannel, Message, GuildMember, MessageReaction } from "discord.js"
import { ActionMessage, MessageReactionEventType } from "../actionMessage"
import { Firestore } from "firebase-admin/firestore"
import { BotCommand, BotCommandError } from "../botCommand"

import {
  PollConfiguration, PollQuestion, PollResponseMap, PollResponse,
  pollsCollectionID, pollResponsesCollectionID,
  pollsData,
  pollResponses,
  pollsActionMessages, pollVoteActionMessages,
  voteMessageEmoji, submitResponseEmote,
  checkVoteRequirements, getEmoji, getEmoteName
} from "./sharedPoll"

export async function interpretDMPollSetting(client: Client, pollID: string, pollDataJSON: PollConfiguration, firestoreDB: Firestore)
{
  pollsData[pollID] = pollDataJSON

  if (pollDataJSON.voteMessageSettings != null && pollDataJSON.voteMessageSettings.channelID != null)
  {
    let liveChannel = await client.channels.fetch(pollDataJSON.voteMessageSettings.channelID) as TextChannel
    let pollVoteActionMessage = new ActionMessage<PollConfiguration>(
      liveChannel,
      pollDataJSON.voteMessageSettings.messageID,
      pollDataJSON,
      async (pollData: PollConfiguration) => {
        return pollData.voteMessageSettings.messageText
      }, async (message: Message, pollData: PollConfiguration) => {
        pollData.voteMessageSettings.messageID = message.id
        message.react(voteMessageEmoji)
      }, (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, pollData: PollConfiguration) => {
        if (reactionEventType !== "added") { return }
        handlePollVoteMessageReaction(client, reaction, user, pollData, firestoreDB)
      }
    )
    await pollVoteActionMessage.initActionMessage()

    pollVoteActionMessages[pollID] = pollVoteActionMessage
  }

  return pollDataJSON
}

export async function removeDMPollSetting(pollID: string)
{
  if (pollVoteActionMessages[pollID])
  {
    pollVoteActionMessages[pollID].removeActionMessage()
    delete pollVoteActionMessages[pollID]
  }

  if (pollsActionMessages[pollID])
  {
    for (let pollActionMessageSet of Object.values(pollsActionMessages[pollID]))
    {
      for (let pollActionMessage of Object.values(pollActionMessageSet) as ActionMessage<PollQuestion>[])
      {
        pollActionMessage.removeActionMessage()
      }
    }
    delete pollsActionMessages[pollID]
  }

  if (pollsData[pollID])
  {
    delete pollsData[pollID]
  }
}

async function handlePollVoteMessageReaction(client: Client, reaction: MessageReaction, user: User, pollData: PollConfiguration, firestoreDB: Firestore)
{
  if (user.id == client.user.id) { return }
  if (reaction.emoji.name != voteMessageEmoji)
  {
    try
    {
      await reaction.users.remove(user.id)
    }
    catch {}
    return
  }

  let member: GuildMember
  try
  {
    member = await reaction.message.guild.members.fetch(user.id)
  }
  catch { return }

  if (!checkVoteRequirements(pollData, reaction.message.guildId, member))
  {
    try
    {
      await reaction.users.remove(user.id)
    }
    catch {}
    return
  }

  executeDMVoteCommand(client, user, member, pollData.id, firestoreDB)
}

export async function cleanDMPollResponseMessages(client: Client, userID: string, pollResponseData: PollResponse)
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

export function getDMVoteCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "vote", "vote in private DM polls",
    /^vote\s+(\w+)$/, /^vote(\s+.*)?$/,
    "vote <poll id>",
    async (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => {
      let pollID = commandArguments[1]

      if (!(pollID in pollsData))
      {
        return new BotCommandError("Invalid poll id '" + pollID + "'", false)
      }

      let pollData = pollsData[pollID]
      let member = await message.member.fetch()

      if (!checkVoteRequirements(pollData, (message.channel as TextChannel).guildId, member, message))
      {
        return new BotCommandError("Voting requirements not met for " + pollID, false)
      }

      await executeDMVoteCommand(client, message.author, message.member, pollID, firestoreDB)
    }
  )
}

var pollResponseTimeouts: {[k: string]: {[k: string]: number}} = {}

async function executeDMVoteCommand(client: Client, user: User, guildMember: GuildMember, pollID: string, firestoreDB: Firestore)
{
  if (!pollResponseTimeouts[pollID])
  {
    pollResponseTimeouts[pollID] = {}
  }
  if (!pollResponseTimeouts[pollID][user.id] || Date.now()-pollResponseTimeouts[pollID][user.id] >= 1000*10)
  {
    pollResponseTimeouts[pollID][user.id] = Date.now()
  }
  else if (Date.now()-pollResponseTimeouts[pollID][user.id] < 1000*10)
  {
    console.log("Cancel vote" + pollID + " for " + user.username)
    return
  }

  console.log("Init vote " + pollID + " for " + user.username)

  var uploadPollResponse = async (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => {
    await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + userID).set({responseMap: questionIDToOptionIDMap, updatedAt: Date.now()})
  }

  let pollResponsePath = pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + user.id
  let pollResponseDoc = await firestoreDB.doc(pollResponsePath).get()
  let previousPollResponseMessageIDs: string[]
  if (pollResponseDoc != null && pollResponseDoc.data() != null && pollResponseDoc.data().messageIDs != null)
  {
    previousPollResponseMessageIDs = pollResponseDoc.data().messageIDs
  }

  try
  {
    let newPollResponseMessageIDs = await sendVoteDM(client, user, guildMember, pollID, uploadPollResponse, previousPollResponseMessageIDs)
    await firestoreDB.doc(pollResponsePath).set({messageIDs: newPollResponseMessageIDs})
  }
  catch (error)
  {
    console.log("Vote DM Error: " + error)
  }
}

async function sendVoteDM(client: Client, user: User, guildMember: GuildMember, pollID: string, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>, previousPollResponseMessageIDs: string[])
{
  var dmChannel = user.dmChannel || await user.createDM()

  var pollData = pollsData[pollID]
  var pollMessageIDs = {}
  var pollActionMessages = {}

  let titleActionMessage = new ActionMessage(dmChannel, null, null,
    async () => {
      return "__**" + pollData.name + "**__"
    }, async (message: Message) => {
      pollMessageIDs["title"] = message.id
    },
    null
  )
  await titleActionMessage.initActionMessage()
  pollActionMessages["title"] = titleActionMessage

  for (let questionData of pollData.questions)
  {
    if (questionData.roleIDs && !questionData.roleIDs.some(roleID => guildMember.roles.cache.has(roleID))) { continue }

    let questionActionMessage = new ActionMessage<PollQuestion>(dmChannel, null, questionData,
      async (questionData: PollQuestion) => {
        let questionString = "**" + questionData.prompt + "**"
        for (let optionData of questionData.options ?? [])
        {
          questionString += "\n" + ":" + optionData.emote + ": \\: " + optionData.name
        }
        return questionString
      }, async (message: Message, questionData: PollQuestion) => {
        pollMessageIDs[questionData.id] = message.id
        for (let optionData of questionData.options ?? [])
        {
          let emoji = getEmoji(client, optionData.emote)
          if (emoji == null) { continue }
          await message.react(emoji)
        }
      }, (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion) => {
        handlePollQuestionReaction(client, reaction, user, reactionEventType, questionData, pollID)
      }
    )
    await questionActionMessage.initActionMessage()
    pollActionMessages[questionData.id] = questionActionMessage
  }

  let submitActionMessage = new ActionMessage(dmChannel, null, null,
    async () => {
      return "**" + ":arrow_down: Submit below :arrow_down:" + "**"
    }, async (message: Message) => {
      pollMessageIDs["submit"] = message.id
      let submitEmoji = getEmoji(client, submitResponseEmote)
      await message.react(submitEmoji)
    }, (reaction: MessageReaction, user: User) => {
      handlePollSubmitReaction(client, reaction, user, pollID, uploadPollResponse)
    }
  )
  await submitActionMessage.initActionMessage()
  pollActionMessages["submit"] = submitActionMessage

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

  if (!(pollID in pollsActionMessages))
  {
    pollsActionMessages[pollID] = {}
  }
  pollsActionMessages[pollID][user.id] = pollActionMessages

  return pollMessageIDs
}

async function handlePollQuestionReaction(client: Client, reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion, currentPollID: string)
{
  if (user.id == client.user.id) { return }

  let currentOptionData = questionData.options.find(optionData => {
    let emoteName = getEmoteName(reaction.emoji)
    return optionData.emote == emoteName
  })
  if (!currentOptionData) { return }

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
    pollResponses[currentPollID][user.id][questionData.id] = currentOptionData.id
    break

    case "removed":
    if (pollResponses[currentPollID][user.id][questionData.id] == currentOptionData.id)
    {
      delete pollResponses[currentPollID][user.id][questionData.id]
    }
    break
  }
}

async function handlePollSubmitReaction(client: Client, reaction: MessageReaction, user: User, currentPollID: string, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>)
{
  if (user.id == client.user.id) { return }
  if (getEmoteName(reaction.emoji) != submitResponseEmote) { return }
  if (pollResponses[currentPollID] == null || pollResponses[currentPollID][user.id] == null) { return }

  await uploadPollResponse(currentPollID, user.id, pollResponses[currentPollID][user.id])

  for (let [questionID, pollActionMessage] of Object.entries(pollsActionMessages[currentPollID][user.id]) as [string, ActionMessage<PollQuestion>][])
  {
    if (questionID == "submit")
    {
      pollActionMessage.reactionCollector.stop()

      let submitMessage = await pollActionMessage.channel.messages.fetch(pollActionMessage.messageID)
      submitMessage.edit("**" + ":" + submitResponseEmote + ": Submitted " + pollsData[currentPollID].name + "**")
      continue
    }
    await pollActionMessage.removeActionMessage()
  }
}
