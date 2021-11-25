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

// Voice to text channel

var voiceToTextChannelData = {}

export const interpretVoiceToTextChannelSetting = async function(guildID, voiceToTextChannelMap)
{
  voiceToTextChannelData[guildID] = voiceToTextChannelMap
}

export const setupVoiceChannelEventHandler = function(client)
{
  client.on('voiceStateUpdate', async (oldState, newState) => {
    let prevTextChannelName
    if (oldState.channelId != null)
    {
      let voiceTextChannelPair = voiceToTextChannelData[oldState.guild.id].find((voiceTextChannelPair) => voiceTextChannelPair.voiceChannel == oldState.channelId)
      if (voiceTextChannelPair != null)
      {
        let textChannelIDToFind = voiceTextChannelPair.textChannel
        let prevTextChannel = await oldState.guild.channels.fetch(textChannelIDToFind)
        prevTextChannelName = prevTextChannel != null ? prevTextChannel.name : null
      }
    }
    let newTextChannelName
    if (newState.channelId != null)
    {
      let voiceTextChannelPair = voiceToTextChannelData[newState.guild.id].find((voiceTextChannelPair) => voiceTextChannelPair.voiceChannel == newState.channelId)
      if (voiceTextChannelPair != null)
      {
        let textChannelIDToFind = voiceTextChannelPair.textChannel
        let newTextChannel = await newState.guild.channels.fetch(textChannelIDToFind)
        newTextChannelName = newTextChannel != null ? newTextChannel.name : null
      }
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
