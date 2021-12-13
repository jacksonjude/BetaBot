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

export const sendDateCommands = function(msg, messageContent)
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

export const sendMessageCommands = function(msg, messageContent)
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

export const sendClearCommand = async function(client, msg, messageContent)
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
  else if (/^clear\s*(\d*)$/.test(messageContent.toLowerCase()))
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

export const sendRepeatCommand = function(msg, messageContent)
{
  if (/^repeat\s*(\d*)$/.test(messageContent.toLowerCase()))
  {
    var multiplier = parseInt(/^repeat\s*(\d*)$/.exec(messageContent)[1]) || 1 //parseInt(messageContent.replace("repeat", "")) || 1
    var messageArray = msg.channel.messages.cache.array()
    if (messageArray.length >= 2)
    {
      for (let i=0; i < multiplier; i++)
      {
        msg.channel.send(messageArray[messageArray.length-2])
      }
    }
    return true
  }

  return false
}

export const sendSpeakCommand = function(msg, messageContent)
{
  if (/^speak\s(.+)$/.test(messageContent.toLowerCase()))
  {
    var phraseToSay = /^speak\s(.+)$/.exec(messageContent)[1]
    msg.channel.send(phraseToSay, {tts: true})
    return true
  }

  return false
}
