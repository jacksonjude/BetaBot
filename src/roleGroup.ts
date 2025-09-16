import { Role, Client, Guild, Message, GuildMember, UserResolvable, TextChannel, PermissionFlagsBits } from "discord.js"
import { Firestore } from "firebase-admin/firestore"

import { BotCommand, BotCommandError, BotCommandRequirement, BotCommandIntersectionRequirement, BotCommandPermissionRequirement } from "./botCommand"

export type RoleGroupID = string
export type RoleArray = (RoleTuple | RoleGroupID)[]

export class RoleGroup
{
  roles: RoleArray
  serverID: string

  constructor(roles: RoleArray, serverID: string)
  {
    this.roles = roles
    this.serverID = serverID
  }

  static async getRolesFromArray(roles: RoleArray, guild: Guild): Promise<Role[]>
  {
    return new RoleGroup(roles, guild.id).getRoles(null, guild)
  }

  async getRoles(client?: Client, guild?: Guild): Promise<Role[]>
  {
    let roleObjectTuples = await this.getRoleObjectTuples(client, guild)

    return roleObjectTuples.map(roleObjectTuple => roleObjectTuple.role)
  }

  static async getRoleObjectTuplesFromArray(roles: RoleArray, guild: Guild): Promise<RoleObjectTuple[]>
  {
    return new RoleGroup(roles, guild.id).getRoleObjectTuples(null, guild)
  }

  async getRoleObjectTuples(client?: Client, guild?: Guild): Promise<RoleObjectTuple[]>
  {
    guild ??= await client.guilds.fetch(this.serverID)

    let roleTuples = this.getRoleTuples()
    let roleObjectTuples: RoleObjectTuple[] = await Promise.all(roleTuples.map(async roleTuple => {
      return {
        name: roleTuple.name,
        role: await guild.roles.fetch(roleTuple.roleID),
        emote: roleTuple.emote,
        channelID: roleTuple.channelID
      }
    }))

    return roleObjectTuples
  }

  static getRoleTuplesFromArray(roles: RoleArray, guildID: string)
  {
    return new RoleGroup(roles, guildID).getRoleTuples()
  }

  getRoleTuples(): RoleTuple[]
  {
    let roleTuples: RoleTuple[] = []

    for (let roleItem of this.roles)
    {
      if (typeof roleItem === 'string')
      {
        if (!roleGroups[roleItem] || roleGroups[roleItem].serverID != this.serverID) { continue }
        let groupRoles = new RoleGroup(roleGroups[roleItem].roles, this.serverID).getRoleTuples()
        roleTuples = roleTuples.concat(groupRoles)
      }
      else
      {
        roleTuples.push(roleItem)
      }
    }

    return roleTuples
  }

  async hasRole(user: UserResolvable, client?: Client, guild?: Guild): Promise<boolean>
  {
    return await this.getUserRole(user, client, guild) != null
  }
  
  async getUserRole(user: UserResolvable, client?: Client, guild?: Guild): Promise<Role | null>
  {
    try
    {
      guild ??= await client.guilds.fetch(this.serverID)
      let member = user instanceof GuildMember ? user : await guild.members.fetch(user)
      let roleObjects = await this.getRoles(client, guild)
      return roleObjects.find(role => role.members.has(member.id))
    }
    catch (error)
    {
      console.log("[RoleGroup] Error fetching user role:", error)
      return null
    }
  }
}

export class RoleTuple
{
  name: string
  roleID: string
  emote?: string
  channelID?: string
}

export class RoleObjectTuple
{
  name: string
  role: Role
  emote?: string
  channelID?: string
}

const roleGroupCollectionID = "roleGroupConfigurations"

export const roleGroupRegex = /[\w-]+/

export var roleGroups: { [k: string]: RoleGroup } = {}

export async function interpretRoleGroupSetting(roleGroupSettingID: string, roleGroupSettingJSON: RoleGroup)
{
  roleGroups[roleGroupSettingID] = new RoleGroup(roleGroupSettingJSON.roles, roleGroupSettingJSON.serverID)
}

export function getCreateRoleGroupCommand(): BotCommand
{
  // TODO: Find a better way of representing default emotes than [^\s]+
  return BotCommand.fromRegex(
    "rolegroup", "add a role to a group",
    /^rolegroup\s+([\w-]+)\s+(<@&\d+>|[\w-]+)?(?:\s+([^\s]+))?(?:\s+(.+))?$/, /^rolegroup(\s+.*)?$/,
    "rolegroup <id> <role> [emote] [name]",
    async (commandArguments: string[], message: Message, _, firestoreDB: Firestore) => {
      let id = commandArguments[1]
      let roleItem = commandArguments[2]
      let rawEmoteString = commandArguments[3]
      let roleName = commandArguments[4]

      let roleGroupConfig = roleGroups[id] ?? {
        serverID: message.guildId,
        roles: []
      }

      const singleRoleRegex = /<@&(\d+)>/

      if (singleRoleRegex.test(roleItem))
      {
        let roleID = singleRoleRegex.exec(roleItem)[1]
        roleGroupConfig.roles.push({
          roleID: roleID,
          emote: rawEmoteString ?? null,
          name: roleName ?? (await message.guild.roles.fetch(roleID)).name
        })
      }
      else if (roleGroupRegex.test(roleItem))
      {
        roleGroupConfig.roles.push(roleItem)
      }

      await firestoreDB.doc(roleGroupCollectionID + "/" + id).set(JSON.parse(JSON.stringify(roleGroupConfig)));

      (message.channel as TextChannel).send(`**Role Group ${id} updated**`)
    }
  )
}

export function getRolesFromString(rolesString: string)
{
  const rolesRegex = /^\s*((?:(?:<@!?&?\d+>|[\w-]+)\s*)*)\s*$/

  let roleIDs: string[] = []

  if (rolesRegex.test(rolesString))
  {
    let questionRolesString = rolesRegex.exec(rolesString)[1]

    const roleIDRegex = /<@!?&?(\d+)>/

    for (let roleIDString of questionRolesString.split(/\s+/))
    {
      if (roleIDRegex.test(roleIDString))
      {
        let roleID = roleIDRegex.exec(roleIDString)[1]
        roleIDs.push(roleID)
      }
      else if (roleGroupRegex.test(roleIDString))
      {
        if (!roleGroups[roleIDString]) { continue }

        let groupRoleIDs = roleGroups[roleIDString].getRoleTuples().map(roleTuple => roleTuple.roleID)
        roleIDs = roleIDs.concat(groupRoleIDs)
      }
    }
  }

  return roleIDs
}

export function getClearRoleCommand(): BotCommand<Role>
{
  return BotCommand.fromRegexWithValidation(
    "clearrole", "remove all users from a role",
    /^clearrole\s+<@&(\d+)>$/, /^clearrole(\s+.*)?$/,
    "clearrole <role>",
    async (commandArguments: string[], message: Message) => {
      let roleID = commandArguments[1]
      let roleObject = await message.guild.roles.fetch(roleID)
      if (!roleObject)
      {
        return new BotCommandError(`invalid role provided <@&${roleID}>`, true)
      }
      
      return roleObject
    },
    new BotCommandIntersectionRequirement(
      [
        new BotCommandPermissionRequirement([PermissionFlagsBits.ManageRoles]),
        new BotCommandRequirement(async (role: Role, _user, member: GuildMember) => {
          return member.roles.highest.position > role.position
        })
      ]
    ),
    async (role: Role) => {
      Array.from(role.members.values()).map((member, i) => setTimeout(() => {
        console.log("[Clear-Role] Removing", role.name, "from", member.displayName)
        member.roles.remove(role.id)
      }, i*500))
    }
  )
}

export function getIntersectRoleCommand(): BotCommand<string[]>
{
  return BotCommand.fromRegexWithValidation(
    "intersectrole", "get all users that have two or more of the provided roles",
    /^intersectrole\s*(.*)$/, null,
    "intersectrole <roles...>",
    async (commandArguments: string[]) => {
      const rolesString = commandArguments[1]
      const roleIDs = getRolesFromString(rolesString)
      
      if (roleIDs.length <= 0)
      {
        return new BotCommandError(`invalid roles provided ${rolesString}`, true)
      }
      
      return roleIDs
    },
    new BotCommandPermissionRequirement([PermissionFlagsBits.ManageRoles]),
    async (roleIDs: string[], message: Message) => {
      const serverMembers = await message.guild.members.fetch()
      const memberIDsWithMultipleRoles: string[] = []
      
      const roleObjects: Role[] = []
      for (const roleID of roleIDs)
      {
        roleObjects.push(await message.guild.roles.fetch(roleID))
      }
      const roleMemberSets = roleObjects.map(role => new Set(role.members.keys()))
      
      for (const [memberID] of serverMembers)
      {
        let hasRoleCount = 0
        for (const roleMembers of roleMemberSets)
        {
          hasRoleCount += roleMembers.has(memberID) ? 1 : 0
          if (hasRoleCount >= 2)
          {
            memberIDsWithMultipleRoles.push(memberID)
            break
          }
        }
      }
      
      const formattedRoleIDs = roleIDs.map(id => `<@&${id}>`).join(',')
      const formattedMemberIDs = memberIDsWithMultipleRoles.map(id => `* <@${id}>`).join('\n')
      const responseChannel = message.channel as TextChannel
      
      responseChannel.send(`Members with 2 or more of ${formattedRoleIDs}:\n${formattedMemberIDs}`)
    }
  )
}

interface MassAssignCommandArguments
{
  roleToAssign: Role
  logChannel: TextChannel
  minMembershipDays: number
  minAccountDays: number
  assignLimit: number
  roleCriteriaParts: string[]
}

export function getMassAssignCommand(): BotCommand<MassAssignCommandArguments>
{
  return BotCommand.fromRegexWithValidation(
    "massassign", "assign a role to all users with certain criteria",
    /^massassign\s*<@&(\d+)>\s*<#(\d+)>\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:!?\s*(?:<@!?&?\d+>|[\w-]+)\s*(?:&&|\|\||)\s*)*)$/, /^massassign(\s+.*)?$/,
    "massassign <role> <log channel> <min membership days> <min account days> <assign limit> [existing roles...]",
    async (commandArguments: string[], message: Message) => {
      const roleIDToAssign = commandArguments[1]
      const roleToAssign = await message.guild.roles.fetch(roleIDToAssign)
      
      if (!roleToAssign)
      {
        return new BotCommandError(`invalid role provided <@&${roleIDToAssign}>`, true)
      }
      
      const logChannelID = commandArguments[2]
      const logChannel = await message.guild.channels.fetch(logChannelID) as TextChannel
      
      if (!logChannel)
      {
        return new BotCommandError(`invalid log channel provided <#${logChannelID}>`, true)
      }
      
      const minMembershipDays = parseInt(commandArguments[3])
      const minAccountDays = parseInt(commandArguments[4])
      const assignLimit = parseInt(commandArguments[5])
      
      const existingRoleLogicString = commandArguments[6]
      const roleCriteriaParts = existingRoleLogicString.split(/(&&|\|\||!)/).map(s => s.trim()).filter(s => s.length > 0)
      
      return {
        roleToAssign,
        logChannel,
        minMembershipDays,
        minAccountDays,
        assignLimit,
        roleCriteriaParts
      }
    },
    new BotCommandIntersectionRequirement(
      [
        new BotCommandPermissionRequirement([PermissionFlagsBits.ManageRoles]),
        new BotCommandRequirement(async (massAssignArguments: MassAssignCommandArguments, _user, member: GuildMember) => {
          return member.roles.highest.position > massAssignArguments.roleToAssign.position
        })
      ]
    ),
    async (massAssignArguments: MassAssignCommandArguments, message: Message) => {
      const { roleToAssign, logChannel, minMembershipDays, minAccountDays, assignLimit, roleCriteriaParts } = massAssignArguments
      
      let serverMembers = await message.guild.members.fetch()
      serverMembers = serverMembers
        .filter(m => !roleToAssign.members.has(m.id))
        .filter(m => m.joinedTimestamp <= Date.now()-1000*60*60*24*minMembershipDays)
        .filter(m => m.user.createdTimestamp <= Date.now()-1000*60*60*24*minAccountDays)
      
      let lastBinaryOperator = null
      let nextPartIsInverted = false
      let filteredServerMembers = serverMembers.concat()
      
      while (roleCriteriaParts.length > 0)
      {
        const currentPart = roleCriteriaParts.shift()
        
        if (currentPart == "!")
        {
          nextPartIsInverted = true
          continue
        }
        else if (currentPart == "&&" || currentPart == "||")
        {
          lastBinaryOperator = currentPart
          continue
        }
        
        const roleIDs = getRolesFromString(currentPart)
        const roleMemberIDSet = new Set<string>()
        for (const roleID of roleIDs)
        {
          const role = await message.guild.roles.fetch(roleID)
          Array.from(role.members.keys()).forEach(id => roleMemberIDSet.add(id))
        }
        
        if (!lastBinaryOperator || lastBinaryOperator == "&&")
        {
          filteredServerMembers = filteredServerMembers.filter(m => nextPartIsInverted 
            ? !roleMemberIDSet.has(m.id) : roleMemberIDSet.has(m.id))
        }
        else if (lastBinaryOperator == "||")
        {
          filteredServerMembers = filteredServerMembers.concat(
            serverMembers.filter(m => nextPartIsInverted
              ? !roleMemberIDSet.has(m.id) : roleMemberIDSet.has(m.id))
          )
        }
        
        nextPartIsInverted = false
      }
      
      let membersToAssignRole = Array.from(filteredServerMembers.values())
      membersToAssignRole.sort((m1, m2) => m1.joinedTimestamp - m2.joinedTimestamp)
      
      const skippedMemberCount = Math.max(membersToAssignRole.length - assignLimit, 0)
      membersToAssignRole = membersToAssignRole.slice(0, assignLimit)
      
      for (const member of membersToAssignRole)
      {
        member.roles.add(roleToAssign)
      }
      
      if (membersToAssignRole.length > 0)
      {
        const formattedMemberIDs = membersToAssignRole.map(m => `* <@${m.id}>`).join('\n')
        logChannel.send(`**Assigning <@&${roleToAssign.id}> to:**\n${formattedMemberIDs}${skippedMemberCount > 0 ? `\n*(skipped ${skippedMemberCount} due to limit)*` : ''}`)
      }
      else
      {
        // logChannel.send(`No eligible members to assign <@&${roleIDToAssign}>`)
      }
    }
  )
}