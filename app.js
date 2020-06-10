const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const CREATOR_USER_ID = process.env.CREATOR_USER_ID
const DISCORD_NICKNAME = process.env.DISCORD_NICKNAME

const logfile = 'betabot.log'
const endLogMessage = "logout"

const isLocalProcess = process.argv[2] == "local"

const Discord = require('discord.js')
const client = new Discord.Client()

const spawn = require('child_process').spawn
const fs = require('fs')

var sql = require("./sql.js")

var messageResponses = {
  "(\\W|\\s+|^)[bruh]{4,}(\\W|\\s+|$)": "bruh"
}

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
  if (!sendMessageResponses(msg))
  {
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

    switch (messageContent)
    {
      case "info":
      msg.channel.send(`βəτα Bot Dev 1.0\nCreated by <@${CREATOR_USER_ID}>\nwith some inspiration from We4therman`)
      break

      case "logout":
      await prepareBotLogout("Bye bye for now!", msg)
      console.log(endLogMessage)

      if (isLocalProcess)
      {
        fs.unlinkSync(logfile)
        fs.writeFileSync(logfile, endLogMessage + "\n")
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
  }
})

function sendMessageResponses(msg)
{
  var messageContent = msg.content.toLowerCase()

  for (patternNum in Object.keys(messageResponses))
  {
    var pattern = Object.keys(messageResponses)[patternNum]
    if (testRegex(messageContent, pattern))
    {
      msg.channel.send(messageResponses[pattern])
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
  await prepareBotLogout(logoutMessage, msg)

  spawnBot(loginMessage, msg)

  client.destroy()
}

function spawnBot(loginMessage, msg)
{
  fs.unlinkSync(logfile)
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
