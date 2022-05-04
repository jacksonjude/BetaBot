import { Client, User, GuildMember, Message, GuildEmoji, ReactionEmoji } from "discord.js"
import { ActionMessage } from "../actionMessage"
import { Firestore, Timestamp } from "firebase-admin/firestore"
import { BotCommand, BotCommandError } from "../botCommand"

export const pollsCollectionID = "pollConfigurations"
export const pollResponsesCollectionID = "responses"

export const voteMessageEmoji = "🗳"
export const submitResponseEmote = "white_check_mark"

const ExportAccessType = {
  user: "user",
  role: "role"
}

export var pollsData: { [k: string]: PollConfiguration } = {}

export var pollResponses: { [k: string]: { [k: string]: { [k: string]: string } } } = {}

export var pollsActionMessages: { [k: string]: { [k: string]: { [k: string]: ActionMessage<PollQuestion> } | ActionMessage<PollQuestion> } } = {}
export var pollVoteActionMessages: { [k: string]: ActionMessage<PollConfiguration> } = {}

export class PollConfiguration
{
  id: string
  name: string
  pollType: "dm" | "server"
  openTime: Timestamp
  closeTime: Timestamp

  roleID?: string
  serverID?: string
  iVotedRoleID?: string
  latestMembershipJoinTime?: number

  channelID?: string
  messageIDs?: { [k: string]: string }

  questions: PollQuestion[]
  voteMessageSettings?: PollVoteMessageConfiguration
  exportAccess?: PollExportAccessConfiguration[]
}

export class PollQuestion
{
  id: string
  prompt: string
  roleIDs?: string[]
  options: PollQuestionOption[]
}

class PollQuestionOption
{
  id: string
  name: string
  emote: string
}

export class PollVoteMessageConfiguration
{
  channelID: string
  messageID?: string
  messageText: string
}

export class PollExportAccessConfiguration
{
  type: "user" | "role"
  userID: string | null
  roleID: string | null
  afterPollClose: boolean | null
  accessTime: Timestamp | null
}

export class PollResponse
{
  responseMap: PollResponseMap | null
  messageIDs: string[] | null
  updatedAt: number
}

export class PollResponseMap
{
  [k: string]: string
}

export const catchAllFilter = () => true

import * as emojiConverter from 'node-emoji'
const overrideEmoteNameToEmojiMap = {
  "white_heart": "🤍"
}
const overrideEmojiToEmoteNameMap = {
  "🤍": "white_heart"
}

export function checkVoteRequirements(pollData: PollConfiguration, serverID: string, member: GuildMember, msg: Message = null)
{
  var isWithinPollTimeRange = Date.now() >= pollData.openTime.toMillis() && Date.now() <= pollData.closeTime.toMillis()
  var inRequiredServer = pollData.serverID ? serverID == pollData.serverID : true
  var meetsMembershipAge = pollData.serverID && pollData.latestMembershipJoinTime ? member.joinedTimestamp <= pollData.latestMembershipJoinTime : true
  var hasRequiredRoles = pollData.roleID ? member.roles.cache.find(role => role.id == pollData.roleID) : true

  if (!isWithinPollTimeRange)
  {
    msg && msg.channel.send(pollData.name + " has " + (Date.now() < pollData.openTime.toMillis() ? "not opened" : "closed"))
    return false
  }
  if (!inRequiredServer)
  {
    msg && msg.channel.send("Cannot vote on " + pollData.name + " in this server")
    return false
  }
  if (!meetsMembershipAge)
  {
    msg && msg.channel.send("Cannot vote on " + pollData.name + " since you have not been a member of " + msg.guild.name + " for long enough")
    return false
  }
  if (!hasRequiredRoles)
  {
    msg && msg.channel.send("Cannot vote on " + pollData.name + " without the " + pollData.roleID + " role")
    return false
  }

  return true
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

export function getExportPollResultsCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "pollresults", "get poll results",
    /^pollresults\s+(\w+)$/, /^pollresults(\s+.*)?$/,
    "pollresults <poll id>",
    async (commandArguments: string[], message: Message, __, firestoreDB: Firestore) => {
      let pollID = commandArguments[1]

      if (!(pollID in pollsData))
      {
        return new BotCommandError("Invalid poll id '" + pollID + "'", false)
      }

      let pollData = pollsData[pollID]
      let member = await message.member.fetch()

      if (!checkExportPollResultsRequirements(pollData, member, message))
      {
        return new BotCommandError("Exporting requirements not met for " + pollID, false)
      }

      await executeExportPollResultsCommand(message.author, pollID, firestoreDB)
    }
  )
}

function checkExportPollResultsRequirements(pollData: PollConfiguration, member: GuildMember, msg: Message)
{
  if (!pollData.exportAccess)
  {
    msg && msg.channel.send("Export access has not been enabled for " + pollData.name)
    return false
  }

  var userAccessData = pollData.exportAccess.find((userAccess) => userAccess.type == ExportAccessType.user && userAccess.userID == member.user.id)
  var roleAccessData = pollData.exportAccess.find((roleAccess) => roleAccess.type == ExportAccessType.role && member.roles.cache.has(roleAccess.roleID))
  var pollHasClosed = Date.now() >= pollData.closeTime.toMillis()

  if (!userAccessData && !roleAccessData)
  {
    msg && msg.channel.send("You have no access to the results of " + pollData.name)
    return false
  }
  if ((userAccessData || roleAccessData).afterPollClose && !pollHasClosed)
  {
    msg && msg.channel.send("You do not have access to the results of " + pollData.name + " until after the poll has closed")
    return false
  }
  if ((userAccessData || roleAccessData).accessTime && Date.now() < (userAccessData || roleAccessData).accessTime.toMillis())
  {
    msg && msg.channel.send("You do not have access to the results of " + pollData.name + " until " + (new Date((userAccessData || roleAccessData).accessTime.toMillis())).toString())
    return false
  }

  return true
}

import { Parser } from "json2csv"
import { MessageAttachment } from "discord.js"

export async function executeExportPollResultsCommand(user: User, pollID: string, firestoreDB: Firestore)
{
  var dmChannel = user.dmChannel || await user.createDM()
  if (!dmChannel) { return }

  var pollResultsCollection = await firestoreDB.collection(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID).get()

  var formattedPollResults = []

  pollResultsCollection.forEach((pollResultDoc) => {
    let pollResultJSON = pollResultDoc.data()

    if (!pollResultJSON.responseMap) { return }

    formattedPollResults.push({timestamp: pollResultJSON.updatedAt, responseMap: pollResultJSON.responseMap})
  })

  var responseMapKeys = new Set(["timestamp"])
  formattedPollResults = formattedPollResults.map((pollResponseData) => {
    Object.keys(pollResponseData.responseMap).forEach((responseMapKey) => {
      let responseValueID = pollResponseData.responseMap[responseMapKey]

      let currentQuestionData = pollsData[pollID].questions.find(questionData => questionData.id == responseMapKey)
      let currentOptionData = currentQuestionData ? currentQuestionData.options.find(optionData => optionData.id == responseValueID) : null

      let questionKey = currentQuestionData ? currentQuestionData.prompt : responseMapKey
      responseMapKeys.add(questionKey)

      pollResponseData[questionKey] = currentOptionData ? currentOptionData.name : responseValueID
    })
    delete pollResponseData.responseMap

    return pollResponseData
  })
  var responseMapKeyArray = Array.from(responseMapKeys)

  formattedPollResults.sort((pollResult1, pollResult2) => pollResult1.timestamp-pollResult2.timestamp)
  responseMapKeyArray.sort((questionID1, questionID2) => {
    let questionIndex1 = pollsData[pollID].questions.findIndex(questionData => questionData.id == questionID1)
    let questionIndex2 = pollsData[pollID].questions.findIndex(questionData => questionData.id == questionID2)

    return questionIndex1-questionIndex2
  })

  var pollResultsCSVParser = new Parser({fields: responseMapKeyArray})
  var pollResultsCSV = pollResultsCSVParser.parse(formattedPollResults)

  var pollResultsCSVFilename = "poll-results-" + pollID + ".csv"
  var csvMessageAttachment = new MessageAttachment(Buffer.from(pollResultsCSV, 'utf-8'), pollResultsCSVFilename)
  dmChannel.send({
    files: [csvMessageAttachment]
  })
}

export function getEmoji(client: Client, emoteName: string)
{
  var emoji = client.emojis.cache.find(emoji => emoji.name == emoteName)
  if (emoji != null)
  {
    return emoji.id
  }

  var emote = emojiConverter.get(":" + emoteName + ":")
  if (emote != null && !emote.includes(":"))
  {
    return emote
  }

  return overrideEmoteNameToEmojiMap[emoteName] ?? null
}

export function getEmoteName(emoji: GuildEmoji | ReactionEmoji)
{
  return overrideEmojiToEmoteNameMap[emoji.toString()] ?? emojiConverter.unemojify(emoji.name).replace(/:/g, '')
}
