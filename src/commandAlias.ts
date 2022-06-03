import { Message } from "discord.js"
import { HandleCommandExecution } from "./util"

export class ServerCommandAliasConfiguration
{
  commandAliases: CommandAlias[]
}

class CommandAlias
{
  name: string
  argSeparator: string
  defaultArgs: string[]
  command: string
  roleIDs?: string[]
}

var commandAliases: { [k: string]: CommandAlias[] } = {}

export function interpretServerCommandAliasSettings(serverID: string, serverCommandAliasConfig: ServerCommandAliasConfiguration)
{
  serverCommandAliasConfig.commandAliases.forEach(commandAlias => {
    commandAlias.argSeparator ??= "\\s+"
    commandAlias.defaultArgs ??= []
  })
  commandAliases[serverID] = serverCommandAliasConfig.commandAliases
}

export async function executeCommandAlias(messageContent: string, message: Message, handleCommandExecution: HandleCommandExecution)
{
  let aliasesToCheck = commandAliases[message.guildId] ?? []
  let aliasToUse = aliasesToCheck.find(alias => {
    return messageContent.split(/\s+/)[0] == alias.name
  })

  if (!aliasToUse) { return false }

  let aliasArgs = messageContent.replace(new RegExp("^" + aliasToUse.name + "\\s+"), "").split(new RegExp(aliasToUse.argSeparator))

  console.log(aliasToUse, aliasArgs)

  if (aliasToUse.roleIDs && !message.member.roles.cache.some(role => aliasToUse.roleIDs.some(roleID => role.id == roleID))) { return false }

  let argOn = 1
  let formattedCommand = aliasToUse.command
  while (formattedCommand.includes("{" + argOn + "}"))
  {
    if (!aliasArgs[argOn-1] && !aliasToUse.defaultArgs[argOn-1]) { return false }
    formattedCommand = formattedCommand.replace(new RegExp("\\{" + argOn + "\\}", 'g'), aliasArgs[argOn-1] ?? aliasToUse.defaultArgs[argOn-1])
    argOn += 1
  }

  console.log("[Command Alias] Executing: " + formattedCommand)

  await handleCommandExecution(formattedCommand, message)

  return true
}
