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

import emojiConverter from 'node-emoji'

var roleAddMessageData = []
var roleReationCollectors = {}

export const interpretRoleSetting = async function(client, roleSettingID, roleSettingJSON)
{
  if (roleSettingJSON.channelID == null) { return }

  roleAddMessageData.push(roleSettingJSON)

  var updateSettingInDatabase = false

  if (roleSettingJSON.messageID == null)
  {
    await sendRoleAddMessage(client, roleSettingJSON)

    updateSettingInDatabase = true
  }
  else if (roleSettingJSON.messageID != null)
  {
    await editRoleAddMessage(client, roleSettingJSON)
  }

  if (roleSettingJSON.messageID != null)
  {
    var channel = await client.channels.fetch(roleSettingJSON.channelID)
    var liveMessage = await channel.messages.fetch(roleSettingJSON.messageID)

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

    roleReationCollectors[roleSettingID] = reactionCollector
  }

  return updateSettingInDatabase
}

async function sendRoleAddMessage(client, roleDataJSON)
{
  var channel = await client.channels.fetch(roleDataJSON.channelID)
  var messageContent = getRoleAddMessageContent(roleDataJSON)
  var sentMessage = await channel.send(messageContent)
  roleDataJSON.messageID = sentMessage.id

  for (let emoteRolePair of roleDataJSON.roleMap)
  {
    var emoteID = getEmoteID(client, emoteRolePair.emote)
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

    for (let emoteRolePair of roleDataJSON.roleMap)
    {
      var emoteID = getEmoteID(client, emoteRolePair.emote)
      if (emoteID == null) { continue }
      message.react(emoteID)
    }
  }
}

function getRoleAddMessageContent(roleDataJSON)
{
  var messageContent = "**" + roleDataJSON.name + "**"
  for (let emoteRolePair of roleDataJSON.roleMap)
  {
    messageContent += "\n"
    messageContent += ":" + emoteRolePair.emote + ": \\: " + emoteRolePair.role
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

  var roleData = roleAddMessageData.find((roleData) => roleData.messageID == reaction.message.id)

  if (!roleData) { return false }

  var emoteName = emojiConverter.unemojify(reaction.emoji.name).replace(/:/g, '')
  var emoteRolePair = roleData.roleMap.find((emoteRolePair) => emoteRolePair.emote == emoteName)

  if (!emoteRolePair)
  {
    if (action == kAddedReaction)
    {
      reaction.users.remove(user.id)
    }
    return false
  }

  await setRole(user, reaction.message.guild, emoteRolePair.role, action == kAddedReaction ? true : false)

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
