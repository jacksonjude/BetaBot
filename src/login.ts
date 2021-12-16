import { Client, TextChannel, Message } from 'discord.js'

const DISCORD_TOKEN = process.env.DISCORD_TOKEN

var loginMessage: string
var loginChannelID: string
var loginGuildID: string

export async function loginBot(client: Client, message: string = null, channelID: string = null, guildID: string = null)
{
  if (process.env.process_restarting)
  {
    delete process.env.process_restarting

    var message = process.env.loginMessage
    var channelID = process.env.loginChannelID
    var guildID = process.env.loginGuildID

    setTimeout(function() {
      loginBot(client, message, channelID, guildID)
    }, 1000)

    return
  }

  loginMessage = message
  loginChannelID = channelID
  loginGuildID = guildID

  client.login(DISCORD_TOKEN)
}

export async function printLoginMessage(client: Client)
{
  if (loginMessage && loginChannelID && loginGuildID)
  {
    var guild = await client.guilds.fetch(loginGuildID)
    if (!guild) { return }
    var channel = await guild.channels.fetch(loginChannelID) as TextChannel
    if (!channel) { return }

    channel.send(loginMessage)
  }
}

// Reboot Methods

const logfile = 'betabot.log'
export const endLogMessage = "logout"
const isLocalProcess = process.argv[2] == "local"
import * as fs from 'fs'
import { spawn } from 'child_process'

export async function prepareBotLogout(client: Client, logoutMessage: string, msg: Message)
{
  await msg.channel.send(logoutMessage)
  client.user.setPresence({status: "dnd"})
}

export function logoutBot(client: Client)
{
  if (isLocalProcess && fs.existsSync(logfile))
  {
    fs.unlinkSync(logfile)
    fs.writeFileSync(logfile, endLogMessage + "\n")
    fs.unlinkSync(logfile)
  }

  client.destroy()
}

export async function rebootBot(client: Client, logoutMessage: string, loginMessage: string, msg: Message)
{
  if (!isLocalProcess)
  {
    msg.channel.send("Cannot reboot bot.")
    return
  }

  await prepareBotLogout(client, logoutMessage, msg)

  spawnBot(loginMessage, msg)

  client.destroy()
}

function spawnBot(loginMessage: string, msg: Message)
{
  var out = fs.openSync(logfile, 'a')
  var err = fs.openSync(logfile, 'a')

  var newProcessEnv = Object.assign(process.env, { process_restarting: 1, loginMessage: loginMessage, loginChannelID: msg.channel.id, loginGuildID: msg.guild.id })

  spawn(process.argv[0], process.argv.slice(1), {
    detached: true,
    env: newProcessEnv,
    stdio: ['ignore', out, err]
  }).unref()
}
