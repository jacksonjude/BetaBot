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
  argRegex?: string[]
  command: string
  roleIDs?: string[]
  channelIDs?: string[]
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

  let aliasArgs = messageContent.replace(new RegExp("^" + aliasToUse.name + "\\s*"), "").split(new RegExp(aliasToUse.argSeparator))

  if (aliasToUse.roleIDs?.length > 0 && !message.member.roles.cache.some(role => aliasToUse.roleIDs.some(roleID => role.id == roleID)))
  {
    message.reply({
      content: `You are not allowed to run ${aliasToUse.name} (only ${aliasToUse.roleIDs.map(id => `<@&${id}>`).join(', ')})`,
      allowedMentions: { roles: [] }
    })
    return false
  }
  if (aliasToUse.channelIDs?.length > 0 && !aliasToUse.channelIDs.includes(message.channelId))
  {
    message.reply(`You cannot run ${aliasToUse.name} here (only ${aliasToUse.channelIDs.map(id => `<#${id}>`).join(', ')})`)
    return false
  }
  
  for (const argIndex in aliasToUse.argRegex ?? [])
  {
    const argRegex = new RegExp(aliasToUse.argRegex[argIndex])
    const argValue = aliasArgs[argIndex] ?? aliasToUse.defaultArgs[argIndex]
    if (argValue && !argRegex.test(argValue))
    {
      message.reply(`Invalid arguments for ${aliasToUse.name}`)
      return false
    }
  }
  
  let formattedCommand = aliasToUse.command
  if (formattedCommand.includes("{0}"))
  {
    formattedCommand = formattedCommand.replace(new RegExp("\\{0\\}", 'g'), message.author.id)
  }

  let argOn = 1
  while (formattedCommand.includes("{" + argOn + "}"))
  {
    if (!aliasArgs[argOn-1] && !aliasToUse.defaultArgs[argOn-1]) { return false }
    formattedCommand = formattedCommand.replace(new RegExp("\\{" + argOn + "\\}", 'g'), aliasArgs[argOn-1] ?? aliasToUse.defaultArgs[argOn-1])
    argOn += 1
  }

  console.log("[Command Alias] Executing: " + formattedCommand)

  await handleCommandExecution(formattedCommand, message, true)

  return true
}