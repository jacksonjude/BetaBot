import { Client, User, Guild, TextChannel, MessageReaction, ReactionCollector } from "discord.js"

const kAddedReaction = 0
const kRemovedReaction = 1

// Update Roles

export async function setRole(user: User, guild: Guild, roleID: string, shouldAddRole: boolean)
{
  var guildRoles = await guild.roles.fetch()
  var rolesArray = Array.from(guildRoles.values())

  var roleObject = rolesArray.find(roleToTest => roleToTest.id == roleID)
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

import * as emojiConverter from 'node-emoji'

var roleAddMessageData: { [k: string]: RoleMessageConfiguration } = {}
var roleReationCollectors: { [k: string]: ReactionCollector } = {}

export class RoleMessageConfiguration
{
  name: string
  channelID: string
  messageID: string | null
  roleMap: RoleEmoteMap[]
}

class RoleEmoteMap
{
  role: string
  emote: string
}

export async function interpretRoleSetting(client: Client, roleSettingID: string, roleSettingJSON: RoleMessageConfiguration)
{
  if (roleSettingJSON.channelID == null) { return }

  roleAddMessageData[roleSettingID] = roleSettingJSON

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
    var channel = await client.channels.fetch(roleSettingJSON.channelID) as TextChannel
    var liveMessage = await channel.messages.fetch(roleSettingJSON.messageID)

    var catchAllFilter = () => true

    var reactionCollector = liveMessage.createReactionCollector({ filter: catchAllFilter, dispose: true })
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

export async function removeRoleSetting(client: Client, roleSettingID: string, roleSettingJSON: RoleMessageConfiguration)
{
  if (roleSettingJSON.messageID)
  {
    var channel = await client.channels.fetch(roleSettingJSON.channelID) as TextChannel
    var message = await channel.messages.fetch(roleSettingJSON.messageID)

    await message.delete()
  }

  if (roleAddMessageData[roleSettingID])
  {
    delete roleAddMessageData[roleSettingID]
  }

  if (roleReationCollectors[roleSettingID])
  {
    roleReationCollectors[roleSettingID].stop()
    delete roleReationCollectors[roleSettingID]
  }
}

async function sendRoleAddMessage(client: Client, roleDataJSON: RoleMessageConfiguration)
{
  var channel = await client.channels.fetch(roleDataJSON.channelID) as TextChannel
  var messageContent = await getRoleAddMessageContent(roleDataJSON, channel.guild)
  var sentMessage = await channel.send(messageContent)
  roleDataJSON.messageID = sentMessage.id

  for (let emoteRolePair of roleDataJSON.roleMap)
  {
    var emoteID = getEmoteID(client, emoteRolePair.emote)
    if (emoteID == null) { continue }
    sentMessage.react(emoteID)
  }
}

async function editRoleAddMessage(client: Client, roleDataJSON: RoleMessageConfiguration)
{
  var channel = await client.channels.fetch(roleDataJSON.channelID) as TextChannel
  var message = await channel.messages.fetch(roleDataJSON.messageID)
  var messageContent = await getRoleAddMessageContent(roleDataJSON, channel.guild)

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

async function getRoleAddMessageContent(roleDataJSON: RoleMessageConfiguration, guild: Guild)
{
  var messageContent = "**" + roleDataJSON.name + "**"
  for (let emoteRolePair of roleDataJSON.roleMap)
  {
    let roleObject = await guild.roles.fetch(emoteRolePair.role)
    messageContent += "\n"
    messageContent += ":" + emoteRolePair.emote + ": \\: " + roleObject ? roleObject.name : emoteRolePair.role
  }
  return messageContent
}

function getEmoteID(client: Client, emoteName: string)
{
  var emoji = client.emojis.cache.find(emoji => emoji.name == emoteName)
  if (emoji != null)
  {
    return emoji.id
  }

  var emoteString = emojiConverter.get(":" + emoteName + ":")
  if (emoteString != null && !emoteString.includes(":"))
  {
    return emoteString
  }

  return null
}

async function handleRoleReaction(client: Client, reaction: MessageReaction, user: User, action: number)
{
  if (user.id == client.user.id) { return false }

  var roleData = Object.values(roleAddMessageData).find((roleData) => roleData.messageID == reaction.message.id)

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

// const randomColorRoleName = "random"
//
// function startRandomColorRoleInterval()
// {
//   var now = new Date();
//   var millisTillMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 18, 0) - now;
//   if (millisTillMidnight < 1000) {
//     millisTillMidnight += 86400000
//   }
//   setTimeout(() => {
//     startRandomColorRoleInterval()
//   }, millisTillMidnight);
// }
//
// function updateRandomColorRole(client)
// {
//   var randomRGB = [Math.floor(Math.random()*256), Math.floor(Math.random()*256), Math.floor(Math.random()*256)]
//
//   client.guilds.cache.each(async guild => {
//     var roles = await guild.roles.fetch()
//     var randomRole = roles.cache.find(role => role.name == randomColorRoleName)
//     if (randomRole == null) { return }
//
//     randomRole.setColor(randomRGB)
//   })
//
//   console.log("Set @random to ", randomRGB)
// }
