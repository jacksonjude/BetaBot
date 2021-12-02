const DISCORD_TOKEN = process.env.DISCORD_TOKEN

var loginMessage
var loginChannelID
var loginGuildID

export const loginBot = async function(client, message, channelID, guildID)
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

export const printLoginMessage = async function(client)
{
  if (loginMessage && loginChannelID && loginGuildID)
  {
    var guild = await client.guilds.fetch(loginGuildID)
    if (!guild) { return }
    var channel = await guild.channels.fetch(loginChannelID)
    if (!channel) { return }

    channel.send(loginMessage)
  }
}

// Reboot Methods

const logfile = 'betabot.log'
const endLogMessage = "logout"
const isLocalProcess = process.argv[2] == "local"
import fs from 'fs'
import { spawn } from 'child_process'

export const prepareBotLogout = function(logoutMessage, msg)
{
  var logoutBotPromise = new Promise(async (resolve) => {
    await msg.channel.send(logoutMessage)
    await client.user.setPresence({status: "dnd"})
    resolve()
  })

  return logoutBotPromise
}

export const logoutBot = function()
{
  if (isLocalProcess && fs.existsSync(logfile))
  {
    fs.unlinkSync(logfile)
    fs.writeFileSync(logfile, endLogMessage + "\n")
    fs.unlinkSync(logfile)
  }

  client.destroy()
}

export const rebootBot = async function(logoutMessage, loginMessage, msg)
{
  if (!isLocalProcess)
  {
    msg.channel.send("Cannot reboot bot.")
    return
  }

  await prepareBotLogout(logoutMessage, msg)

  spawnBot(loginMessage, msg)

  client.destroy()
}

const spawnBot = function(loginMessage, msg)
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
