import { Client, Message } from "discord.js"

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

const dates = [
  // { name: "Misty Not Rated", timestamp: 1586139240000, command: "misty" },
  { name: "Birthday", timestamp: 1597993200000, command: "birf" },
  { name: "Finals are over!!! :partying_face:", timestamp: 1639209600000, command: "finals" }
]

export const sendDateCommands = function(msg: Message, messageContent: string)
{
  for (let dateNum in dates)
  {
    if (messageContent.toLowerCase() == dates[dateNum].command)
    {
      var millisDifference = Math.abs(Date.now()-dates[dateNum].timestamp)
      var days = Math.floor(millisDifference/(1000*60*60*24))
      var hours = Math.floor((millisDifference-days*1000*60*60*24)/(1000*60*60))
      var minutes = Math.floor((millisDifference-days*1000*60*60*24-hours*1000*60*60)/(1000*60))
      msg.channel.send(dates[dateNum].name + ": " + (Math.sign(Date.now()-dates[dateNum].timestamp) == -1 ? "-" : "") + days + " days, " + hours + " hours, and " + minutes + " minutes")

      return true
    }
  }

  return false
}

export const sendMessageCommands = function(msg: Message, messageContent: string)
{
  for (let commandNum in messageCommands)
  {
    if (messageContent.toLowerCase() == messageCommands[commandNum].command)
    {
      var index = Math.floor((Math.random() * messageCommands[commandNum].responses.length))
      msg.channel.send(messageCommands[commandNum].responses[index])
      return true
    }
  }

  return false
}

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

export const sendEmoteSpellCommand = async function(msg: Message, messageContent: string)
{
  const spellCommandRegex = /^spell\s+([a-zA-Z]+)(\s+((<)?:[^\s:]+?:(\d+>)?))?(\s+((<)?:[^\s:]+?:(\d+>)?))?$/
  if (spellCommandRegex.test(messageContent.toLowerCase()))
  {
    let spellRegexGroups = spellCommandRegex.exec(messageContent)

    let wordToSpell = spellRegexGroups[1].toUpperCase()

    if (wordToSpell.length > 10)
    {
      await msg.channel.send("that's too long m'dude")
      return
    }

    let fillEmote = spellRegexGroups[3] ?? ":white_large_square:"
    let backgroundEmote = spellRegexGroups[7] ?? ":black_large_square:"

    let spaceLineMessage = backgroundEmote + " " + backgroundEmote + " " + backgroundEmote + " "

    for (let currentCharacter of wordToSpell.split(""))
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

        await msg.channel.send(letterLineMessage)
      }

      await msg.channel.send(spaceLineMessage)
    }

    return true
  }

  return false
}

export const sendClearCommand = async function(client: Client, msg: Message, messageContent: string)
{
  var dmChannel = msg.author.dmChannel || await msg.author.createDM()

  if (/^clear$/.test(messageContent.toLowerCase()))
  {
    let dmMessages = await dmChannel.messages.fetch()
    dmMessages.forEach((message) => {
      if (message.author.id == client.user.id)
      {
        message.delete()
      }
    })

    return true
  }
  else if (/^clear\s+(\d*)$/.test(messageContent.toLowerCase()))
  {
    let clearMessageAmount = parseInt(/^clear\s*(\d*)$/.exec(messageContent)[1])
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

  return false
}

export const sendRepeatCommand = function(msg: Message, messageContent: string)
{
  if (/^repeat\s+(\d+)$/.test(messageContent.toLowerCase()))
  {
    var multiplier = parseInt(/^repeat\s+(\d+)$/.exec(messageContent)[1]) || 1 //parseInt(messageContent.replace("repeat", "")) || 1
    var messageArray = msg.channel.messages.cache.toJSON()
    if (messageArray.length >= 2)
    {
      for (let i=0; i < multiplier; i++)
      {
        msg.channel.send(messageArray[messageArray.length-2].toString())
      }
    }
    return true
  }

  return false
}

export const sendSpeakCommand = function(msg: Message, messageContent: string)
{
  if (/^speak\s(.+)$/.test(messageContent.toLowerCase()))
  {
    var phraseToSay = /^speak\s(.+)$/.exec(messageContent)[1]
    msg.channel.send({content: phraseToSay, tts: true})
    return true
  }

  return false
}
