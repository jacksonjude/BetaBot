import { Client, Message, Collection, DMChannel, TextChannel, GuildChannel, CategoryChannel, PermissionResolvable } from "discord.js"
import { BotCommand, BotCommandError } from "./botCommand"

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
    async (commandArguments: string[], message: Message) => {
      let shouldDisplayCommandsWithRequirements = commandArguments[2] === "false" ? false : true
      let commandToDisplay = commandArguments[4]

      if (!commandToDisplay)
      {
        let helpMessageString = "__**Commands**__"
        for (let command of botCommands)
        {
          if (command.executionRequirement && !shouldDisplayCommandsWithRequirements) { continue }
          if (command.executionRequirement && !command.executionRequirement.testMessage(message)) { continue }
          helpMessageString += "\n" + "**" + command.name + "**: *" + command.description + "*"
        }
        message.channel.send(helpMessageString)
      }
      else
      {
        let foundCommand = botCommands.find(command => command.parseCommandString(commandToDisplay) !== false)
        if (foundCommand)
        {
          await message.channel.send("**" + foundCommand.name + "**: *" + foundCommand.description + "*")
          foundCommand.usageMessage && await message.channel.send(foundCommand.usageMessage)
        }
        else
        {
          message.channel.send("**Error: " + "'" + commandToDisplay + "' command not found" + "**")
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
        await message.channel.send(messageCommandData.responses[index])
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
        await message.channel.send(dateCommandData.name + ": " + (Math.sign(Date.now()-dateCommandData.timestamp) == -1 ? "-" : "") + days + " days, " + hours + " hours, and " + minutes + " minutes")
      }
    )
  })
}

export function getEmoteSpellCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "spell", "spell a word using emotes",
    /^spell\s+([a-zA-Z]+)(\s+((<)?:[^\s:]+?:(\d+>)?))?(\s+((<)?:[^\s:]+?:(\d+>)?))?$/, /^spell(\s+.*)?$/,
    "spell <word> [interior emote] [exterior emote]",
    async (commandArguments: string[], message: Message) => {
      let wordToSpell = commandArguments[1]

      if (wordToSpell.length > 10)
      {
        return new BotCommandError("that's too long m'dude", false)
      }

      let fillEmote = commandArguments[3] ?? ":white_large_square:"
      let backgroundEmote = commandArguments[7] ?? ":black_large_square:"

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

          await message.channel.send(letterLineMessage)
        }

        await message.channel.send(spaceLineMessage)
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

        allowedToClearAllMessages = (channelToClear as TextChannel).permissionsFor(memberToClearThrough).has("MANAGE_MESSAGES")
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
    /^echo(?:\s+(?:<#)?(\d+)(?:>)?)?\s+(.+)$/, /^echo(\s+.*)?$/,
    "echo [channel] <message>",
    async (commandArguments: string[], message: Message, client: Client) => {
      let channel = commandArguments[1] ? await client.channels.fetch(commandArguments[1]) as TextChannel : message.channel as TextChannel
      if (!channel.permissionsFor(message.member).has("SEND_MESSAGES")) { return }

      let messageToRepeat = commandArguments[2]

      await channel.send(messageToRepeat)
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
      let messageArray = message.channel.messages.cache.toJSON()
      if (messageArray.length >= 2)
      {
        for (let i=0; i < multiplier; i++)
        {
          message.channel.send(messageArray[messageArray.length-2].toString())
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
      let phraseToSay = commandArguments[1]
      message.channel.send({content: phraseToSay, tts: true})
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
    /^close(?:\s+(channel|category))?\s+(?:<#)?(\d+)(?:>)?(?:\s+(?:<@!?&?)?(\d+)(?:>)?)?(?:\s(true|false))?$/, /^close(\s+.*)?$/,
    "close [channel | category] <channel id> [role id] [verbose]",
    async (commandArguments: string[], commandMessage: Message) => {
      let closeType = commandArguments[1] as "channel" | "category" ?? "channel"
      let channelID = commandArguments[2]
      let role = commandArguments[3] ? await commandMessage.guild.roles.fetch(commandArguments[3]) : commandMessage.guild.roles.everyone
      let shouldPrintLogs = commandArguments[4] !== "false"
      let channelsToClose: GuildChannel[] = []

      switch (closeType)
      {
        case "channel":
        let channel = await commandMessage.guild.channels.fetch(channelID)
        if (channel)
        {
          channelsToClose = [channel]
        }
        break

        case "category":
        let category = await commandMessage.guild.channels.fetch(channelID) as CategoryChannel
        if (category)
        {
          channelsToClose = [category, ...Array.from(category.children.values()).filter(channel => !channel.permissionsLocked)]
        }
        break
      }

      for (let channel of channelsToClose)
      {
        let permissionsToToggle: PermissionResolvable[]
        switch (channel.type)
        {
          case "GUILD_TEXT":
          permissionsToToggle = ["SEND_MESSAGES"]
          break

          case "GUILD_VOICE":
          case "GUILD_STAGE_VOICE":
          permissionsToToggle = ["CONNECT"]
          break

          case "GUILD_CATEGORY":
          permissionsToToggle = ["SEND_MESSAGES", "CONNECT"]
          break

          default:
          return
        }

        let modeToSet = !channel.permissionsFor(role).has(permissionsToToggle[0])

        let permissionsMap: {[k: string]: boolean} = {}
        permissionsToToggle.forEach(permission => {
          permissionsMap[permission.toString()] = modeToSet
        })

        console.log(permissionsMap, channel.id, role.id)

        try
        {
          await channel.permissionOverwrites.edit(role, permissionsMap)
        }
        catch (error)
        {
          console.log(error)
          continue
        }

        shouldPrintLogs && await commandMessage.channel.send((modeToSet ? ":white_check_mark: Opened" : ":x: Closed") + " " + (channel.type === "GUILD_CATEGORY" ? channel.name : "<#" + channel.id + ">") + " for <@&" + role.id + ">")
      }
    }
  )
}
