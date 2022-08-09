import { Client, TextChannel, VoiceChannel, ChannelType, PermissionFlagsBits } from "discord.js"

// Update Roles

import { setRole } from "./util"

// Voice to text channel

var voiceToTextChannelData: { [k: string]: VoiceToTextPair[] } = {}

class VoiceToTextPair
{
  voiceChannelID: string
  textChannelID?: string
  roleID?: string
}

export async function interpretVoiceToTextChannelSetting(client: Client, guildID: string, voiceToTextChannelMap: VoiceToTextPair[]): Promise<boolean>
{
  voiceToTextChannelData[guildID] = voiceToTextChannelMap

  let shouldUpdateSetting = false

  for (let voiceTextChannelPair of voiceToTextChannelMap)
  {
    let guild = await client.guilds.fetch(guildID)
    let voiceChannel = await guild.channels.fetch(voiceTextChannelPair.voiceChannelID) as VoiceChannel
    let textChannel: TextChannel

    if (voiceTextChannelPair.textChannelID == null)
    {
      textChannel = await guild.channels.create({
        name: voiceChannel.name + "-text",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: client.user.id,
            allow: PermissionFlagsBits.ViewChannel
          },
          {
            id: guild.roles.everyone,
            deny: PermissionFlagsBits.ViewChannel
          }
        ],

      })

      if (voiceChannel.parent != null)
      {
        await textChannel.setParent(voiceChannel.parent, {lockPermissions: false})
      }

      voiceTextChannelPair.textChannelID = textChannel.id
      shouldUpdateSetting = true
    }

    if (voiceTextChannelPair.roleID == null)
    {
      textChannel = textChannel ?? await guild.channels.fetch(voiceTextChannelPair.textChannelID) as TextChannel

      let textChannelRole = await guild.roles.create({
        name: textChannel.name
      })

      await textChannel.permissionOverwrites.create(textChannelRole, {
        ViewChannel: true
      })

      voiceTextChannelPair.roleID = textChannelRole.id
      shouldUpdateSetting = true
    }
  }

  return shouldUpdateSetting
}

export function setupVoiceChannelEventHandler(client: Client)
{
  client.on('voiceStateUpdate', async (oldState, newState) => {
    let roleIDToRemove: string
    if (oldState.channelId != null)
    {
      let voiceTextChannelPair = voiceToTextChannelData[oldState.guild.id] ? voiceToTextChannelData[oldState.guild.id].find((voiceTextChannelPair) => voiceTextChannelPair.voiceChannelID == oldState.channelId) : null
      if (voiceTextChannelPair != null)
      {
        roleIDToRemove = voiceTextChannelPair.roleID
      }
    }
    let roleIDToAdd: string
    if (newState.channelId != null)
    {
      let voiceTextChannelPair = voiceToTextChannelData[newState.guild.id] ? voiceToTextChannelData[newState.guild.id].find((voiceTextChannelPair) => voiceTextChannelPair.voiceChannelID == newState.channelId) : null
      if (voiceTextChannelPair != null)
      {
        roleIDToAdd = voiceTextChannelPair.roleID
      }
    }

    if (oldState.channelId == null && newState.channelId != null && roleIDToAdd != null)
    {
      setRole(newState.member.user, newState.guild, roleIDToAdd, true)
    }
    else if (oldState.channelId != null && newState.channelId == null && roleIDToRemove != null)
    {
      setRole(oldState.member.user, oldState.guild, roleIDToRemove, false)
    }
    else if (oldState.channelId != newState.channelId && roleIDToRemove != null && roleIDToAdd != null)
    {
      setRole(oldState.member.user, oldState.guild, roleIDToRemove, false)
      setRole(newState.member.user, newState.guild, roleIDToAdd, true)
    }
  })
}
