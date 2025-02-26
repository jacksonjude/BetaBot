import { Client, User, TextChannel, MessageReaction, Message } from "discord.js"
import { ActionMessage, MessageReactionEventType } from "./actionMessage"
import { RoleArray, RoleGroup, RoleObjectTuple } from "./roleGroup"

import { setRole, Emote } from "./util"

// Role Messages

var roleActionMessages: { [k: string]: ActionMessage<RoleMessageConfiguration> } = {}

export class RoleMessageConfiguration
{
  name: string
  channelID: string
  messageID: string | null
  roleMap: RoleArray
  blacklistUserIDs: string[]
}

export async function interpretRoleSetting(client: Client, roleSettingID: string, roleSettingJSON: RoleMessageConfiguration)
{
  if (roleSettingJSON.channelID == null) { return }
  
  if (roleActionMessages[roleSettingID])
  {
    await roleActionMessages[roleSettingID].removeActionMessage(false)
  }

  let prevMessageID = roleSettingJSON.messageID
  let liveChannel = await client.channels.fetch(roleSettingJSON.channelID) as TextChannel
  let roleObjectTuples = await RoleGroup.getRoleObjectTuplesFromArray(roleSettingJSON.roleMap, liveChannel.guild)

  let roleSettingActionMessage = new ActionMessage<RoleMessageConfiguration>(
    liveChannel,
    roleSettingJSON.messageID,
    roleSettingJSON,
    (roleSettingJSON: RoleMessageConfiguration) => {
      return getRoleAddMessageContent(roleSettingJSON, roleObjectTuples)
    }, async (message: Message, roleSettingJSON: RoleMessageConfiguration) => {
      roleSettingJSON.messageID = message.id
      for (let roleTuple of RoleGroup.getRoleTuplesFromArray(roleSettingJSON.roleMap, message.guildId))
      {
        try
        {
          let emoji = await new Emote(roleTuple.emote).toEmoji(client)
          message.react(emoji)
        }
        catch {}
      }
    }, (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, roleMessageConfig: RoleMessageConfiguration) => {
      handleRoleReaction(client, reaction, user, reactionEventType, roleMessageConfig)
    }
  )

  await roleSettingActionMessage.initActionMessage()
  roleActionMessages[roleSettingID] = roleSettingActionMessage

  return prevMessageID != roleSettingJSON.messageID
}

export async function removeRoleSetting(roleSettingID: string)
{
  if (roleActionMessages[roleSettingID])
  {
    await roleActionMessages[roleSettingID].removeActionMessage()
    delete roleActionMessages[roleSettingID]
  }
}

async function getRoleAddMessageContent(roleDataJSON: RoleMessageConfiguration, roleTuples: RoleObjectTuple[])
{
  var messageContent = "**" + roleDataJSON.name + "**"
  for (let roleTuple of roleTuples)
  {
    messageContent += "\n"
    messageContent += roleTuple.emote + " \\: " + roleTuple.name
  }
  return messageContent
}

async function handleRoleReaction(client: Client, reaction: MessageReaction, user: User, action: MessageReactionEventType, roleMessageConfig: RoleMessageConfiguration)
{
  if (user.id == client.user.id) { return false }

  let roleTuples = RoleGroup.getRoleTuplesFromArray(roleMessageConfig.roleMap, reaction.message.guildId)

  var emoteRolePair = roleTuples.find((emoteRolePair) => {
    return Emote.fromEmoji(reaction.emoji).toString() == emoteRolePair.emote
  })

  if (!emoteRolePair || (roleMessageConfig.blacklistUserIDs && roleMessageConfig.blacklistUserIDs.includes(user.id)))
  {
    if (action == "added")
    {
      reaction.users.remove(user.id)
    }
    return false
  }

  await setRole(user, reaction.message.guild, emoteRolePair.roleID, action == "added" ? true : false)

  return true
}
