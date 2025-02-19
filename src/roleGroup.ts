import { Role, Client, Guild, Message, GuildMember, UserResolvable, TextChannel } from "discord.js"
import { Firestore } from "firebase-admin/firestore"

import { BotCommand } from "./botCommand"

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
        emote: roleTuple.emote
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
    guild ??= await client.guilds.fetch(this.serverID)
    let member = user instanceof GuildMember ? user : await guild.members.fetch(user)
    let roleObjects = await this.getRoles(client, guild)
    return roleObjects.find(role => role.members.has(member.id))
  }
}

export class RoleTuple
{
  name: string
  roleID: string
  emote?: string
}

export class RoleObjectTuple
{
  name: string
  role: Role
  emote?: string
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
