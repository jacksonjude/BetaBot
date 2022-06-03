import { Client, User, TextChannel, Message, MessageReaction } from "discord.js"
import { ActionMessage, MessageReactionEventType } from "../actionMessage"
import { Firestore, Timestamp } from "firebase-admin/firestore"

import ShortUniqueID from "short-unique-id"
const uid = new ShortUniqueID({ length: 10 })

import {
  PollConfiguration, PollQuestion,
  pollsData,
  pollsCollectionID
} from "./sharedPoll"
import { Emote } from "../util"

import { BotCommand } from "../botCommand"

class SelectedPollField
{
  poll: string
  question?: string
  option?: string

  user: string
  channel: string

  type: SelectedPollFieldType
}

enum SelectedPollFieldType
{
  none,
  option,
  questionPrompt,
  questionRoles,
  questionDelete,
  questionInfo,
  pollName,
  pollOpenTime,
  pollCloseTime,
  pollVoteMessage,
  pollSaveChanges,
  pollCloseEditing
}

enum PollQuestionEditType
{
  prompt = 1,
  roles = 2,
  delete = 3,
  info = 4
}

const pollQuestionEditEmotes = {
  "🖊": PollQuestionEditType.prompt,
  "👤": PollQuestionEditType.roles,
  "🗑": PollQuestionEditType.delete,
  "ℹ️": PollQuestionEditType.info
}

enum PollEditType
{
  title = 1,
  newQuestion = 2,
  openTime = 3,
  closeTime = 4,
  voteMessage = 5,
  saveChanges = 6,
  closeEditing = 7
}

const pollEditEmotes = {
  "🖊": PollEditType.title,
  "🆕": PollEditType.newQuestion,
  "📖": PollEditType.openTime,
  "📕": PollEditType.closeTime,
  "📣": PollEditType.voteMessage,
  "☑️": PollEditType.saveChanges,
  "❌": PollEditType.closeEditing
}

var pollEditActionMessages: { [k: string]: { [k: string]: ActionMessage<PollQuestion> } } = {}
var pollEditSelectedFields: { [k: string]: SelectedPollField } = {}

const titleMessageID = "title"

export function getCreatePollCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "createpoll", "create a new poll",
    /^createpoll\s+(\w+)(?:\s+(.+))?$/, /^createpoll(\s+.*)?$/,
    "createpoll <id> [name]",
    async (commandArguments: string[], message: Message, client: Client) => {
      let pollID = commandArguments[1]
      let pollName = commandArguments[2]

      let pollData = pollsData[pollID] ?? {active: false, id: pollID, name: pollName ?? pollID, questions: [], pollType: "dm", openTime: Timestamp.fromDate(new Date()), closeTime: Timestamp.fromDate(new Date())} as PollConfiguration
      pollsData[pollID] = pollData

      sendPollEditMessages(pollData, message.channel as TextChannel, client)
    }
  )
}

async function sendPollEditMessages(pollConfig: PollConfiguration, channel: TextChannel, client: Client)
{
  if (!pollEditActionMessages[pollConfig.id])
  {
    pollEditActionMessages[pollConfig.id] = {}
  }

  if (!pollEditActionMessages[pollConfig.id][titleMessageID])
  {
    let titleActionMessage = new ActionMessage(channel, null, null,
      async () => {
        let editingPollTitle: boolean
        let editingOpenTime: boolean
        let editingCloseTime: boolean
        let editingVoteMessage: boolean
        if (pollEditSelectedFields[pollConfig.id])
        {
          editingPollTitle = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.pollName
          editingOpenTime = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.pollOpenTime
          editingCloseTime = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.pollCloseTime
          editingVoteMessage = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.pollVoteMessage
        }

        let titleString = (editingPollTitle ? "*" : "") + "__**" + pollConfig.name + "**__" + (editingPollTitle ? "*" : "")
        if (editingOpenTime)
        {
          titleString += "  (<t:" + pollsData[pollConfig.id].openTime.seconds.toString() + ":f>)"
        }
        if (editingCloseTime)
        {
          titleString += "  (<t:" + pollsData[pollConfig.id].closeTime.seconds.toString() + ":f>)"
        }
        if (editingVoteMessage)
        {
          titleString += pollsData[pollConfig.id].voteMessageSettings ? "  (<#" + pollsData[pollConfig.id].voteMessageSettings.channelID + "> " + pollsData[pollConfig.id].voteMessageSettings.messageText + ")" : "  (None)"
        }

        return titleString
      }, async (message: Message) => {
        await message.react("🖊")
        await message.react("🆕")
        await message.react("📖")
        await message.react("📕")
        await message.react("📣")
        await message.react("☑️")
        await message.react("❌")
      },
      (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType) => {
        handlePollEditReaction(client, reaction, user, reactionEventType, null, pollConfig.id)
      }
    )

    titleActionMessage.initActionMessage()
    pollEditActionMessages[pollConfig.id][titleMessageID] = titleActionMessage
  }

  for (let pollQuestion of pollConfig.questions)
  {
    if (!pollEditActionMessages[pollConfig.id][pollQuestion.id])
    {
      let questionActionMessage = new ActionMessage<PollQuestion>(channel, null, pollQuestion,
        async (questionData: PollQuestion) => {
          let selectedOption: string
          let editingQuestionPrompt: boolean
          let whitelistedRoleIDs: string
          let deletingQuestion: boolean
          let showingQuestionInfo: boolean

          if (pollEditSelectedFields[pollConfig.id] && pollEditSelectedFields[pollConfig.id].question == questionData.id)
          {
             selectedOption = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.option ? pollEditSelectedFields[pollConfig.id].option : null
             editingQuestionPrompt = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.questionPrompt
             whitelistedRoleIDs = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.questionRoles ? (questionData.roleIDs ?? []).reduce((rolesString, roleID) => rolesString += "<@&" + roleID + "> ", "") : null
             deletingQuestion = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.questionDelete
             showingQuestionInfo = pollEditSelectedFields[pollConfig.id].type == SelectedPollFieldType.questionInfo
          }

          let questionString = (deletingQuestion ? "*" : "") + (editingQuestionPrompt ? "*" : "") + "**" + questionData.prompt + "**" + (editingQuestionPrompt ? "*" : "")
            + (whitelistedRoleIDs != null ? "  (" + (whitelistedRoleIDs == "" ? "@everyone" : whitelistedRoleIDs.slice(0, -1)) + ")" : "")
            + (showingQuestionInfo ? "  *(" + questionData.id + ")*" : "")
          for (let optionData of questionData.options ?? [])
          {
            questionString += "\n" + optionData.emote + " \\: " + (selectedOption == optionData.id ? "*" : "") + optionData.name + (selectedOption == optionData.id ? "*" : "")
              + (showingQuestionInfo ? "  *(" + optionData.id + ")*" : "")
          }
          questionString += (deletingQuestion ? "*" : "")

          return questionString
        }, async (message: Message, questionData: PollQuestion) => {
          await message.react("🖊")
          await message.react("👤")
          await message.react("🗑")
          await message.react("ℹ️")

          for (let optionData of questionData.options ?? [])
          {
            let emoji = new Emote(optionData.emote).toEmoji(client)
            if (emoji == null) { continue }
            await message.react(emoji)
          }
        }, (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion) => {
          handlePollEditReaction(client, reaction, user, reactionEventType, questionData, pollConfig.id)
        }
      )

      questionActionMessage.initActionMessage()
      pollEditActionMessages[pollConfig.id][pollQuestion.id] = questionActionMessage
    }
  }
}

async function handlePollEditReaction(client: Client, reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, questionData: PollQuestion, currentPollID: string)
{
  if (user.id == client.user.id) { return }

  let currentOptionData = questionData ? questionData.options.find(optionData => {
    let emoteName = Emote.fromEmoji(reaction.emoji).toString()
    return optionData.emote == emoteName
  }) : null
  let questionEditType = pollQuestionEditEmotes[reaction.emoji.toString()]
  let pollEditType = pollEditEmotes[reaction.emoji.toString()]

  if (!currentOptionData && !questionEditType && questionData)
  {
    currentOptionData = {emote: Emote.fromEmoji(reaction.emoji).toString(), id: uid(), name: "<<Enter name>>"}
    questionData.options.push(currentOptionData)
    reaction.message.react(reaction.emoji)
  }

  if (!questionData && !pollEditType)
  {
    reaction.users.remove(user)
    return
  }

  switch (reactionEventType)
  {
    case "added":
    if (!questionData && pollEditType)
    {
      pollEditSelectedFields[currentPollID] = {type: SelectedPollFieldType.none, poll: currentPollID, user: user.id, channel: reaction.message.channelId}

      switch (pollEditType)
      {
        case PollEditType.title:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.pollName
        break

        case PollEditType.newQuestion:
        let newQuestionData = {id: uid(), prompt: "<<Enter prompt>>", options: []}
        pollsData[currentPollID].questions.push(newQuestionData)
        reaction.users.remove(user)

        delete pollEditSelectedFields[currentPollID]
        // pollEditSelectedFields[currentPollID] = {type: SelectedPollFieldType.questionPrompt, poll: currentPollID, question: questionData.id, user: user.id, channel: reaction.message.channelId}

        sendPollEditMessages(pollsData[currentPollID], reaction.message.channel as TextChannel, client)
        break

        case PollEditType.openTime:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.pollOpenTime
        break

        case PollEditType.closeTime:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.pollCloseTime
        break

        case PollEditType.voteMessage:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.pollVoteMessage
        break

        case PollEditType.saveChanges:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.pollSaveChanges
        return

        case PollEditType.closeEditing:
        removePollActionMessages(currentPollID)
        break
      }
    }
    else if (questionData && questionEditType)
    {
      pollEditSelectedFields[currentPollID] = {type: SelectedPollFieldType.none, poll: currentPollID, question: questionData.id, user: user.id, channel: reaction.message.channelId}

      switch (questionEditType)
      {
        case PollQuestionEditType.prompt:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.questionPrompt
        break

        case PollQuestionEditType.roles:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.questionRoles
        break

        case PollQuestionEditType.delete:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.questionDelete
        break

        case PollQuestionEditType.info:
        pollEditSelectedFields[currentPollID].type = SelectedPollFieldType.questionInfo
        break
      }
    }
    else
    {
      pollEditSelectedFields[currentPollID] = {type: SelectedPollFieldType.option, poll: currentPollID, question: questionData.id, option: currentOptionData.id, user: user.id, channel: reaction.message.channelId}
    }

    break

    case "removed":
    if (pollEditSelectedFields[currentPollID] && (
      pollEditType == PollEditType.title && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.pollName
      || pollEditType == PollEditType.openTime && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.pollOpenTime
      || pollEditType == PollEditType.closeTime && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.pollCloseTime
      || pollEditType == PollEditType.voteMessage && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.pollVoteMessage
      || pollEditType == PollEditType.saveChanges && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.pollSaveChanges
      || questionData && pollEditSelectedFields[currentPollID].question == questionData.id && (
        currentOptionData && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.option && pollEditSelectedFields[currentPollID].option == currentOptionData.id
        || questionEditType == PollQuestionEditType.prompt && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.questionPrompt
        || questionEditType == PollQuestionEditType.roles && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.questionRoles
        || questionEditType == PollQuestionEditType.delete && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.questionDelete
        || questionEditType == PollQuestionEditType.info && pollEditSelectedFields[currentPollID].type == SelectedPollFieldType.questionInfo
      )
    ))
    {
      delete pollEditSelectedFields[currentPollID]
    }
    break
  }

  let actionMessage = questionData ? pollEditActionMessages[currentPollID][questionData.id] : pollEditActionMessages[currentPollID][titleMessageID]
  if (actionMessage)
  {
    await (actionMessage as ActionMessage<PollQuestion>).sendMessage()
  }

  cleanReactions(reaction, user, reactionEventType, Object.values(pollEditActionMessages[currentPollID]).map(actionMessage => actionMessage.liveMessage))
}

export function setupPollEditTextInputEventHandlers(client: Client, firestoreDB: Firestore)
{
  client.on('messageCreate', (message) => {
    for (let pollID in pollEditSelectedFields)
    {
      if (pollEditSelectedFields[pollID].channel == message.channel.id)
      {
        handlePollEditFieldTextInput(message, pollEditSelectedFields[pollID], firestoreDB)
      }
    }
  })
}

async function handlePollEditFieldTextInput(message: Message, pollField: SelectedPollField, firestoreDB: Firestore)
{
  switch (pollField.type)
  {
    case SelectedPollFieldType.option:
    pollsData[pollField.poll].questions.find(question => question.id == pollField.question).options.find(option => option.id == pollField.option).name = message.content
    break

    case SelectedPollFieldType.questionRoles:
    let questionRolesRegex = /^\s*((?:<@!?&?\d+>\s*)*)\s*$/

    if (questionRolesRegex.test(message.content))
    {
      let questionRolesString = questionRolesRegex.exec(message.content)[1]

      let roleIDs = []
      for (let roleIDString of questionRolesString.split(/\s+/))
      {
        let roleIDGroups = /<@!?&?(\d+)>/.exec(roleIDString)
        if (!roleIDGroups || roleIDGroups.length <= 1) { continue }

        roleIDs.push(roleIDGroups[1])
      }

      pollsData[pollField.poll].questions.find(question => question.id == pollField.question).roleIDs = roleIDs
    }
    break

    case SelectedPollFieldType.questionPrompt:
    pollsData[pollField.poll].questions.find(question => question.id == pollField.question).prompt = message.content
    break

    case SelectedPollFieldType.questionDelete:
    if (message.content == "y" || message.content == "confirm")
    {
      let questionIndex = pollsData[pollField.poll].questions.findIndex(question => question.id == pollField.question)
      questionIndex > -1 && pollsData[pollField.poll].questions.splice(questionIndex, 1)

      pollEditActionMessages[pollField.poll][pollField.question].removeActionMessage()
      message.delete()

      return
    }
    break

    case SelectedPollFieldType.pollName:
    pollsData[pollField.poll].name = message.content
    break

    case SelectedPollFieldType.pollOpenTime:
    case SelectedPollFieldType.pollCloseTime:
    let epochRegex = /^\s*(\d+)\s*$/
    let yyyyMMDDHHMMSSRegex = /^\s*(?:(\d{4})-)?(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*$/

    let selectedDate: Date

    if (epochRegex.test(message.content))
    {
      selectedDate = new Date(epochRegex.exec(message.content)[1])
    }
    else if (yyyyMMDDHHMMSSRegex.test(message.content))
    {
      let dateParts = yyyyMMDDHHMMSSRegex.exec(message.content)
      selectedDate = new Date()

      dateParts[1] && selectedDate.setFullYear(parseInt(dateParts[1]))
      selectedDate.setMonth(parseInt(dateParts[2])-1)
      selectedDate.setDate(parseInt(dateParts[3]))
      selectedDate.setHours(parseInt(dateParts[4]))
      selectedDate.setMinutes(parseInt(dateParts[5]))
      selectedDate.setSeconds(dateParts[6] ? parseInt(dateParts[6]) : 0)
    }

    if (selectedDate)
    {
      let selectedTimestamp = Timestamp.fromMillis(selectedDate.getTime())

      switch (pollField.type)
      {
        case SelectedPollFieldType.pollOpenTime:
        pollsData[pollField.poll].openTime = selectedTimestamp
        break

        case SelectedPollFieldType.pollCloseTime:
        pollsData[pollField.poll].closeTime = selectedTimestamp
        break
      }
      break
    }

    case SelectedPollFieldType.pollVoteMessage:
    let channelMessageRegex = /^\s*(?:(?:<#)?(\d+)(?:>)?)?\s+(.+)\s*$/

    if (channelMessageRegex.test(message.content))
    {
      let channelMessageParts = channelMessageRegex.exec(message.content)
      let channelID = channelMessageParts[1]
      let voteMessage = channelMessageParts[2]

      pollsData[pollField.poll].voteMessageSettings = {channelID: channelID, messageText: voteMessage}
    }
    break

    case SelectedPollFieldType.pollSaveChanges:
    if (message.content == "y" || message.content == "confirm")
    {
      removePollActionMessages(pollField.poll)
      message.delete()

      firestoreDB.doc(pollsCollectionID + "/" + pollField.poll).set(pollsData[pollField.poll], {merge: false})

      return
    }
    break
  }

  pollField.question && pollEditActionMessages[pollField.poll][pollField.question].sendMessage()
  !pollField.question && pollEditActionMessages[pollField.poll][titleMessageID].sendMessage()
  message.delete()
}

async function cleanReactions(reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, otherMessages: Message[])
{
  if (reactionEventType == "added")
  {
    // await reaction.message.fetch()

    reaction.message.reactions.cache.forEach(otherReaction => {
      if (otherReaction.emoji.name == reaction.emoji.name) { return }

      // await otherReaction.users.fetch()
      if (otherReaction.users.cache.has(user.id))
      {
        otherReaction.users.remove(user.id)
      }
    })

    otherMessages.forEach(message => {
      if (!reaction.message || !message || message.id == reaction.message.id) { return }

      message.reactions.cache.forEach(reaction => {
        if (reaction.users.cache.has(user.id))
        {
          reaction.users.remove(user.id)
        }
      })
    })
  }
}

function removePollActionMessages(pollID: string)
{
  Object.keys(pollEditActionMessages[pollID]).forEach(async questionID => {
    await pollEditActionMessages[pollID][questionID].removeActionMessage()
    delete pollEditActionMessages[pollID][questionID]
  })

  delete pollEditSelectedFields[pollID]
}

export function getEditPollCommand(): BotCommand
{
  const propertyListRegex = "\\s+delete|(?:\\s+[\\w\\*]+='[\\w\\s\\?\\*\\.!,_\\(\\)/\\\\]+'|\\s+[\\w\\*]+=\\d+|\\s+[\\w\\*]+=\\d+ms|\\s+[\\w\\*]+=(?:true|false))*"

  return BotCommand.fromRegex(
    "polledit", "edit the fields of a poll",
    new RegExp("^polledit\\s+(?:(poll)\\s+(\\w+)|(object)\\s+(\\w+)\\s+([\\w\\.]+)|(array)\\s+(\\w+)\\s+([\\w\\.]+)|(question)\\s+(\\w+)\\s+(\\w+)|(option)\\s+(\\w+)\\s+(\\w+)\\s+(\\w+))(" + propertyListRegex + ")$"), /^polledit(\s+.*)?$/,
    "polledit <poll | object | array | question | option> <poll id> [subfield key path | question id] [option id] <property1='string1' property2=number2 property3=boolean3 ... | delete>",
    async (commandArguments: string[], message: Message, __, firestoreDB: Firestore) => {
      let subcommand = commandArguments[1] ?? commandArguments[3] ?? commandArguments[6] ?? commandArguments[9] ?? commandArguments[12]

      let pollID = commandArguments[2] ?? commandArguments[4] ?? commandArguments[7] ?? commandArguments[10] ?? commandArguments[13]
      let subfieldKeyPath = commandArguments[5] ?? commandArguments[8]
      let questionID = commandArguments[11] ?? commandArguments[14]
      let optionID = commandArguments[15]

      let propertyList: { [k: string]: string|number|Timestamp|boolean } = {}
      let propertyListString = commandArguments[16]
      if (propertyListString)
      {
        propertyListString = propertyListString.replace(/^\s*/, "").replace(/\s*$/, "")
        if (propertyListString != "delete")
        {
          let propertyKeyPairStrings = propertyListString.split(/\s+(?=(?:(?:[^']*[']){2})*[^']*$)/)
          for (let propertyKeyPairString of propertyKeyPairStrings)
          {
            let [ propertyKey, propertyValue ] = propertyKeyPairString.split("=")

            if (/^'[\w\s\?\*\.!,_\(\)\/\\]+'$/.test(propertyValue))
            {
              propertyList[propertyKey] = /^'([\w\s\?\*\.!,_\(\)\/\\]+)'$/.exec(propertyValue)[1]
            }
            else if (/^\d+$/.test(propertyValue))
            {
              propertyList[propertyKey] = parseInt(propertyValue)
            }
            else if (/^\d+ms$/.test(propertyValue))
            {
              propertyList[propertyKey] = Timestamp.fromMillis(parseInt(propertyValue))
            }
            else if (/^true|false$/.test(propertyValue))
            {
              propertyList[propertyKey] = propertyValue === "true" ? true : false
            }
          }
        }
      }

      await message.channel.send("PollEdit: " + "Fetching poll '" + pollID + "'")
      let pollDocRef = firestoreDB.doc(pollsCollectionID + "/" + pollID)
      let pollDoc = await pollDocRef.get()

      let pollData: any = {id: pollID} // may be incomplete PollConfiguration
      if (pollDoc.exists)
      {
        pollData = pollDoc.data()
      }
      else
      {
        await message.channel.send("PollEdit: " + "Creating poll '" + pollID + "'")
      }

      if (pollData.active !== false)
      {
        pollData.active = false
        await message.channel.send("PollEdit: " + "Deactivating poll '" + pollID + "'")
      }

      function getNestedObjectFromKeyPath(rootObject: any, keyPath: string, getParent: boolean = false)
      {
        let keyPathParts = keyPath.split(".")

        let subObject = rootObject
        for (let keyPathOn in keyPathParts)
        {
          let keyPath = keyPathParts[keyPathOn]
          let formattedKeyPath: string | number = keyPath

          if (subObject instanceof Array)
          {
            formattedKeyPath = parseInt(keyPath)
            if (formattedKeyPath == NaN) { return null }
          }

          if (getParent && parseInt(keyPathOn) == keyPathParts.length-1)
          {
            return { parentObject: subObject, childKey: formattedKeyPath }
          }

          subObject = subObject[formattedKeyPath]

          if (subObject == null) { return null }
        }

        return subObject
      }

      switch (subcommand)
      {
        case "poll":
        if (propertyListString == "delete")
        {
          await message.channel.send("PollEdit: " + "Deleting poll '" + pollID + "'")
          await pollDocRef.delete()
          await message.channel.send("PollEdit: " + "Execution complete")
          return
        }

        for (let propertyKey in propertyList)
        {
          pollData[propertyKey] = propertyList[propertyKey]
        }
        break

        case "object":
        var nestedObjectCallback = getNestedObjectFromKeyPath(pollData, subfieldKeyPath, true)
        if (nestedObjectCallback == null)
        {
          await message.channel.send("PollEdit: " + "Error: Invalid keypath '" + subfieldKeyPath + "' for poll '" + pollID + "'")
          return
        }
        var { parentObject, childKey } = nestedObjectCallback

        if (propertyListString == "delete")
        {
          if (parentObject instanceof Array)
          {
            if (parseInt(childKey) < parentObject.length)
            {
              await message.channel.send("PollEdit: " + "Deleting array index " + subfieldKeyPath + " from '" + pollID + "'")
              parentObject = parentObject.splice(parseInt(childKey), 1)
            }
            else
            {
              await message.channel.send("PollEdit: " + "Error: Invalid index path '" + subfieldKeyPath + "' for poll '" + pollID + "'")
            }
          }
          else if (!(parentObject instanceof Array))
          {
            await message.channel.send("PollEdit: " + "Deleting keypath " + subfieldKeyPath + " from '" + pollID + "'")
            delete parentObject[childKey]
          }
          break
        }

        if (parentObject instanceof Array && !parentObject[childKey])
        {
          await message.channel.send("PollEdit: " + "Error: Array item '" + subfieldKeyPath + "' does not exist for '" + pollID + "'")
          return
        }

        if (!parentObject[childKey])
        {
          parentObject[childKey] = {}
          await message.channel.send("PollEdit: " + "Creating object '" + subfieldKeyPath + "' for poll '" + pollID + "'")
        }
        for (let propertyKey in propertyList)
        {
          if (propertyKey == "*")
          {
            parentObject[childKey] = propertyList[propertyKey]
            break
          }
          parentObject[childKey][propertyKey] = propertyList[propertyKey]
        }
        break

        case "array":
        var nestedObjectCallback = getNestedObjectFromKeyPath(pollData, subfieldKeyPath, true)
        if (nestedObjectCallback == null)
        {
          await message.channel.send("PollEdit: " + "Error: Keypath '" + subfieldKeyPath + "' not found for poll '" + pollID + "'")
          return
        }
        var { parentObject, childKey } = nestedObjectCallback

        if (parentObject instanceof Array)
        {
          await message.channel.send("PollEdit: " + "Error: Multi-dimensional arrays are not allowed by firebase")
        }
        if (!(parentObject[childKey] == null || parentObject[childKey] instanceof Array))
        {
          await message.channel.send("PollEdit: " + "Error: Given path '" + subfieldKeyPath + "' is not an array for poll '" + pollID + "'")
        }

        var justCreatedArray = false
        if (!parentObject[childKey])
        {
          await message.channel.send("PollEdit: " + "Creating array '" + subfieldKeyPath + "' for poll '" + pollID + "'")
          parentObject[childKey] = []
          justCreatedArray = true
        }

        if (Object.keys(propertyList).length > 0 || !justCreatedArray)
        {
          await message.channel.send("PollEdit: " + "Creating array item '" + subfieldKeyPath + "/" + parentObject[childKey].length + "' for poll '" + pollID + "'")
          if (Object.keys(propertyList)[0] == "*")
          {
            parentObject[childKey].push(propertyList[Object.keys(propertyList)[0]])
            break
          }
          parentObject[childKey].push(propertyList)
        }
        break

        case "question":
        if (!pollData.questions)
        {
          pollData.questions = []
        }

        if (propertyListString == "delete")
        {
          pollData.questions = pollData.questions.filter((questionData: any) => questionData.id != questionID)
          break
        }

        var questionData = pollData.questions.find((questionData: any) => questionData.id == questionID)
        if (!questionData)
        {
          questionData = {id: questionID}
          pollData.questions.push(questionData)
          await message.channel.send("PollEdit: " + "Creating question '" + questionID + "' at index " + (pollData.questions.length-1).toString() + " for poll '" + pollID + "'")
        }
        for (let propertyKey in propertyList)
        {
          questionData[propertyKey] = propertyList[propertyKey]
        }
        break

        case "option":
        if (!pollData.questions)
        {
          pollData.questions = []
        }

        var questionData = pollData.questions.find((questionData: any) => questionData.id == questionID)
        if (!questionData)
        {
          await message.channel.send("PollEdit: " + "Error: question '" + questionID + "' not found for poll '" + pollID + "'")
          break
        }
        if (!questionData.options)
        {
          questionData.options = []
        }

        if (propertyListString == "delete")
        {
          questionData.options = questionData.options.filter((optionData: any) => optionData.id != optionID)
          break
        }

        var optionData = questionData.options.find((optionData: any) => optionData.id == optionID)
        if (!optionData)
        {
          optionData = {id: optionID}
          questionData.options.push(optionData)
          await message.channel.send("PollEdit: " + "Creating option '" + optionID + "' at index " + (questionData.options.length-1).toString() + " for question '" + questionID + "' in poll '" + pollID + "'")
        }
        for (let propertyKey in propertyList)
        {
          optionData[propertyKey] = propertyList[propertyKey]
        }
        break
      }

      await message.channel.send("PollEdit: " + "Uploading poll '" + pollID + "'")
      await pollDocRef.set(pollData, {merge: false})

      await message.channel.send("PollEdit: " + "Execution complete")
    }
  )
}
