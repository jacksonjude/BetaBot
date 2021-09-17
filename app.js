const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const CREATOR_USER_ID = process.env.CREATOR_USER_ID
const DISCORD_NICKNAME = process.env.DISCORD_NICKNAME

const logfile = 'betabot.log'
const endLogMessage = "logout"
const isLocalProcess = process.argv[2] == "local"
const spawn = require('child_process').spawn
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const emojiConverter = require('node-emoji')

const Discord = require('discord.js')
const client = new Discord.Client({ partials: ['USER'] })

const technicianRoleName = "technician"
const randomColorRoleName = "random"

// PARTIALS: https://github.com/discordjs/discord.js/issues/4980#issuecomment-723519865

//var sql = require("./sql.js")

var botSettingsChannelIDs = [
  "738578711510646856" // sekret in negativity ("704218896298934317")
]

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

var roleAddMessageData = [
  // { uuid: "4bf00a66-8b51-43d3-9e28-3d532c23a50f", messageID: null, name: "Color Roles", roleMap: {"red_circle":"red", "orange_circle":"orange", "yellow_circle":"yellow", "green_circle":"green", "blue_circle":"blue", "purple_circle":"purple", "grey_question":"random"} }
]

var roleReationCollectors = {

}

var voiceToTextChannelMap = {}

var loginMessage
var loginChannelID
var loginGuildID

client.on('ready', async () => {
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

  for (channelNum in botSettingsChannelIDs)
  {
    var channel = client.channels.cache.get(botSettingsChannelIDs[channelNum])
    var pinnedMessages = await channel.messages.fetchPinned()

    pinnedMessages.sort((msg1, msg2) => msg1.createdTimestamp - msg2.createdTimestamp)

    pinnedMessages.each(async message => {
      if (message.author.id != client.user.id)
      {
        var newMessage = await message.channel.send(message.content)
        newMessage.pin()
        message.delete()
        message = newMessage
      }

      if (await interpretRoleSetting(message)) { return }
      if (await interpretVoiceToTextChannelSetting(message)) { return }
    })
  }

  startRandomColorRoleInterval()
})

const bbSettingPrefix = "%BetaBot"
const bbRolePrefix = "role:"
const bbVoiceToTextChannelPrefix = "voicetotext:"

const kAddedReaction = 0
const kRemovedReaction = 1

async function interpretRoleSetting(message)
{
  if (!message.content.startsWith(bbSettingPrefix + " " + bbRolePrefix)) { return false }

  var roleDataString = message.content.replace(bbSettingPrefix + " " + bbRolePrefix, "")
  var roleDataJSON
  try {
    roleDataJSON = JSON.parse(roleDataString)
  } catch (e) {
    console.log(e)
    return false
  }

  roleAddMessageData.push(roleDataJSON)

  var editOriginalMessage = false

  if (roleDataJSON.uuid == null)
  {
    roleDataJSON.uuid = uuid()

    editOriginalMessage = true
  }

  if (roleDataJSON.messageID == null && roleDataJSON.channelID != null)
  {
    await sendRoleAddMessage(roleDataJSON)

    editOriginalMessage = true
  }

  if (editOriginalMessage && message.author.id == client.user.id)
  {
    message.edit(bbSettingPrefix + " " + bbRolePrefix + " " + JSON.stringify(roleDataJSON))
  }

  if (roleDataJSON.messageID != null && roleDataJSON.channelID != null)
  {
    var channel = client.channels.cache.get(roleDataJSON.channelID)
    var memberCache = channel.guild.members.cache
    var liveMessage = await channel.messages.fetch(roleDataJSON.messageID)

    var reactionCollector = liveMessage.createReactionCollector(() => true, { dispose: true })
    reactionCollector.on('collect', async (reaction, user) => {
      await user.fetch()
      console.log("Add", reaction.emoji.name, user.username)
      handleRoleReaction(reaction, user, kAddedReaction)
    })
    reactionCollector.on('remove', async (reaction, user) => {
      await user.fetch()
      console.log("Remove", reaction.emoji.name, user.username)
      handleRoleReaction(reaction, user, kRemovedReaction)
    })

    roleReationCollectors[roleDataJSON.uuid] = reactionCollector
  }

  return true
}

async function sendRoleAddMessage(roleDataJSON)
{
  var channel = client.channels.cache.get(roleDataJSON.channelID)

  var messageContent = "**" + roleDataJSON.name + "**"
  for (emoteName in roleDataJSON.roleMap)
  {
    messageContent += "\n"
    var roleName = roleDataJSON.roleMap[emoteName]
    messageContent += ":" + emoteName + ": \\: " + roleName
  }

  var sentMessage = await channel.send(messageContent)
  roleDataJSON.messageID = sentMessage.id

  for (emoteName in roleDataJSON.roleMap)
  {
    var emoteID = getEmoteID(emoteName)
    if (emoteID == null) { continue }
    sentMessage.react(emoteID)
  }
}

function getEmoteID(emoteName)
{
  var emote = client.emojis.cache.find(emoji => emoji.name == emoteName)
  if (emote != null)
  {
    return emote.id
  }

  emote = emojiConverter.get(":" + emoteName + ":")
  if (emote != null && !emote.includes(":"))
  {
    return emote
  }

  return null
}

function startRandomColorRoleInterval()
{
  var now = new Date();
  var millisTillMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 18, 0) - now;
  if (millisTillMidnight < 1000) {
    millisTillMidnight += 86400000
  }
  setTimeout(() => {
    startRandomColorRoleInterval()
  }, millisTillMidnight);
}

function updateRandomColorRole()
{
  var randomRGB = [Math.floor(Math.random()*256), Math.floor(Math.random()*256), Math.floor(Math.random()*256)]

  client.guilds.cache.each(async guild => {
    var roles = await guild.roles.fetch()
    var randomRole = roles.cache.find(role => role.name == randomColorRoleName)
    if (randomRole == null) { return }

    randomRole.setColor(randomRGB)
  })

  console.log("Set @random to ", randomRGB)
}

async function interpretVoiceToTextChannelSetting(message)
{
  if (!message.content.startsWith(bbSettingPrefix + " " + bbVoiceToTextChannelPrefix)) { return false }

  var voiceToTextChannelDataString = message.content.replace(bbSettingPrefix + " " + bbVoiceToTextChannelPrefix, "")
  var voiceToTextChannelDataJSON
  try {
    voiceToTextChannelDataJSON = JSON.parse(voiceToTextChannelDataString)
  } catch (e) {
    console.log(e)
    return false
  }

  voiceToTextChannelMap = voiceToTextChannelDataJSON
}

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
  //console.log(msg.channel.id + " :: " + msg.content)

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

  if (sendExportCommand(msg, messageContent)) { return }

  switch (messageContent)
  {
    case "info":
    msg.channel.send(`βəτα Bot Dev 1.0\nCreated by <@${CREATOR_USER_ID}>\nwith inspiration from We4therman\n*\\*Powered By DELL OS\\**`)
    break

    case "ping":
    msg.channel.send("pong")
    break
  }

  if (!msg.member.roles.cache.find(role => role.name == technicianRoleName)) { return }

  switch (messageContent)
  {
    case "randomize":
    updateRandomColorRole()
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

function sendExportCommand(msg, messageContent)
{
  if (/^export\s(.+)$/.test(messageContent))
  {
    var settingToExport = /^export\s(.+)$/.exec(messageContent)[1]

    switch (settingToExport)
    {
      case "roles":
      for (roleNum in roleAddMessageData)
      {
        msg.channel.send(bbSettingPrefix + " " + bbRolePrefix + " " + JSON.stringify(roleAddMessageData[roleNum]))
      }
      return true
    }
  }

  return false
}

async function handleRoleReaction(reaction, user, action)
{
  if (user.id == client.user.id) { return false }

  var foundMessageID = false
  var roleData
  for (dataNum in roleAddMessageData)
  {
    roleData = roleAddMessageData[dataNum]
    if (roleData.messageID == reaction.message.id)
    {
      foundMessageID = true
      break
    }
  }

  if (!foundMessageID) { return false }

  var emoteName = emojiConverter.unemojify(reaction.emoji.name).replace(/:/g, '')

  if (!Object.keys(roleData.roleMap).includes(emoteName))
  {
    if (action == kAddedReaction)
    {
      reaction.users.remove(user.id)
    }
    return false
  }

  var roleName = roleData.roleMap[emoteName]
  await setRole(user, reaction.message.guild, roleName, action == kAddedReaction ? true : false)

  return true
}

async function setRole(user, guild, roleName, shouldAddRole)
{
  var guildRoles = (await guild.roles.fetch()).cache

  var rolesArray = Array.from(guildRoles.values())
  var roleObject = rolesArray.find(roleToTest => roleToTest.name == roleName)

  if (roleObject == null) { return false }

  var guildMember = await guild.members.fetch(user)

  if (shouldAddRole)
  {
    guildMember.roles.add(roleObject)
  }
  else
  {
    guildMember.roles.remove(roleObject)
  }

  return true
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  var prevTextChannelName
  if (oldState.channelID != null)
  {
    var textChannelIDToFind = voiceToTextChannelMap[oldState.channelID]
    var prevTextChannel = oldState.guild.channels.cache.get(textChannelIDToFind)
    prevTextChannelName = prevTextChannel != null ? prevTextChannel.name : null
  }
  var newTextChannelName
  if (newState.channelID != null)
  {
    var textChannelIDToFind = voiceToTextChannelMap[newState.channelID]
    var newTextChannel = newState.guild.channels.cache.get(textChannelIDToFind)
    newTextChannelName = newTextChannel != null ? newTextChannel.name : null
  }

  if (oldState.channelID == null && newState.channelID != null && newTextChannelName != null)
  {
    setRole(newState.member.user, newState.guild, newTextChannelName, true)
  }
  else if (oldState.channelID != null && newState.channelID == null && prevTextChannelName != null)
  {
    setRole(oldState.member.user, oldState.guild, prevTextChannelName, false)
  }
  else if (oldState.channelID != newState.channelID && prevTextChannelName != null && newTextChannelName != null)
  {
    setRole(oldState.member.user, oldState.guild, prevTextChannelName, false)
    setRole(newState.member.user, newState.guild, newTextChannelName, true)
  }
})


// Reboot Methods

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
