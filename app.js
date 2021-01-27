const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const CREATOR_USER_ID = process.env.CREATOR_USER_ID
const DISCORD_NICKNAME = process.env.DISCORD_NICKNAME

const logfile = 'betabot.log'
const endLogMessage = "logout"
const isLocalProcess = process.argv[2] == "local"
const spawn = require('child_process').spawn
const fs = require('fs')

const Discord = require('discord.js')
const client = new Discord.Client()

//var sql = require("./sql.js")

var messageResponses = [
  { pattern: "(\\W|\\s+|^)[bruh]{4,}(\\W|\\s+|$)", responses: ["bruh"] }
]

var messageCommands = [
  { command: "cook", responses: ["🍕", "🍿", "🍤", "🍣", "🍪", "🍣", "🍔", "🥐", "🥓", "🍱", "🍩", "🍰", "🍳", "🧇", "🥨", "🥞", "🍉", "🥫", "🌮", "🌭", "🥪", "🍚", "🥠"] },
  { command: "roast me", responses: ["nah bro"] },
  { command: "thanks", responses: ["ofc bro", "np", "dont mention it", "thank you!", ":)", "you\'re welcome"] },
  { command: "make it rain", responses: ["\\*in british\\* £££9739797210100000000", ":chart_with_upwards_trend: *støønks*"] },
  { command: "sad", responses: ["\\:("] }
]

var dates = [
  { name: "Misty Not Rated", timestamp: 1586139240000, command: "misty" },
  { name: "Birthday", timestamp: 1597993200000, command: "birf" }
]

var loginMessage
var loginChannelID
var loginGuildID

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)

  loginMessageBreak:
  {
    if (loginMessage && loginChannelID && loginGuildID)
    {
      var guild = client.guilds.cache.get(loginGuildID)
      if (!guild) { break loginMessageBreak }
      var channel = guild.channels.cache.get(loginChannelID)
      if (!channel) { break loginMessageBreak }

      channel.send(loginMessage)
    }
  }

  client.user.setPresence({status: "online"})

  client.guilds.cache.forEach((guild) => {
    var member = guild.member(client.user)
    updateNickname(member)
  })
})

client.on('guildMemberUpdate', (oldMember, newMember) => {
  var clientMember = newMember.guild.member(client.user)
  if (newMember.id !== clientMember.id) { return }

  updateNickname(clientMember)
})

function updateNickname(clientMember)
{
  if (clientMember.displayName !== DISCORD_NICKNAME)
  {
    console.log("Updated name in " + clientMember.guild.name + " from " + clientMember.displayName + " to " + DISCORD_NICKNAME)
    clientMember.setNickname(DISCORD_NICKNAME)
  }
}

client.on('message', async msg => {
  if (msg.author.id == client.user.id)
  {
    console.log("Sent '" + msg.content + "' in " + msg.guild.name)
    return
  }

  if (client.user.presence.status === "idle")
  {
    client.user.setPresence({status: "online"})
    msg.channel.send("\\*yawn\\*")
  }

  //console.log("message? -" + msg.content + "-" + msg.id)

  if (sendMessageResponses(msg)) { return }

  var messageContent = msg.content.toLowerCase()
  if (messageContent.startsWith("$"))
  {
    messageContent = messageContent.substr(1)
  }
  else if (msg.mentions.members.has(client.user.id))
  {
    messageContent = messageContent.replace("<@!" + client.user.id + ">", "")
  }
  else { return }

  messageContent = messageContent.replace(/^\s*/, "").replace(/\s*$/, "")

  if (sendMessageCommands(msg, messageContent)) { return }
  if (sendDateCommands(msg, messageContent)) { return }

  if (sendRepeatCommand(msg, messageContent)) { return }
  if (sendSpeakCommand(msg, messageContent)) { return }

  switch (messageContent)
  {
    case "info":
    msg.channel.send(`βəτα Bot Dev 1.0\nCreated by <@${CREATOR_USER_ID}>\nwith inspiration from We4therman\n*\\*Powered By DELL OS\\**`)
    break

    case "logout":
    await prepareBotLogout("Bye bye for now!", msg)
    console.log(endLogMessage)

    if (isLocalProcess && fs.existsSync(logfile))
    {
      fs.unlinkSync(logfile)
      fs.writeFileSync(logfile, endLogMessage + "\n")
      fs.unlinkSync(logfile)
    }

    client.destroy()
    break

    case "restart":
    prepareBotLogout("Bye bye for now!", msg)
      .then(client.destroy())
      .then(loginBot("And we're back!", msg.channel.id, msg.guild.id))
    break

    case "reboot":
    rebootBot("Bye bye for now!", "And we're back!", msg)
    break

    case "sleep":
    msg.channel.send("zzz")
    client.user.setPresence({status: "idle"})
    break
  }
})

function sendMessageResponses(msg)
{
  var messageContent = msg.content.toLowerCase()

  for (responseNum in messageResponses)
  {
    var pattern = messageResponses[responseNum].pattern
    if (testRegex(messageContent, pattern))
    {
      var index = Math.floor((Math.random() * messageResponses[responseNum].responses.length))
      msg.channel.send(messageResponses[responseNum].responses[index])
      return true
    }
  }

  return false
}

function testRegex(string, pattern)
{
  var regex = new RegExp(pattern)
  return regex.test(string)
}

function sendDateCommands(msg, messageContent)
{
  for (dateNum in dates)
  {
    if (messageContent == dates[dateNum].command)
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

function sendMessageCommands(msg, messageContent)
{
  for (commandNum in messageCommands)
  {
    if (messageContent == messageCommands[commandNum].command)
    {
      var index = Math.floor((Math.random() * messageCommands[commandNum].responses.length))
      msg.channel.send(messageCommands[commandNum].responses[index])
      return true
    }
  }

  return false
}

function sendRepeatCommand(msg, messageContent)
{
  if (/^repeat\s*(\d*)$/.test(messageContent))
  {
    var multiplier = parseInt(/^repeat\s*(\d*)$/.exec(messageContent)[1]) || 1 //parseInt(messageContent.replace("repeat", "")) || 1
    var messageArray = msg.channel.messages.cache.array()
    if (messageArray.length >= 2)
    {
      for (i=0; i < multiplier; i++)
      {
        msg.channel.send(messageArray[messageArray.length-2])
      }
    }
    return true
  }

  return false
}

function sendSpeakCommand(msg, messageContent)
{
  if (/^speak\s(.+)$/.test(messageContent))
  {
    var phraseToSay = /^speak\s(.+)$/.exec(messageContent)[1]
    msg.channel.send(phraseToSay, {tts: true})
    return true
  }

  return false
}

function prepareBotLogout(logoutMessage, msg)
{
  var logoutBotPromise = new Promise(async (resolve, reject) => {
    await msg.channel.send(logoutMessage)
    await client.user.setPresence({status: "dnd"})
    resolve()
  })

  return logoutBotPromise
}

async function rebootBot(logoutMessage, loginMessage, msg)
{
  if (!isLocalProcess)
  {
    msg.channel.send("Cannot reboot bot.")
    return
  }

  await prepareBotLogout(logoutMessage, msg)

  spawnBot(loginMessage, msg)

  client.destroy()
}

function spawnBot(loginMessage, msg)
{
  var out = fs.openSync(logfile, 'a')
  var err = fs.openSync(logfile, 'a')

  var newProcessEnv = Object.assign(process.env, { process_restarting: 1, loginMessage: loginMessage, loginChannelID: msg.channel.id, loginGuildID: msg.guild.id })

  spawn(process.argv[0], process.argv.slice(1), {
    detached: true,
    env: newProcessEnv,
    stdio: ['ignore', out, err]
  }).unref()
}

async function loginBot(message, channelID, guildID)
{
  if (process.env.process_restarting)
  {
    delete process.env.process_restarting

    var message = process.env.loginMessage
    var channelID = process.env.loginChannelID
    var guildID = process.env.loginGuildID

    setTimeout(function() {
      loginBot(message, channelID, guildID)
    }, 1000)

    return
  }

  loginMessage = message
  loginChannelID = channelID
  loginGuildID = guildID

  client.login(DISCORD_TOKEN)
}

loginBot()
