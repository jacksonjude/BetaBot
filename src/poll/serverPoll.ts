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

const decisionEmotes = {
  pass: new Emote("<a:yea:929537247106191370>"),
  fail: new Emote("<a:nay:929537309358059520>"),
  tie: new Emote("<:present:928924944593719316>")
}
const decisionOutcomeMessages = {
  pass: "Passes",
  fail: "Fails",
  tie: "Tied"
}

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
    await sendServerVoteMessage(client, pollDataJSON, firestoreDB)
    
    updateMessageOnClose(pollDataJSON, async (pollID) => {
      await sendServerVoteMessage(client, pollsData[pollID], firestoreDB)
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
  await removeServerPollActionMessages(pollID, deleteMessages)

  if (pollsData[pollID])
  {
    delete pollsData[pollID]
  }
}

async function removeServerPollActionMessages(pollID: string, deleteMessages: boolean = false)
{
  if (pollsActionMessages[pollID])
  {
    for (let pollActionMessage of Object.values(pollsActionMessages[pollID]) as ActionMessage<PollQuestion>[])
    {
      await pollActionMessage.removeActionMessage(deleteMessages)
    }
    delete pollsActionMessages[pollID]
  }
}

async function sendServerVoteMessage(client: Client, pollData: PollConfiguration, firestoreDB: Firestore)
{
  var pollChannel = await client.channels.fetch(pollData.channelID) as TextChannel
  if (!pollChannel) { return }
  
  await removeServerPollActionMessages(pollData.id, false)
  var pollActionMessages = {}

  if (!pollData.messageIDs)
  {
    pollData.messageIDs = {}
  }
  
  const notVotingID = "--no vote--"
  const isClosed = Date.now() >= pollData.closeTime.toMillis()
  
  let pollResultsData: { [k: string]: { [k: string]: number } } = null
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
  
  for (let questionData of pollData.questions)
  {
    if (!pollResultsData[questionData.id])
    {
      pollResultsData[questionData.id] = {}
    }
  }
  
  if (maximumVoterCount != null)
  {
    for (let questionID in pollResultsData)
    {
      let didNotVoteCount = maximumVoterCount - Object.keys(pollResultsData[questionID]).reduce((total, optionID) => total + pollResultsData[questionID][optionID], 0)
      pollResultsData[questionID][notVotingID] = didNotVoteCount
    }
  }
  
  const calculateVoteDenominator = (decisionQuestion: PollQuestion) => {
    const presentOptionID = decisionQuestion.options.find(o => o.decisionType == "present")?.id
    const voteDenominator = pollData.passingThreshold != null ? pollData.maximumVoterCount - (presentOptionID ? pollResultsData[decisionQuestion.id][presentOptionID] ?? 0 : 0) : null
    return voteDenominator
  }
  
  let decisionOutcome: "pass" | "fail" | "tie" = null
  
  if (pollData.passingThreshold != null && pollData.questions.length == 1)
  {
    const decisionQuestion = pollData.questions[0]
    
    const voteDenominator = calculateVoteDenominator(decisionQuestion)
    const passingThreshold = pollData.passingThreshold
    
    const yesOptionID = decisionQuestion.options.find(o => o.decisionType == "yes")?.id
    const noOptionID = decisionQuestion.options.find(o => o.decisionType == "no")?.id
    const presentOptionID = decisionQuestion.options.find(o => o.decisionType == "present")?.id
    
    const yesVotes = yesOptionID ? pollResultsData[decisionQuestion.id][yesOptionID] ?? 0 : 0
    const noVotes = noOptionID ? pollResultsData[decisionQuestion.id][noOptionID] ?? 0 : 0
    const presentVotes = presentOptionID ? pollResultsData[decisionQuestion.id][presentOptionID] ?? 0 : 0
    const notVotingCount = pollResultsData[decisionQuestion.id][notVotingID] ?? 0
    
    const yesRatio = yesVotes/voteDenominator
    const noRatio = noVotes/voteDenominator
    
    const meetsPassingThreshold = (
      (passingThreshold != 0.5 && yesRatio >= passingThreshold) ||
      (passingThreshold == 0.5 && yesRatio > 0.5)
    )
    
    const meetsFailingThreshold = (
      (passingThreshold != 0.5 && noRatio > 1-passingThreshold) ||
      (passingThreshold == 0.5 &&
        (
          (!pollData.allowTies && noRatio >= 0.5) ||
          (pollData.allowTies && noRatio > 0.5)
        )
      )
    )
      
    if (
      (!isClosed && presentVotes > maximumVoterCount/2) ||
      (isClosed && presentVotes + notVotingCount > maximumVoterCount/2) ||
      (isClosed && !meetsPassingThreshold)
    )
    {
      decisionOutcome = "fail"
    }
    else if (pollData.allowTies && yesVotes == noVotes && yesVotes + noVotes == voteDenominator)
    {
      decisionOutcome = "tie"
    }
    else if (meetsPassingThreshold)
    {
      decisionOutcome = "pass"
    }
    else if (meetsFailingThreshold)
    {
      decisionOutcome = "fail"
    }
  }

  let titleActionMessage = new ActionMessage(pollChannel, pollData.messageIDs["title"], null,
    async () => {
      return "__**" + pollData.name + "**__" + (decisionOutcome != null ? " (" + decisionEmotes[decisionOutcome] + " " + decisionOutcomeMessages[decisionOutcome] + ")" : "") + "\n" + await getAnnouncementMessageText(pollData, pollChannel, firestoreDB)
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
        if (pollResultsData[questionData.id] != null)
        {
          const voteDenominator = calculateVoteDenominator(questionData)
          
          for (let optionData of questionData.options)
          {
            const optionCount = pollResultsData[questionData.id][optionData.id] ?? 0
            questionString += "\n" + optionData.emote + " **" + optionCount + (voteDenominator > 0 && optionData.decisionType != "present" ? " (" + (Math.round(optionCount/voteDenominator*100*100)/100) + "%)" : "") + "**"
          }
          if (pollResultsData[questionData.id][notVotingID] != null) questionString += "\nNV **" + pollResultsData[questionData.id][notVotingID] + "**"
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
        handlePollMessageReaction(client, reaction, user, reactionEventType, questionData, pollData.id, firestoreDB)
      }
    )
    await pollQuestionActionMessage.initActionMessage()
    pollActionMessages[questionData.id] = pollQuestionActionMessage
  }

  pollsActionMessages[pollData.id] = pollActionMessages
}

async function handlePollMessageReaction(client: Client, reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion, currentPollID: string, firestoreDB: Firestore)
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
    if (pollResponses[currentPollID][user.id][questionData.id] == currentOptionID)
    {
      console.log(`[Server Poll] ${currentPollID}/${user.id}/${questionData.id} already has ${currentOptionID}`)
      return
    }
    pollResponses[currentPollID][user.id][questionData.id] = currentOptionID
    break

    case "removed":
    if (pollResponses[currentPollID][user.id][questionData.id] == currentOptionID)
    {
      delete pollResponses[currentPollID][user.id][questionData.id]
    }
    else
    {
      console.log(`[Server Poll] ${currentPollID}/${user.id}/${questionData.id} is not ${currentOptionID}`)
      return
    }
    break
  }

  await uploadPollResponse(currentPollID, user.id, pollResponses[currentPollID][user.id], firestoreDB)
  
  await sendServerVoteMessage(client, pollsData[currentPollID], firestoreDB)
}

async function uploadPollResponse(pollID: string, userID: string, questionIDToOptionIDMap: PollResponseMap, firestoreDB: Firestore)
{
  await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + userID).set({responseMap: questionIDToOptionIDMap, updatedAt: Date.now()})
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
        pollType: "server",
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

export function getCreateDecisionPollCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "decisionpoll", "create a new decision poll (yes/no/present), which auto-closes upon pass or fail",
    /^decisionpoll\s+([\w\s\-’'".,;?!:@#$%^&*()\[\]\/]+)(?:\s*(?:<#)?(\d+)(?:>)?)?(?:\s*<@!?&?(\d+)>)?(?:\s+(\d+(?:\.\d*)?))?(?:\s+(normal|full|super))?\s*(.+)$/, /^decisionpoll(\s+.*)?$/,
    "decisionpoll <name> [channel] [role] [duration] [normal|full|super] <message...>",
    async (commandArguments: string[], message: Message, _, firestoreDB: Firestore) => {
      let pollName = commandArguments[1].replace(/^\s*/, "").replace(/\s*$/, "")
      let channelID = commandArguments[2] ?? message.channelId
      let roleID = commandArguments[3] ?? message.guild.roles.everyone.id
      let duration = commandArguments[4] ? parseFloat(commandArguments[4]) : 24.0
  
      let voteType = commandArguments[5] as "normal" | "full" | "super" ?? "normal"
      // normal = 50% + 1 to pass, allow present votes, allow ties
      // full = 50% + 1 to pass, no present votes, no ties
      // super = 2/3rds to pass, no present votes, no ties
      
      let pollMessage = commandArguments[6]
      
      let pollEmotes: {"yes": Emote, "no": Emote, "present"?: Emote}
      let passingThreshold: number
      let allowTies: boolean
      
      switch (voteType)
      {
        case "normal":
        pollEmotes = {"yes": decisionEmotes.pass, "no": decisionEmotes.fail, "present": decisionEmotes.tie}
        passingThreshold = 1/2
        allowTies = true
        break
        
        case "full":
        pollEmotes = {"yes": decisionEmotes.pass, "no": decisionEmotes.fail}
        passingThreshold = 1/2
        allowTies = false
        break
        
        case "super":
        pollEmotes = {"yes": decisionEmotes.pass, "no": decisionEmotes.fail}
        passingThreshold = 2/3
        allowTies = false
        break
      }
  
      let pollID = pollName + "-" + uid()
  
      let pollConfig = {
        active: true,
        id: pollID,
        name: pollName,
        pollType: "server",
        openTime: Timestamp.fromMillis(Date.now()),
        closeTime: Timestamp.fromMillis(Date.now()+duration*1000*60*60),
        questions: [
          {
            id: uid(),
            prompt: pollMessage,
            showOptionNames: false,
            options: Object.keys(pollEmotes).map(decision => {
              return {
                id: uid(),
                emote: pollEmotes[decision].toString(),
                decisionType: decision
              }
            })
          }
        ],
        channelID: channelID,
        roleIDs: [roleID],
        creatorID: message.author.id,
        shouldDeleteOnClose: true,
        passingThreshold: passingThreshold,
        allowTies: allowTies,
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