var roleAssignmentData = {}
var roleAssignmentMessageReactionCollectors = {}

export const interpretRoleAssignmentSetting = async function(client, roleAssignmentID, roleAssignmentDataJSON)
{
  roleAssignmentData[roleAssignmentID] = roleAssignmentDataJSON

  if (roleAssignmentDataJSON.messageSettings != null && roleAssignmentDataJSON.messageSettings.channelID != null)
  {
    if (roleAssignmentDataJSON.messageSettings.messageID == null)
    {
      await sendRoleAssignMessage(client, roleAssignmentDataJSON.messageSettings)
    }

    if (roleAssignmentDataJSON.messageSettings.messageID != null && !roleAssignmentMessageReactionCollectors[roleAssignmentID])
    {
      setupRoleAssignmentMessageReactionCollector(client, roleAssignmentID, roleAssignmentDataJSON)
    }
  }

  return roleAssignmentDataJSON
}

async function sendRoleAssignMessage(client, messageSettings)
{
  var channel = await client.channels.fetch(messageSettings.channelID)
  var messageContent = messageSettings.messageText
  var sentMessage = await channel.send(messageContent)
  messageSettings.messageID = sentMessage.id

  sentMessage.react(messageSettings.messageEmoji)
}

async function setupRoleAssignmentMessageReactionCollector(client, roleAssignmentID, roleAssignmentDataJSON)
{
  var channel = await client.channels.fetch(roleAssignmentDataJSON.messageSettings.channelID)
  var roleAssignMessage = await channel.messages.fetch(roleAssignmentDataJSON.messageSettings.messageID)

  const catchAllFilter = () => true

  var roleAssignReactionCollector = roleAssignMessage.createReactionCollector({ catchAllFilter })
  roleAssignReactionCollector.on('collect', async (reaction, user) => {
    if (user.id == client.user.id) { return }
    if (reaction.emoji.name != roleAssignmentDataJSON.messageSettings.messageEmoji)
    {
      try
      {
        await reaction.users.remove(user.id)
      }
      catch {}
      return
    }

    await user.fetch()
    if (!checkRoleAssignmentRequirements(roleAssignmentDataJSON, channel.guildId, channel.members.get(user.id)))
    {
      try
      {
        await reaction.users.remove(user.id)
      }
      catch {}
      return
    }

    let member
    try
    {
      member = await roleAssignMessage.guild.members.fetch(user.id)
    }
    catch { return }
    executeRoleAssignment(member, roleAssignmentDataJSON)
  })

  roleAssignmentMessageReactionCollectors[roleAssignmentID] = roleAssignReactionCollector
}

function checkRoleAssignmentRequirements(roleAssignmentData, serverID, member, msg)
{
  var inRequiredServer = roleAssignmentData.serverID ? serverID == roleAssignmentData.serverID : true
  var hasRequiredRoles = roleAssignmentData.roleIDWhitelist ? member.roles.cache.find(role => roleAssignmentData.roleIDWhitelist.includes(role.id)) : true
  var hasBlacklistedRoles = roleAssignmentData.roleIDBlacklist ? member.roles.cache.find(role => roleAssignmentData.roleIDBlacklist.includes(role.id)) : false

  if (!inRequiredServer)
  {
    msg && msg.channel.send("Cannot get role for " + roleAssignmentData.name + " in this server")
    return false
  }
  if (!hasRequiredRoles)
  {
    msg && msg.channel.send("Cannot get role for " + roleAssignmentData.name + " without the " + hasRequiredRoles.name + " role")
    return false
  }
  if (hasBlacklistedRoles)
  {
    msg && msg.channel.send("Cannot get role for " + roleAssignmentData.name + " if you have the " + hasBlacklistedRoles.name + " role")
    return false
  }

  return true
}

async function executeRoleAssignment(member, roleAssignmentData)
{
  let memberBiasRoleIDs = member.roles.cache.filter(role => roleAssignmentData.weightRoleIDs.includes(role.id)).map(role => role.id)
  if (memberBiasRoleIDs.length != 1) { return }

  let memberBiasRoleID = memberBiasRoleIDs[0]

  let totalToGenerate = roleAssignmentData.roleWeights.reduce((totalCount, roleWeightData) => {
    return totalCount + roleWeightData.weights.find(weight => weight.roleID == memberBiasRoleID).value
  }, 0)

  let generatedValue = Math.floor(Math.random()*totalToGenerate)
  let roleIndex = 0
  let roleIDToAssign

  while (generatedValue >= 0 && roleIndex < roleAssignmentData.roleWeights.length)
  {
    let roleWeight = roleAssignmentData.roleWeights[roleIndex].weights.find(weight => weight.roleID == memberBiasRoleID)
    roleIDToAssign = roleAssignmentData.roleWeights[roleIndex].roleID
    generatedValue -= roleWeight.value
    roleIndex += 1
  }

  let roleToAssign = await member.guild.roles.fetch(roleIDToAssign)
  console.log("Assigned " + roleToAssign.name + " to " + member.user.id + " in " + member.guild.name)

  await member.roles.add(roleIDToAssign)
}
