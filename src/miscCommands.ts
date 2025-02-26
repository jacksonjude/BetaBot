import { Client, Message, Collection, DMChannel, TextChannel, GuildChannel, CategoryChannel, PermissionResolvable, PermissionFlagsBits, ChannelType } from "discord.js"
import { BotCommand, BotCommandError } from "./botCommand"
import { HandleCommandExecution, Emote } from "./util"

import { roleGroups } from "./roleGroup"

const messageCommands = [
  { command: "hi", description: "say hello", responses: ["hello :wave:"] },
  { command: "cook", description: "cook food", responses: ["🍕", "🍿", "🍤", "🍣", "🍪", "🍣", "🍔", "🥐", "🥓", "🍱", "🍩", "🍰", "🍳", "🧇", "🥨", "https://i.imgur.com/LOoSSoK.jpeg", "🍉", "🥫", "🌮", "🌭", "🥪", "🍚", "🥠"] },
  { command: "roast me", description: "might burn", responses: ["nah bro"] },
  { command: "thanks", description: "reciprocate politeness", responses: ["ofc bro", "np", "dont mention it", "thank you!", ":)", "you\'re welcome"] },
  { command: "make it rain", description: "generate stacks", responses: ["\\*in british\\* £££9739797210100000000", ":chart_with_upwards_trend: *støønks*"] },
  { command: "sad", description: "wallow in melancholy", responses: ["\\:("] },
  { command: "flip", description: "flip a special coin", responses: [":b:", ":robot:"] },
  { command: "d6", description: "roll a d6", responses: [":one:", ":two:", ":three:", ":four:", ":five:", ":six:"] },
  { command: "d20", description: "roll a d20", responses: [":one:", ":two:", ":three:", ":four:", ":five:", ":six:", ":seven:", ":eight:", ":nine:", ":one::zero:", ":one::one:", ":one::two:", ":one::three:", ":one::four:", ":one::five:", ":one::six:", ":one::seven:", ":one::eight:", ":one::nine:", ":two::zero:"] }
]

const dateCommands = [
  { name: "Birthday", description: "the point of creation", timestamp: 1591728780000, command: "birf" },
  // { name: "Misty Not Rated", timestamp: 1586139240000, command: "misty" },
  // { name: "Finals are over!!! :partying_face:", timestamp: 1639209600000, command: "finals" }
]

const letterBitmaps = {
  A: [
    "010",
    "101",
    "111",
    "101",
    "101"
  ],
  B: [
    "110",
    "101",
    "111",
    "101",
    "110"
  ],
  C: [
    "111",
    "100",
    "100",
    "100",
    "111"
  ],
  D: [
    "110",
    "101",
    "101",
    "101",
    "110"
  ],
  E: [
    "111",
    "100",
    "110",
    "100",
    "111"
  ],
  F: [
    "111",
    "100",
    "110",
    "100",
    "100"
  ],
  G: [
    "111",
    "100",
    "100",
    "101",
    "111"
  ],
  H: [
    "101",
    "101",
    "111",
    "101",
    "101"
  ],
  I: [
    "111",
    "010",
    "010",
    "010",
    "111"
  ],
  J: [
    "111",
    "010",
    "010",
    "010",
    "110"
  ],
  K: [
    "101",
    "101",
    "110",
    "101",
    "101"
  ],
  L: [
    "100",
    "100",
    "100",
    "100",
    "111"
  ],
  M: [],
  N: [],
  O: [
    "111",
    "101",
    "101",
    "101",
    "111"
  ],
  P: [
    "111",
    "101",
    "111",
    "100",
    "100"
  ],
  Q: [],
  R: [
    "110",
    "101",
    "110",
    "101",
    "101"
  ],
  S: [
    "111",
    "100",
    "111",
    "001",
    "111"
  ],
  T: [
    "111",
    "010",
    "010",
    "010",
    "010"
  ],
  U: [
    "101",
    "101",
    "101",
    "101",
    "111"
  ],
  V: [
    "101",
    "101",
    "101",
    "101",
    "010"
  ],
  W: [],
  X: [
    "101",
    "101",
    "010",
    "101",
    "101"
  ],
  Y: [
    "101",
    "101",
    "010",
    "010",
    "010"
  ],
  Z: [
    "111",
    "001",
    "010",
    "100",
    "111"
  ]
}

export function getHelpCommand(botCommands: BotCommand[]): BotCommand
{
  return BotCommand.fromRegex(
    "help", "get help for commands",
    /^help(\s+(true|false))?(\s+(\w+))?$/, null,
    "help [command]",
    async (commandArguments: string[], message: Message, _client, _firestoreDB) => {
      let shouldDisplayCommandsWithRequirements = commandArguments[2] === "false" ? false : true
      let commandToDisplay = commandArguments[4]

      if (!commandToDisplay)
      {
        let helpMessageString = "__**Commands**__"
        for (let command of botCommands)
        {
          if (command.executionRequirement && !shouldDisplayCommandsWithRequirements) { continue }
          if (command.executionRequirement && !command.executionRequirement.testMessage(message, false)) { continue }
          helpMessageString += "\n" + "**" + command.name + "**: *" + command.description + "*"
        }
        (message.channel as TextChannel).send(helpMessageString)
      }
      else
      {
        let foundCommand = botCommands.find(command => command.parseCommandString(commandToDisplay) !== false)
        if (foundCommand)
        {
          await (message.channel as TextChannel).send("**" + foundCommand.name + "**: *" + foundCommand.description + "*")
          foundCommand.usageMessage && await (message.channel as TextChannel).send(foundCommand.usageMessage)
        }
        else
        {
          (message.channel as TextChannel).send("**Error: " + "'" + commandToDisplay + "' command not found" + "**")
        }
      }
    }
  )
}

export function getMessageCommands(): BotCommand[]
{
  return messageCommands.map(messageCommandData => {
    return BotCommand.fromRegex(
      messageCommandData.command, messageCommandData.description ?? "give a message",
      new RegExp("^" + messageCommandData.command + "$"), null,
      messageCommandData.command,
      async (_, message: Message) => {
        let index = Math.floor((Math.random() * messageCommandData.responses.length))
        await (message.channel as TextChannel).send(messageCommandData.responses[index])
      }
    )
  })
}

export function getDateCommands(): BotCommand[]
{
  return dateCommands.map(dateCommandData => {
    return BotCommand.fromRegex(
      dateCommandData.command, dateCommandData.description ?? "give a date",
      new RegExp("^" + dateCommandData.command + "$"), null,
      dateCommandData.command,
      async (_, message: Message) => {
        let millisDifference = Math.abs(Date.now()-dateCommandData.timestamp)
        let days = Math.floor(millisDifference/(1000*60*60*24))
        let hours = Math.floor((millisDifference-days*1000*60*60*24)/(1000*60*60))
        let minutes = Math.floor((millisDifference-days*1000*60*60*24-hours*1000*60*60)/(1000*60))
        await (message.channel as TextChannel).send(dateCommandData.name + ": " + (Math.sign(Date.now()-dateCommandData.timestamp) == -1 ? "-" : "") + days + " days, " + hours + " hours, and " + minutes + " minutes")
      }
    )
  })
}

export function getEmoteSpellCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "spell", "spell a word using emotes",
    /^spell\s+([a-zA-Z]+)(?:\s+([^\s]+))?(?:\s+([^\s]+))?$/, /^spell(\s+.*)?$/,
    "spell <word (a-z)> [interior emote] [exterior emote]",
    async (commandArguments: string[], message: Message, client: Client) => {
      let wordToSpell = commandArguments[1]

      if (wordToSpell.length > 10)
      {
        return new BotCommandError("that's too long m'dude", false)
      }

      let fillEmote = commandArguments[2] ?? ":white_large_square:"
      let backgroundEmote = commandArguments[3] ?? ":black_large_square:"
      
      if (!(await Emote.isValidEmote(fillEmote, client)) || !(await Emote.isValidEmote(backgroundEmote, client)))
      {
        return new BotCommandError("not emotes m'dude", false)
      }
  
      let spaceLineMessage = backgroundEmote + " " + backgroundEmote + " " + backgroundEmote + " "

      for (let currentCharacter of wordToSpell.toUpperCase().split(""))
      {
        if (!letterBitmaps[currentCharacter]) { continue }

        for (let letterBitmapLine of letterBitmaps[currentCharacter])
        {
          let letterLineMessage = ""

          for (let letterBitCell of letterBitmapLine.split(""))
          {
            letterLineMessage += letterBitCell == "1" ? fillEmote : backgroundEmote
            letterLineMessage += " "
          }

          await (message.channel as TextChannel).send(letterLineMessage)
        }

        await (message.channel as TextChannel).send(spaceLineMessage)
      }
    }
  )
}

export function getClearCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "clear", "clear bot messages",
    /^clear(\s+(dm|\d+))?(\s+(\d+))?(\s+(true|false))?$/, /^clear(\s+.*)?$/,
    "clear [dm | channel id] [message count] [should clear all]",
    async (commandArguments: string[], commandMessage: Message, client: Client) => {
      const processMessages = async function(channelMessageArray: Message[]): Promise<boolean>
      {
        if (!commandArguments[4] && commandMessage.reference)
        {
          let endpointMessage: Message
          try
          {
            endpointMessage = await channelToClear.messages.fetch(commandMessage.reference.messageId)
          }
          catch {}
          if (!endpointMessage) { return }

          let foundEndpointMessage = false
          for (let channelMessage of channelMessageArray)
          {
            if (channelMessage.id == endpointMessage.id)
            {
              foundEndpointMessage = true
              break
            }
            if ((channelMessage.author.id == client.user.id && (allowedToClearAllMessages || userIsOwner)) || (shouldClearAll && channelMessage.author.id == commandMessage.author.id) || (shouldClearAll && allowedToClearAllMessages))
            {
              channelMessage.delete()
            }
          }

          return foundEndpointMessage
        }
        else
        {
          let clearMessageAmount = parseInt(commandArguments[4] ?? "10")

          let reachedClearMessageCount = false
          for (let channelMessage of channelMessageArray)
          {
            if (clearMessageAmount <= 0)
            {
              reachedClearMessageCount = true
              break
            }
            if ((channelMessage.author.id == client.user.id && (allowedToClearAllMessages || userIsOwner)) || (shouldClearAll && channelMessage.author.id == commandMessage.author.id) || (shouldClearAll && allowedToClearAllMessages))
            {
              channelMessage.delete()
              clearMessageAmount -= 1
            }
          }

          return reachedClearMessageCount
        }
      }

      let channelToClear: DMChannel | TextChannel
      try
      {
        if (commandArguments[2] == "dm")
        {
          channelToClear = commandMessage.author.dmChannel ?? await commandMessage.author.createDM()
        }
        else if (/\d+/.test(commandArguments[2]))
        {
          channelToClear = await client.channels.fetch(commandArguments[2]) as TextChannel
        }
      }
      catch {}
      channelToClear ??= commandMessage.channel as TextChannel
      let shouldClearAll = commandArguments[6] === "true" ? true : false

      let allowedToClearAllMessages: boolean
      if (commandArguments[2] != "dm" && (channelToClear as TextChannel).guildId == commandMessage.guildId)
      {
        let memberToClearThrough = (channelToClear as TextChannel).members.find((member) => {
          return member.user.id == commandMessage.author.id
        })
        if (!memberToClearThrough) { return }

        allowedToClearAllMessages = (channelToClear as TextChannel).permissionsFor(memberToClearThrough).has(PermissionFlagsBits.ManageMessages)
      }
      let userIsOwner = process.env.CREATOR_USER_ID == commandMessage.author.id

      let channelMessages: Collection<string,Message>
      try
      {
        channelMessages = await channelToClear.messages.fetch({limit: 100})
      }
      catch (error)
      {
        return
      }

      let shouldBreakMessageLoop = false
      while (channelMessages.size > 0 && !shouldBreakMessageLoop)
      {
        shouldBreakMessageLoop = await processMessages(Array.from(channelMessages.values()))

        if (channelMessages.size > 0 && channelMessages.last().id)
        {
          try
          {
            channelMessages = await channelToClear.messages.fetch({before: channelMessages.last().id, limit: 100})
          }
          catch
          {
            shouldBreakMessageLoop = true
          }
        }
      }
    }
  )
}

export function getEchoCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "echo", "print a message to a channel",
    /^echo(?:\s+(?:<#)?(\d+)(?:>)?)?(?:\s+(true|false))?\s+(.+)$/, /^echo(\s+.*)?$/,
    "echo [channel] [doAttachments] <message>",
    async (commandArguments: string[], message: Message, client: Client) => {
      const channel = commandArguments[1] ? await client.channels.fetch(commandArguments[1]) as TextChannel : message.channel as TextChannel
      
      if (message.member != null && !channel.permissionsFor(message.member).has(PermissionFlagsBits.SendMessages)) { return }
      
      const shouldSendAttachments = commandArguments[2] === "true" ? true : false

      const messageToRepeat = commandArguments[3]

      if (shouldSendAttachments)
      {
        await channel.send({
          content: messageToRepeat,
          files: Array.from(message.attachments.values())
        })
      }
      else
      {
        await channel.send(messageToRepeat)
      }
    }
  )
}

export function getRepeatCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "repeat", "repeat the last message sent to the channel",
    /^repeat\s+(\d+)$/, /^repeat(\s+.*)?$/,
    "repeat <count>",
    async (commandArguments: string[], message: Message) => {
      let multiplier = parseInt(commandArguments[1])
      let messageArray = (message.channel as TextChannel).messages.cache.toJSON()
      if (messageArray.length >= 2)
      {
        for (let i=0; i < multiplier; i++)
        {
          (message.channel as TextChannel).send(messageArray[messageArray.length-2].toString())
        }
      }
    }
  )
}

export function getSpeakCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "speak", "read a message in tts",
    /^speak\s+(.+)$/, /^speak(\s+.*)?$/,
    "speak <message>",
    async (commandArguments: string[], message: Message) => {
      let phraseToSay = commandArguments[1];
      (message.channel as TextChannel).send({content: phraseToSay, tts: true})
    }
  )
}

export function getCleanReactionsCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "cleanreactions", "remove obsolete message reactions",
    /^cleanreactions$/, null,
    "cleanreactions",
    async (_, message: Message) => {
      if (!message.reference || message.reference.guildId != message.guildId) { return }

      await message.guild.members.fetch()

      let messageChannel = await message.guild.channels.fetch(message.reference.channelId) as TextChannel
      if (!messageChannel) { return }

      let messageToClean = await messageChannel.messages.fetch(message.reference.messageId)
      if (!messageToClean) { return }

      for (let reaction of Array.from(messageToClean.reactions.cache.values()))
      {
        await reaction.users.fetch()
        let reactionUsers = Array.from(reaction.users.cache.values())
        for (let user of reactionUsers)
        {
          console.log("[Clean-Reactions] Checking", user.username, reaction.emoji.name)
          if (!message.guild.members.cache.some(member => member.user.id == user.id))
          {
            console.log("[Clean-Reactions] Removing", user.username, reaction.emoji.name)
            await reaction.users.remove(user)
          }
        }
      }

      console.log("[Clean-Reactions] Complete")
    }
  )
}

export function getCloseChannelsCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "close", "closes channels or categories",
    /^close((?:\s+<#\d+>)+)((?:\s+<@!?&?\d+>)*)(?:\s*(true|false))?$/, /^close(\s+.*)?$/,
    "close <channel ids> [role ids] [verbose]",
    async (commandArguments: string[], commandMessage: Message) => {
      let closeType: string = "channel"
      let channelIDsString = commandArguments[1]
      let roleIDsString = commandArguments[2]
      let shouldPrintLogs = commandArguments[3] !== "false"

      let channelIDs = []
      for (let channelIDString of channelIDsString.split(/\s+/))
      {
        let channelIDGroups = /\s*<#(\d+)>\s*/.exec(channelIDString)
        if (channelIDGroups && channelIDGroups.length > 1)
        {
          channelIDs.push(channelIDGroups[1])
        }
      }

      let roles = []
      if (!roleIDsString)
      {
        roles = [commandMessage.guild.roles.everyone]
      }
      else
      {
        for (let roleIDString of roleIDsString.split(/\s+/))
        {
          let roleIDGroups = /\s*<@!?&?(\d+)>\s*/.exec(roleIDString)
          if (!roleIDGroups || roleIDGroups.length <= 1) { continue }

          let roleObject = await commandMessage.guild.roles.fetch(roleIDGroups[1])
          if (!roleObject) { continue }
          roles.push(roleObject)
        }
      }

      let channelsToClose: GuildChannel[] = []

      switch (closeType)
      {
        case "channel":
        for (let channelID of channelIDs)
        {
          let channel = await commandMessage.guild.channels.fetch(channelID)
          if (channel)
          {
            channelsToClose.push(channel as GuildChannel)
          }
        }
        break

        case "category":
        let category = await commandMessage.guild.channels.fetch(channelIDs[0]) as CategoryChannel
        if (category)
        {
          channelsToClose = [category, ...Array.from(category.children.cache.values()).filter(channel => !channel.permissionsLocked)]
        }
        break
      }

      for (let channel of channelsToClose)
      {
        let permissionsToToggle: PermissionResolvable[]
        switch (channel.type)
        {
          case ChannelType.GuildText:
          permissionsToToggle = [PermissionFlagsBits.SendMessages]
          break

          case ChannelType.GuildVoice:
          case ChannelType.GuildStageVoice:
          permissionsToToggle = [PermissionFlagsBits.Connect]
          break

          case ChannelType.GuildCategory:
          permissionsToToggle = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]
          break

          default:
          return
        }

        for (let role of roles)
        {
          let modeToSet = !channel.permissionsFor(role).has(permissionsToToggle[0])

          let permissionsMap: {[k: string]: boolean} = {}
          permissionsToToggle.forEach(permission => {
            permissionsMap[permission.toString()] = modeToSet
          })

          try
          {
            await channel.permissionOverwrites.edit(role, permissionsMap)
          }
          catch (error)
          {
            console.log(error)
            continue
          }

          shouldPrintLogs && await (commandMessage.channel as TextChannel).send((modeToSet ? ":white_check_mark: Opened" : ":x: Closed") + " " + (channel.type === ChannelType.GuildCategory ? channel.name : "<#" + channel.id + ">") + " for <@&" + role.id + ">")
        }
      }
    }
  )
}

export function getRerunCommand(handleCommandExecutionFunction: HandleCommandExecution) : BotCommand
{
  return BotCommand.fromRegex(
    "rerun", "re-run a command",
    /^rerun$/, /^rerun(\s+.*)?$/,
    "rerun",
    async (_, message: Message, client: Client) => {
      let messageChannel = message.reference ? await client.channels.fetch(message.reference.channelId) as TextChannel : message.channel as TextChannel
      let previousCommandMessage = message.reference ? await messageChannel.messages.fetch(message.reference.messageId) : (await messageChannel.messages.fetch()).at(1)

      if (!previousCommandMessage) { return new BotCommandError("Message not found", false) }

      await handleCommandExecutionFunction(previousCommandMessage.content.replace(/<@!?&?\d+?>/, "").replace(/^\s*/, "").replace(/\s*$/, ""), message, false)

      await message.delete()
    }
  )
}

export function getReactCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "react", "react to a message",
    /^react(?:\s+([^\s]+))?$/, /^react(\s+.*)?$/,
    "react [emote]",
    async (commandArguments: string[], message: Message, client: Client) => {
      if (!message.reference) { return }
      let referencedMessage = await (message.channel as TextChannel).messages.fetch(message.reference.messageId)

      let rawEmoteString = commandArguments[1]
      if (rawEmoteString)
      {
        let emote = Emote.fromEmoji(rawEmoteString)
        await referencedMessage.react(await emote.toEmoji(client))
        return
      }

      referencedMessage = await referencedMessage.fetch(true)

      let messageReactions = Array.from(referencedMessage.reactions.cache.values())
      for (let reaction of messageReactions)
      {
        let users = await reaction.users.fetch()
        if (users.has(client.user.id)) { continue }
        await referencedMessage.react(reaction.emoji)
      }
    }
  )
}

export function getPingCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "ping", "ping the role for this channel",
    /^ping$/, null,
    "ping",
    async (_, message: Message) => {
      const serverID = message.guildId
      const channelID = message.channelId
      const channel = message.channel as TextChannel
      
      for (let roleGroup of Object.values(roleGroups))
      {
        if (roleGroup.serverID != serverID) { continue }
        
        for (let roleTuple of roleGroup.getRoleTuples())
        {
          if (roleTuple.channelID == channelID)
          {
            await channel.send(`<@&${roleTuple.roleID}>`)
            await message.delete()
            return
          }
        }
      }
    }
  )
}