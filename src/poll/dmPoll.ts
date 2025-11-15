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
  checkVoteRequirements, getAnnouncementMessageText, updateMessageOnClose
} from "./sharedPoll"

import { roleGroups } from "../roleGroup"

import { setRole, Emote } from "../util"

import ShortUniqueID from "short-unique-id"
const uid = new ShortUniqueID({ length: 10 })

const nayEmote = "<a:nay:929537309358059520>"
const presentEmote = "<:present:928924944593719316>"
const yeaEmote = "<a:yea:929537247106191370>"

export async function interpretDMPollSetting(client: Client, pollID: string, pollDataJSON: PollConfiguration, firestoreDB: Firestore)
{
  pollsData[pollID] = pollDataJSON
  
  if (pollVoteActionMessages[pollID])
  {
    await pollVoteActionMessages[pollID].removeActionMessage(false)
  }

  if (pollDataJSON.voteMessageSettings != null && pollDataJSON.voteMessageSettings.channelID != null && pollDataJSON.voteMessageSettings.shouldPost)
  {
    let liveChannel = await client.channels.fetch(pollDataJSON.voteMessageSettings.channelID) as TextChannel
    let pollVoteActionMessage = new ActionMessage<PollConfiguration>(
      liveChannel,
      pollDataJSON.voteMessageSettings.messageID,
      pollDataJSON,
      async (pollData: PollConfiguration, channel: TextChannel) => {
        return pollData.voteMessageSettings.messageText + "\n" + await getAnnouncementMessageText(pollData, channel, firestoreDB)
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
    
    updateMessageOnClose(pollDataJSON, async (pollID) => {
      await (pollVoteActionMessages[pollID] as ActionMessage<PollConfiguration>).sendMessage()
    })
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
  
  addToDMVoteQueue({
    user,
    guildMember: member,
    pollID: pollData.id,
    startedAt: Date.now()
  }, client, firestoreDB)
}

export async function cleanDMPollResponseMessages(client: Client, userID: string, pollResponseData: PollResponse)
{
  if (!pollResponseData.messageIDs) { return }

  var user = await client.users.fetch(userID)
  if (!user) { return }

  var dmChannel = user.dmChannel
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

      addToDMVoteQueue({
        user: message.author,
        guildMember: message.member,
        pollID,
        startedAt: Date.now()
      }, client, firestoreDB)
    }
  )
}

interface DMVote {
  user: User,
  guildMember: GuildMember,
  pollID: string,
  startedAt: number,
}

const queuedDMVotes: DMVote[] = []
const runningDMVotes: { [k: string]: DMVote } = {}
let isDMVoteQueueRunning = false

const maximumRecentDMVotes = 10
const recentDMVoteThreshold = 60 * 1000

function addToDMVoteQueue(dmVote: DMVote, client: Client, firestoreDB: Firestore)
{
  // if there is a queued/running vote with the same user + poll
  // then skip this request to queue
  const isSameUserAndPoll = (a: DMVote, b: DMVote) => a.user.id == b.user.id && a.pollID == b.pollID
  const sameUserAndPollIsQueued = queuedDMVotes.some(queued => isSameUserAndPoll(dmVote, queued)) ||
    Object.values(runningDMVotes).some(running => isSameUserAndPoll(dmVote, running))
  if (sameUserAndPollIsQueued) { return }
  
  queuedDMVotes.push(dmVote)
  executeDMVoteQueue(client, firestoreDB)
}

async function executeDMVoteQueue(client: Client, firestoreDB: Firestore)
{
  if (isDMVoteQueueRunning) { return }
  isDMVoteQueueRunning = true
  
  console.log(`[DM Queue] RUN q=${queuedDMVotes.length}, r=${Object.keys(runningDMVotes).length}, r*=${getRecentDMVoteCount()}`)
  
  let addedVote = false
  
  while (queuedDMVotes.length > 0 && getRecentDMVoteCount() < maximumRecentDMVotes)
  {
    const currentDMVote = queuedDMVotes.shift()
    const voteID = uid()
    runningDMVotes[voteID] = currentDMVote
    addedVote = true
    
    await executeDMVoteCommand(voteID, client, firestoreDB)
  }
  
  console.log(`[DM Queue] END q=${queuedDMVotes.length}, r=${Object.keys(runningDMVotes).length}, r*=${getRecentDMVoteCount()}`)
  
  if (addedVote)
  {
    setTimeout(() => {
      executeDMVoteQueue(client, firestoreDB)
    }, recentDMVoteThreshold)
  }
  
  isDMVoteQueueRunning = false
}

function getRecentDMVoteCount()
{
  const currentTime = Date.now()
  return Object.values(runningDMVotes).reduce((count, vote) => 
    count+(currentTime-(vote?.startedAt ?? 0) < recentDMVoteThreshold ? 1 : 0), 0)
}

async function executeDMVoteCommand(voteID: string, client: Client, firestoreDB: Firestore)
{
  const { pollID, user } = runningDMVotes[voteID]

  console.log("[DM Poll] Init vote " + pollID + " for " + user.username)

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
    let newPollResponseMessageIDs = await sendVoteDM(voteID, client, uploadPollResponse, previousPollResponseMessageIDs)
    await firestoreDB.doc(pollResponsePath).set({messageIDs: newPollResponseMessageIDs})
  }
  catch (error)
  {
    console.log("[DM Poll] Vote DM Error: " + error, error.stack)
  }
}

async function sendVoteDM(voteID: string, client: Client, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>, previousPollResponseMessageIDs: string[])
{
  const { pollID, user, guildMember } = runningDMVotes[voteID]
  
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
    if (questionData.roleIDs?.length > 0 && !questionData.roleIDs.some(roleID => guildMember.roles.cache.has(roleID) || (roleGroups[roleID] && roleGroups[roleID].hasRole(guildMember)))) { continue }

    let questionActionMessage = new ActionMessage<PollQuestion>(dmChannel, null, questionData,
      async (questionData: PollQuestion, _, creatingMessage: boolean) => {
        let selectedOption: string
        if (pollResponses[pollID] && pollResponses[pollID][user.id])
        {
          selectedOption = pollResponses[pollID][user.id][questionData.id]
        }

        let questionString = "**" + questionData.prompt + "**" + " " + (creatingMessage ? nayEmote : yeaEmote)
        for (let optionData of questionData.options ?? [])
        {
          questionString += "\n" + (selectedOption == optionData.id ? "**" : "") + optionData.emote + " \\: " + optionData.name + (selectedOption == optionData.id ? "**" : "")
        }
        return questionString
      }, async (message: Message, questionData: PollQuestion) => {
        pollMessageIDs[questionData.id] = message.id
        for (let optionData of questionData.options ?? [])
        {
          let emoji = await new Emote(optionData.emote).toEmoji(client)
          if (emoji == null) { console.log("[DM Poll] Emote not found", optionData.emote); continue }
          await message.react(emoji)
        }
        await message.edit(message.content.replace(nayEmote, presentEmote))
      }, (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion) => {
        if (user.id == client.user.id) { return }
        handlePollQuestionReaction(voteID, reaction, reactionEventType, questionData)
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
      let submitEmoji = await new Emote(submitResponseEmote).toEmoji(client)
      await message.react(submitEmoji)
    }, (reaction: MessageReaction, user: User) => {
      if (user.id == client.user.id) { return }
      handlePollSubmitReaction(voteID, client, reaction, uploadPollResponse)
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

async function handlePollQuestionReaction(voteID: string, reaction: MessageReaction, reactionEventType: MessageReactionEventType, questionData: PollQuestion)
{
  const { user, pollID: currentPollID } = runningDMVotes[voteID]
  
  let currentOptionData = questionData.options.find(optionData => {
    let emoteName = Emote.fromEmoji(reaction.emoji).toString()
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
    reaction.message.edit(reaction.message.content.replace(presentEmote, yeaEmote))
    break

    case "removed":
    if (pollResponses[currentPollID][user.id][questionData.id] == currentOptionData.id)
    {
      delete pollResponses[currentPollID][user.id][questionData.id]
    }
    break
  }

  let actionMessage = pollsActionMessages[currentPollID] && pollsActionMessages[currentPollID][user.id] ? pollsActionMessages[currentPollID][user.id][questionData.id] : null
  if (actionMessage)
  {
    (actionMessage as ActionMessage<PollQuestion>).sendMessage()
  }
}

async function handlePollSubmitReaction(voteID: string, client: Client, reaction: MessageReaction, uploadPollResponse: (pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap) => Promise<void>)
{
  const { user, pollID: currentPollID } = runningDMVotes[voteID]
  
  if (Emote.fromEmoji(reaction.emoji).toString() != submitResponseEmote) { return }
  if (pollResponses[currentPollID] == null || pollResponses[currentPollID][user.id] == null) { return }
  
  console.log(`[DM Poll] Submit vote ${currentPollID} for ${user.username}`)
  
  const userPollResponse = pollResponses[currentPollID][user.id]

  await uploadPollResponse(currentPollID, user.id, userPollResponse)

  for (let [questionID, pollActionMessage] of Object.entries(pollsActionMessages[currentPollID][user.id]) as [string, ActionMessage<PollQuestion>][])
  {
    if (questionID == "submit")
    {
      pollActionMessage.reactionCollector.stop()

      const submitMessage = await pollActionMessage.channel.messages.fetch(pollActionMessage.messageID)
      const submitText = "**" + submitResponseEmote + " Submitted " + pollsData[currentPollID].name + "**"
      
      let fullSubmitText = submitText
      for (const questionConfig of pollsData[currentPollID].questions)
      {
        const userChoiceID = userPollResponse[questionConfig.id]
        if (!userChoiceID) continue
        
        const optionConfig = questionConfig.options.find(o => o.id == userChoiceID)
        if (!optionConfig) continue
        
        fullSubmitText += `\n${questionConfig.prompt} ${optionConfig.emote}`
      }
      
      try
      {
        submitMessage.edit(fullSubmitText)
      }
      catch (error)
      {
        console.log("[DM Poll] Submit message edit error, using fallback: " + error, error.stack)
        submitMessage.edit(submitText)
      }
      continue
    }
    await pollActionMessage.removeActionMessage()
  }
  
  delete runningDMVotes[voteID]

  if (pollsData[currentPollID].iVotedRoleID)
  {
    await addIVotedRole(client, user, pollsData[currentPollID].serverID, pollsData[currentPollID].iVotedRoleID)
  }

  if (pollVoteActionMessages[currentPollID])
  {
    await pollVoteActionMessages[currentPollID].sendMessage()
  }
}

async function addIVotedRole(client: Client, user: User, serverID: string, roleID: string)
{
  if (!serverID) { return }
  let guild = await client.guilds.fetch(serverID)
  if (!guild) { return }

  await setRole(user, guild, roleID, true)
}
