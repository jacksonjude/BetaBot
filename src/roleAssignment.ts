import { Client, TextChannel, Message, GuildMember, Role, ReactionCollector } from "discord.js"

var roleAssignmentData: { [k: string]: RoleAssignmentConfiguration } = {}
var roleAssignmentMessageReactionCollectors: { [k: string]: ReactionCollector } = {}

export class RoleAssignmentConfiguration
{
  name: string
  roleIDWhitelist: string[]
  roleIDBlacklist: string[]
  serverID: string

  weightRoleIDs: string[]
  roleWeights: RoleAssignmentWeightSet[]

  messageSettings: RoleAssignmentMessageConfiguration
}

class RoleAssignmentWeightSet
{
  roleID: string
  weights: RoleAssignmentWeight[]
}

class RoleAssignmentWeight
{
  roleID: string
  value: number
}

class RoleAssignmentMessageConfiguration
{
  channelID: string
  messageEmoji: string
  messageText: string
  messageID: string | null
}

export async function interpretRoleAssignmentSetting(client: Client, roleAssignmentID: string, roleAssignmentDataJSON: RoleAssignmentConfiguration)
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

async function sendRoleAssignMessage(client: Client, messageSettings: RoleAssignmentMessageConfiguration)
{
  var channel = await client.channels.fetch(messageSettings.channelID) as TextChannel
  var messageContent = messageSettings.messageText
  var sentMessage = await channel.send(messageContent)
  messageSettings.messageID = sentMessage.id

  sentMessage.react(messageSettings.messageEmoji)
}

async function setupRoleAssignmentMessageReactionCollector(client: Client, roleAssignmentID: string, roleAssignmentDataJSON: RoleAssignmentConfiguration)
{
  var channel = await client.channels.fetch(roleAssignmentDataJSON.messageSettings.channelID) as TextChannel
  var roleAssignMessage = await channel.messages.fetch(roleAssignmentDataJSON.messageSettings.messageID)

  const catchAllFilter = () => true

  var roleAssignReactionCollector = roleAssignMessage.createReactionCollector({ filter: catchAllFilter })
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
    if (!checkRoleAssignmentRequirements(roleAssignmentData[roleAssignmentID], channel.guildId, channel.members.get(user.id)))
    {
      try
      {
        await reaction.users.remove(user.id)
      }
      catch {}
      return
    }

    let member: GuildMember
    try
    {
      member = await roleAssignMessage.guild.members.fetch(user.id)
    }
    catch { return }
    executeRoleAssignment(member, roleAssignmentData[roleAssignmentID])
  })

  roleAssignmentMessageReactionCollectors[roleAssignmentID] = roleAssignReactionCollector
}

function checkRoleAssignmentRequirements(roleAssignmentData: RoleAssignmentConfiguration, serverID: string, member: GuildMember, msg: Message = null)
{
  var inRequiredServer = roleAssignmentData.serverID ? serverID == roleAssignmentData.serverID : true
  var hasRequiredRoles = roleAssignmentData.roleIDWhitelist ? member.roles.cache.find(role => roleAssignmentData.roleIDWhitelist.includes(role.id)) : true
  var hasBlacklistedRoles = roleAssignmentData.roleIDBlacklist ? member.roles.cache.find(role => roleAssignmentData.roleIDBlacklist.includes(role.id)) : false

  if (!inRequiredServer)
  {
    msg && msg.channel.send("Cannot get role for " + roleAssignmentData.name + " in this server")
    return false
  }
  if (hasRequiredRoles == null)
  {
    msg && msg.channel.send("Cannot get role for " + roleAssignmentData.name + " because you don't have the required role")
    return false
  }
  if (hasBlacklistedRoles != null)
  {
    msg && msg.channel.send("Cannot get role for " + roleAssignmentData.name + " if you have the " + (hasBlacklistedRoles as Role).name + " role")
    return false
  }

  return true
}

async function executeRoleAssignment(member: GuildMember, roleAssignmentData: RoleAssignmentConfiguration)
{
  let memberBiasRoleIDs = member.roles.cache.filter(role => roleAssignmentData.weightRoleIDs.includes(role.id)).map(role => role.id)
  if (memberBiasRoleIDs.length > 1) { return }

  let shouldUseWeights = memberBiasRoleIDs.length == 1
  let memberBiasRoleID = memberBiasRoleIDs[0]

  let totalToGenerate = roleAssignmentData.roleWeights.reduce((totalCount, roleWeightData) => {
    return totalCount + (shouldUseWeights ? roleWeightData.weights.find(weight => weight.roleID == memberBiasRoleID).value : 1)
  }, 0)

  let generatedValue = Math.floor(Math.random()*totalToGenerate)
  let roleIndex = 0
  let roleIDToAssign: string

  while (generatedValue >= 0 && roleIndex < roleAssignmentData.roleWeights.length)
  {
    roleIDToAssign = roleAssignmentData.roleWeights[roleIndex].roleID
    let roleWeight = shouldUseWeights ? roleAssignmentData.roleWeights[roleIndex].weights.find(weight => weight.roleID == memberBiasRoleID) : null
    generatedValue -= shouldUseWeights ? roleWeight.value : 1
    roleIndex += 1
  }

  let roleToAssign = await member.guild.roles.fetch(roleIDToAssign)
  console.log("Assigned " + roleToAssign.name + " to " + member.user.id + " in " + member.guild.name)

  await member.roles.add(roleIDToAssign)
}
