const bbSettingPrefix = "%BetaBot"
const bbRolePrefix = "role:"
const bbVoiceToTextChannelPrefix = "voicetotext:"
const bbStatsPrefix = "stats:"

const kAddedReaction = 0
const kRemovedReaction = 1

// Update Roles

async function setRole(user, guild, roleName, shouldAddRole)
{
  var guildRoles = await guild.roles.fetch()
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


// Role Messages

import { v4 } from 'uuid'
import emojiConverter from 'node-emoji'

var roleAddMessageData = []
var roleReationCollectors = {}

export const interpretRoleSetting = async function(client, message)
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
    roleDataJSON.uuid = v4()

    editOriginalMessage = true
  }

  if (roleDataJSON.messageID == null && roleDataJSON.channelID != null)
  {
    await sendRoleAddMessage(client, roleDataJSON)

    editOriginalMessage = true
  }
  else if (roleDataJSON.messageID != null && roleDataJSON.channelID != null)
  {
    await editRoleAddMessage(client, roleDataJSON)
  }

  if (editOriginalMessage && message.author.id == client.user.id)
  {
    message.edit(bbSettingPrefix + " " + bbRolePrefix + " " + JSON.stringify(roleDataJSON))
  }

  if (roleDataJSON.messageID != null && roleDataJSON.channelID != null)
  {
    var channel = await client.channels.fetch(roleDataJSON.channelID)
    var liveMessage = await channel.messages.fetch(roleDataJSON.messageID)

    var catchAllFilter = () => true

    var reactionCollector = liveMessage.createReactionCollector({ catchAllFilter, dispose: true })
    reactionCollector.on('collect', async (reaction, user) => {
      await user.fetch()
      console.log("Add", reaction.emoji.name, user.username)
      handleRoleReaction(client, reaction, user, kAddedReaction)
    })
    reactionCollector.on('remove', async (reaction, user) => {
      await user.fetch()
      console.log("Remove", reaction.emoji.name, user.username)
      handleRoleReaction(client, reaction, user, kRemovedReaction)
    })

    roleReationCollectors[roleDataJSON.uuid] = reactionCollector
  }

  return true
}

async function sendRoleAddMessage(client, roleDataJSON)
{
  var channel = await client.channels.fetch(roleDataJSON.channelID)
  var messageContent = getRoleAddMessageContent(roleDataJSON)
  var sentMessage = await channel.send(messageContent)
  roleDataJSON.messageID = sentMessage.id

  for (let emoteName in roleDataJSON.roleMap)
  {
    var emoteID = getEmoteID(emoteName)
    if (emoteID == null) { continue }
    sentMessage.react(emoteID)
  }
}

async function editRoleAddMessage(client, roleDataJSON)
{
  var channel = await client.channels.fetch(roleDataJSON.channelID)
  var message = await channel.messages.fetch(roleDataJSON.messageID)
  var messageContent = getRoleAddMessageContent(roleDataJSON)

  if (message.content != messageContent)
  {
    await message.edit(messageContent)

    for (let emoteName in roleDataJSON.roleMap)
    {
      var emoteID = getEmoteID(client, emoteName)
      if (emoteID == null) { continue }
      message.react(emoteID)
    }
  }
}

function getRoleAddMessageContent(roleDataJSON)
{
  var messageContent = "**" + roleDataJSON.name + "**"
  for (let emoteName in roleDataJSON.roleMap)
  {
    messageContent += "\n"
    var roleName = roleDataJSON.roleMap[emoteName]
    messageContent += ":" + emoteName + ": \\: " + roleName
  }
  return messageContent
}

function getEmoteID(client, emoteName)
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

async function handleRoleReaction(client, reaction, user, action)
{
  if (user.id == client.user.id) { return false }

  var foundMessageID = false
  var roleData
  for (let dataNum in roleAddMessageData)
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

const randomColorRoleName = "random"

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

function updateRandomColorRole(client)
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


// Voice to text channel

var voiceToTextChannelMap = {}

export const interpretVoiceToTextChannelSetting = async function(message)
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

export const setupVoiceChannelEventHandler = function(client)
{
  client.on('voiceStateUpdate', async (oldState, newState) => {
    var prevTextChannelName
    if (oldState.channelId != null)
    {
      var textChannelIDToFind = voiceToTextChannelMap[oldState.channelId]
      var prevTextChannel = await oldState.guild.channels.fetch(textChannelIDToFind)
      prevTextChannelName = prevTextChannel != null ? prevTextChannel.name : null
    }
    var newTextChannelName
    if (newState.channelId != null)
    {
      var textChannelIDToFind = voiceToTextChannelMap[newState.channelId]
      var newTextChannel = await newState.guild.channels.fetch(textChannelIDToFind)
      newTextChannelName = newTextChannel != null ? newTextChannel.name : null
    }

    if (oldState.channelId == null && newState.channelId != null && newTextChannelName != null)
    {
      setRole(newState.member.user, newState.guild, newTextChannelName, true)
    }
    else if (oldState.channelId != null && newState.channelId == null && prevTextChannelName != null)
    {
      setRole(oldState.member.user, oldState.guild, prevTextChannelName, false)
    }
    else if (oldState.channelId != newState.channelId && prevTextChannelName != null && newTextChannelName != null)
    {
      setRole(oldState.member.user, oldState.guild, prevTextChannelName, false)
      setRole(newState.member.user, newState.guild, newTextChannelName, true)
    }
  })
}


// Member Stats

var statsData = {}

export const interpretStatsSetting = async function(client, message)
{
  if (!message.content.startsWith(bbSettingPrefix + " " + bbStatsPrefix)) { return false }

  var statsDataString = message.content.replace(bbSettingPrefix + " " + bbStatsPrefix, "")
  var statsDataJSON
  try {
    statsDataJSON = JSON.parse(statsDataString)
  } catch (e) {
    console.log(e)
    return false
  }

  statsData[statsDataJSON.id] = statsDataJSON

  client.guilds.fetch(statsDataJSON.id).then(guild => {
    updateTotalMembersStat(guild)
    updateOnlineMembersStat(guild)
    updateBoostMembersStat(guild)
  }).catch(console.error)
}

export const setupMemberStatsEventHandlers = function(client)
{
  client.on('guildMemberAdd', (member) => {
    // Update members stat
    if (member == null || member.guild == null) { return }
    updateTotalMembersStat(member.guild)
  })

  client.on('guildMemberRemove', (member) => {
    // Update members stat
    if (member == null || member.guild == null) { return }
    updateTotalMembersStat(member.guild)
  })

  client.on('presenceUpdate', (member) => {
    // Update online stat
    if (member == null || member.guild == null) { return }
    updateOnlineMembersStat(member.guild) // Not using this for updates
  })

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Update boost stat
    if (oldMember == null || oldMember.guild == null) { return }
    updateBoostMembersStat(oldMember.guild)
  })
}

function updateTotalMembersStat(guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.totalCountChannelID == null) { return }

  var totalCount = guild.memberCount

  updateStatChannelName(guild, guildStatsSettings.totalCountChannelID, totalCount)
}

async function updateOnlineMembersStat(guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.onlineCountChannelID == null) { return }

  if (guildStatsSettings.lastOnlineCountFetch != null && Date.now()-guildStatsSettings.lastOnlineCountFetch < 1000*60*10)
  {
    return
  }
  guildStatsSettings.lastOnlineCountFetch = Date.now()

  var guildMembers = await guild.members.fetch()
  var onlineCount = guildMembers.filter(m => m.presence != null && m.presence.status != "offline").size

  updateStatChannelName(guild, guildStatsSettings.onlineCountChannelID, onlineCount)
}

function updateBoostMembersStat(guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.boostCountChannelID == null) { return }

  var boostCount = guild.premiumSubscriptionCount

  updateStatChannelName(guild, guildStatsSettings.boostCountChannelID, boostCount)
}

async function updateStatChannelName(guild, channelID, statValue)
{
  let channelToUpdate = await guild.channels.fetch(channelID)
  if (channelToUpdate == null) { return }

  let currentChannelName = channelToUpdate.name
  let newChannelName = currentChannelName.replace(/\d+/, statValue)
  await channelToUpdate.setName(newChannelName)
}
