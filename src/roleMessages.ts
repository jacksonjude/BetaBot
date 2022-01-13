import { Client, User, Guild, TextChannel, MessageReaction, Message } from "discord.js"
import { ActionMessage, MessageReactionEventType } from "./actionMessage"
import * as emojiConverter from 'node-emoji'

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

var roleActionMessages: { [k: string]: ActionMessage<RoleMessageConfiguration> } = {}

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

  let updateSettingInDatabase = false

  let liveChannel = await client.channels.fetch(roleSettingJSON.channelID) as TextChannel
  let roleSettingActionMessage = new ActionMessage<RoleMessageConfiguration>(
    liveChannel,
    roleSettingJSON.messageID,
    roleSettingJSON,
    (roleSettingJSON: RoleMessageConfiguration, channel: TextChannel) => {
      return getRoleAddMessageContent(roleSettingJSON, channel.guild)
    }, async (message: Message, roleSettingJSON: RoleMessageConfiguration) => {
      roleSettingJSON.messageID = message.id
      for (let emoteRolePair of roleSettingJSON.roleMap)
      {
        try
        {
          message.react(emoteRolePair.emote)
        }
        catch {}
      }
    }, (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, roleSettingJSON: RoleMessageConfiguration) => {
      handleRoleReaction(client, reaction, user, reactionEventType, roleSettingJSON)
    }
  )

  await roleSettingActionMessage.initActionMessage()
  roleActionMessages[roleSettingID] = roleSettingActionMessage

  return updateSettingInDatabase
}

export async function removeRoleSetting(roleSettingID: string)
{
  if (roleActionMessages[roleSettingID])
  {
    await roleActionMessages[roleSettingID].removeActionMessage()
    delete roleActionMessages[roleSettingID]
  }
}

async function getRoleAddMessageContent(roleDataJSON: RoleMessageConfiguration, guild: Guild)
{
  var messageContent = "**" + roleDataJSON.name + "**"
  for (let emoteRolePair of roleDataJSON.roleMap)
  {
    let roleObject = await guild.roles.fetch(emoteRolePair.role)
    messageContent += "\n"
    messageContent += (emoteRolePair.emote.containsEmoji() ? emoteRolePair.emote : ":" + emoteRolePair.emote + ":") + " \\: " + (roleObject ? roleObject.name : emoteRolePair.role)
  }
  return messageContent
}

async function handleRoleReaction(client: Client, reaction: MessageReaction, user: User, action: MessageReactionEventType, roleData: RoleMessageConfiguration)
{
  if (user.id == client.user.id) { return false }

  var emoteRolePair = roleData.roleMap.find((emoteRolePair) => {
    return emoteRolePair.emote == reaction.emoji.name
     || emoteRolePair.emote.charCodeAt(0).toString()+emoteRolePair.emote.charCodeAt(1).toString() == reaction.emoji.name.charCodeAt(0).toString()+reaction.emoji.name.charCodeAt(1).toString()
     || emojiConverter.unemojify(reaction.emoji.name).replace(/:/g, "") == emoteRolePair.emote
  })

  if (!emoteRolePair)
  {
    if (action == "added")
    {
      reaction.users.remove(user.id)
    }
    return false
  }

  await setRole(user, reaction.message.guild, emoteRolePair.role, action == "added" ? true : false)

  return true
}
