import { Client, Message } from "discord.js"
import { BotCommand, BotCommandError } from "./botCommand"

const messageCommands = [
  { command: "hi", responses: ["hello :wave:"] },
  { command: "cook", responses: ["🍕", "🍿", "🍤", "🍣", "🍪", "🍣", "🍔", "🥐", "🥓", "🍱", "🍩", "🍰", "🍳", "🧇", "🥨", "https://i.imgur.com/LOoSSoK.jpeg", "🍉", "🥫", "🌮", "🌭", "🥪", "🍚", "🥠"] },
  { command: "roast me", responses: ["nah bro"] },
  { command: "thanks", responses: ["ofc bro", "np", "dont mention it", "thank you!", ":)", "you\'re welcome"] },
  { command: "make it rain", responses: ["\\*in british\\* £££9739797210100000000", ":chart_with_upwards_trend: *støønks*"] },
  { command: "sad", responses: ["\\:("] },
  { command: "flip", responses: [":b:", ":robot:"] },
  { command: "d6", responses: [":one:", ":two:", ":three:", ":four:", ":five:", ":six:"] },
  { command: "d20", responses: [":one:", ":two:", ":three:", ":four:", ":five:", ":six:", ":seven:", ":eight:", ":nine:", ":one::zero:", ":one::one:", ":one::two:", ":one::three:", ":one::four:", ":one::five:", ":one::six:", ":one::seven:", ":one::eight:", ":one::nine:", ":two::zero:"] }
]

const dateCommands = [
  // { name: "Misty Not Rated", timestamp: 1586139240000, command: "misty" },
  { name: "Birthday", timestamp: 1597993200000, command: "birf" },
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

export const getMessageCommands = function(): BotCommand[]
{
  return messageCommands.map(messageCommandData => {
    return BotCommand.fromRegex(
      messageCommandData.command, "gives a message",
      new RegExp("^" + messageCommandData.command + "$"), null,
      messageCommandData.command,
      async (_, message: Message, __, ___) => {
        let index = Math.floor((Math.random() * messageCommandData.responses.length))
        await message.channel.send(messageCommandData.responses[index])
      }
    )
  })
}

export const getDateCommands = function(): BotCommand[]
{
  return dateCommands.map(dateCommandData => {
    return BotCommand.fromRegex(
      dateCommandData.command, "gives a date",
      new RegExp("^" + dateCommandData.command + "$"), null,
      dateCommandData.command,
      async (_, message: Message, __, ___) => {
        let millisDifference = Math.abs(Date.now()-dateCommandData.timestamp)
        let days = Math.floor(millisDifference/(1000*60*60*24))
        let hours = Math.floor((millisDifference-days*1000*60*60*24)/(1000*60*60))
        let minutes = Math.floor((millisDifference-days*1000*60*60*24-hours*1000*60*60)/(1000*60))
        await message.channel.send(dateCommandData.name + ": " + (Math.sign(Date.now()-dateCommandData.timestamp) == -1 ? "-" : "") + days + " days, " + hours + " hours, and " + minutes + " minutes")
      }
    )
  })
}

export const getEmoteSpellCommand = function(): BotCommand
{
  return BotCommand.fromRegex(
    "spell", "spells a word using emotes",
    /^spell\s+([a-zA-Z]+)(\s+((<)?:[^\s:]+?:(\d+>)?))?(\s+((<)?:[^\s:]+?:(\d+>)?))?$/, /^spell(\s+.*)?$/,
    "spell <word> [interior emote] [exterior emote]",
    async (commandArguments: string[], message: Message, __, ___) => {
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

export const getClearCommand = function(): BotCommand
{
  return BotCommand.fromRegex(
    "clear", "clears bot messages from DMs",
    /^clear(\s+(\d+))?$/, /^clear(\s+.*)?$/,
    "clear [message count]",
    async (commandArguments: string[], message: Message, client: Client, ___) => {
      let dmChannel = message.author.dmChannel || await message.author.createDM()

      let clearMessageAmount = parseInt(commandArguments[2] ?? "100")
      let dmMessages = await dmChannel.messages.fetch()
      dmMessages.forEach((message) => {
        if (clearMessageAmount <= 0) { return }
        if (message.author.id == client.user.id)
        {
          message.delete()
          clearMessageAmount -= 1
        }
      })
    }
  )
}

export const getRepeatCommand = function(): BotCommand
{
  return BotCommand.fromRegex(
    "repeat", "repeats the last message sent to the channel",
    /^repeat\s+(\d+)$/, /^repeat(\s+.*)?$/,
    "repeat [count]",
    async (commandArguments: string[], message: Message, __, ___) => {
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

export const getSpeakCommand = function(): BotCommand
{
  return BotCommand.fromRegex(
    "speak", "reads the last message sent to the channel in tts",
    /^speak\s+(.+)$/, null,
    "speak [message]",
    async (commandArguments: string[], message: Message, __, ___) => {
      let phraseToSay = commandArguments[1]
      message.channel.send({content: phraseToSay, tts: true})
    }
  )
}
