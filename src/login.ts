import { Client, TextChannel, Message } from 'discord.js'
import { BotCommand } from "./botCommand"

const DISCORD_TOKEN = process.env.DISCORD_TOKEN

export async function loginBot(client: Client, message?: string, channelID?: string, guildID?: string)
{
  await client.login(DISCORD_TOKEN)

  if (message && channelID && guildID)
  {
    printLoginMessage(client, message, channelID, guildID)
  }
}

export async function printLoginMessage(client: Client, message: string, channelID: string, guildID: string)
{
  var guild = await client.guilds.fetch(guildID)
  if (!guild) { return }
  var channel = await guild.channels.fetch(channelID) as TextChannel
  if (!channel) { return }

  channel.send(message)
}

export async function prepareBotLogout(client: Client, logoutMessage: string, msg: Message)
{
  await msg.channel.send(logoutMessage)
  client.user.setPresence({status: "dnd"})
}

export function getRestartCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "restart", "restart BetaBot",
    /^restart$/, null,
    "restart",
    async (_, message: Message, client: Client) => {
      await prepareBotLogout(client, "Bye bye for now!", message)
      client.destroy()
      await loginBot(client, "And we're back!", message.channel.id, message.guild.id)
    }
  )
}
