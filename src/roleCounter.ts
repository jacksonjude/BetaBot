import { Client, TextChannel, Guild, Message } from "discord.js"
import { ActionMessage } from "./actionMessage"
import { RoleObjectTuple, RoleArray, RoleGroup } from "./roleGroup"

export class RoleCounterConfiguration
{
  name: string
  channelID: string
  messageID?: string

  sortBySize?: boolean
  showTotalMembers?: boolean
  filterRoleID: string
  onlyMostSignificant: boolean
  hideIfZero: boolean

  roleDisplayData: RoleArray
}

class DisplayRoleTuple extends RoleObjectTuple
{
  size?: number
}

var roleCounterMessages: { [k: string]: ActionMessage<RoleCounterConfiguration> } = {}

export async function interpretRoleCounterSetting(client: Client, roleCounterSettingID: string, roleCounterSettingJSON: RoleCounterConfiguration)
{
  if (roleCounterSettingJSON.channelID == null) { return }

  let prevMessageID = roleCounterSettingJSON.messageID

  let liveChannel = await client.channels.fetch(roleCounterSettingJSON.channelID) as TextChannel
  let roleCounterActionMessage = new ActionMessage<RoleCounterConfiguration>(
    liveChannel,
    roleCounterSettingJSON.messageID,
    roleCounterSettingJSON,
    (roleSettingJSON: RoleCounterConfiguration, channel: TextChannel) => {
      return getRoleCounterText(roleSettingJSON, channel.guild)
    }, async (message: Message, roleSettingJSON: RoleCounterConfiguration) => {
      roleSettingJSON.messageID = message.id
    }, () => {}
  )

  await roleCounterActionMessage.initActionMessage()
  roleCounterMessages[roleCounterSettingID] = roleCounterActionMessage

  return prevMessageID != roleCounterSettingJSON.messageID
}

async function getRoleCounterText(roleCounterSettingJSON: RoleCounterConfiguration, guild: Guild): Promise<string>
{
  let roleDisplayData = roleCounterSettingJSON.roleDisplayData
  let memberIDs = []

  let roleObjectTuples: DisplayRoleTuple[] = await RoleGroup.getRoleObjectTuplesFromArray(roleDisplayData, guild)

  for (let roleTuple of roleObjectTuples)
  {
    let roleMembers = Object.values(roleTuple.role.members.toJSON())

    if (roleCounterSettingJSON.filterRoleID)
    {
      roleMembers = roleMembers.filter(member => member.roles.cache.some(role => role.id == roleCounterSettingJSON.filterRoleID))
    }

    if (roleCounterSettingJSON.onlyMostSignificant === true)
    {
      roleMembers = roleMembers.filter(member => !memberIDs.includes(member.id))
    }

    roleTuple.size = roleMembers.length
    memberIDs = memberIDs.concat(roleMembers.map(member => member.id))
  }
  let totalCount = new Set(memberIDs).size

  if (roleCounterSettingJSON.sortBySize === true)
  {
    roleObjectTuples.sort((roleTuple1, roleTuple2) => roleTuple2.size-roleTuple1.size)
  }

  let roleCounterText = ""
  for (let roleTuple of roleObjectTuples)
  {
    if (roleCounterSettingJSON.hideIfZero && roleTuple.size == 0) { continue }
    roleCounterText += "\n" + (roleTuple.emote ? roleTuple.emote + " " : "") + "**" + roleTuple.name + ": " + roleTuple.size + "**"
  }

  roleCounterText = "__**" + roleCounterSettingJSON.name + (roleCounterSettingJSON.showTotalMembers === true ? " (" + totalCount + ")" : "") + "**__" + roleCounterText

  return roleCounterText
}

export function setupRoleCounterEventHandlers(client: Client)
{
  client.on('guildMemberUpdate', (member) => {
    if (member == null || member.guild == null) { return }

    let guildRoleCounterActionMessages = Object.values(roleCounterMessages).filter((roleCounterActionMessage) => (roleCounterActionMessage.channel as TextChannel).guildId == member.guild.id)
    for (let guildRoleCounterActionMessage of guildRoleCounterActionMessages)
    {
      guildRoleCounterActionMessage.initActionMessage()
    }
  })
}
