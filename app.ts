const CREATOR_USER_ID = process.env.CREATOR_USER_ID
const DISCORD_NICKNAME = process.env.DISCORD_NICKNAME

import { Client, Intents, GuildMember } from 'discord.js'
const client = new Client({ intents: [
  Intents.FLAGS.GUILDS,
  Intents.FLAGS.GUILD_MEMBERS,
  Intents.FLAGS.GUILD_VOICE_STATES,
  Intents.FLAGS.GUILD_PRESENCES,
  Intents.FLAGS.GUILD_MESSAGES,
  Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
  Intents.FLAGS.DIRECT_MESSAGES,
  Intents.FLAGS.DIRECT_MESSAGE_REACTIONS
], partials: ['USER'] })

import { Firestore } from "firebase-admin/firestore"

// PARTIALS: https://github.com/discordjs/discord.js/issues/4980#issuecomment-723519865

// import { REST } from '@discordjs/rest'
// import { Routes } from 'discord-api-types/v9'
// const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN)

import { BotCommand } from "./src/botCommand"

import { loginBot, printLoginMessage, prepareBotLogout, rebootBot, logoutBot, endLogMessage } from "./src/login"
import { sendMessageResponses } from "./src/messageResponses"
import { getMessageCommands, getDateCommands, getEmoteSpellCommand, getClearCommand, getRepeatCommand, getSpeakCommand } from "./src/miscCommands"

import { setupVoiceChannelEventHandler } from "./src/linkedTextChannels"
import { setupMemberStatsEventHandlers, sendMessageCountsUpdateCommand, getMessageCountsLeaderboardCommand } from "./src/serverStats"

import { getExportPollResultsCommand } from "./src/poll/sharedPoll"
import { getDMVoteCommand } from "./src/poll/dmPoll"

import { initFirestore, initFirestoreCollectionListeners } from "./src/firebase"

const HOME_GUILD_ID = "704218896298934317"
const TECHNICIAN_ROLE_ID = "804147385923403826"

var firestoreDB: Firestore

// Login Bot

loginBot(client)

setupVoiceChannelEventHandler(client)
setupMemberStatsEventHandlers(client)

// Client Init

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`)

  printLoginMessage(client)

  client.user.setPresence({status: "online"})

  client.guilds.cache.forEach((guild) => {
    guild.members.fetch(client.user).then(member => updateNickname(member))
  })

  firestoreDB = initFirestore()
  initFirestoreCollectionListeners(firestoreDB, client)

  registerSlashCommands()
})

async function registerSlashCommands()
{
  // var commands = []

  // await rest.put(Routes.applicationGuildCommands(client.id, HOME_GUILD_ID), { body: commands })
	// .then(() => console.log('Successfully registered application commands.'))
	// .catch(console.error)
}

// Nickname Enforcement

client.on('guildMemberUpdate', async (_, newMember) => {
  var clientMember = await newMember.guild.members.fetch(client.user)
  if (newMember.id !== clientMember.id) { return }

  updateNickname(clientMember)
})

function updateNickname(clientMember: GuildMember)
{
  if (clientMember.displayName !== DISCORD_NICKNAME)
  {
    console.log("Updated name in " + clientMember.guild.name + " from " + clientMember.displayName + " to " + DISCORD_NICKNAME)
    clientMember.setNickname(DISCORD_NICKNAME)
  }
}

// Recieve Message

client.on('messageCreate', async msg => {
  // console.log(msg.channel.id + " :: " + msg.content)

  if (msg.author.id == client.user.id)
  {
    msg.guild && console.log("Sent '" + msg.content + "' in " + msg.guild.name)
    return
  }

  if (sendMessageResponses(msg)) { return }

  var messageContent = msg.content
  if ((msg.mentions.members && msg.mentions.members.has(client.user.id)) || (msg.mentions.roles && msg.mentions.roles.find(role => role.name == DISCORD_NICKNAME)))
  {
    messageContent = messageContent.replace(/<@!?&?\d+?>/, "")
  }
  else { return }

  if (client.user.presence.status === "idle")
  {
    client.user.setPresence({status: "online"})
    msg.channel.send("\\*yawn\\*")
  }

  messageContent = messageContent.replace(/^\s*/, "").replace(/\s*$/, "")

  console.log("Command from " + msg.author.username + " in " + msg.guild.name + " '" + messageContent + "'")

  const runBotCommands = async function(botCommands: BotCommand[]): Promise<boolean>
  {
    for (let botCommand of botCommands)
    {
      if (await botCommand.execute(messageContent, msg, client, firestoreDB)) { return true }
    }
    return false
  }

  var botCommands = [
    ...getMessageCommands(),
    ...getDateCommands(),
    getEmoteSpellCommand(),
    getClearCommand(),
    getDMVoteCommand(),
    getExportPollResultsCommand(),
    getMessageCountsLeaderboardCommand()
  ]
  if (await runBotCommands(botCommands)) { return }

  switch (messageContent)
  {
    case "info":
    msg.channel.send(`βəτα Bot Dev 1.0\nCreated by <@${CREATOR_USER_ID}>\nwith inspiration from We4therman\n*\\*Powered By DELL OS\\**`)
    return

    case "ping":
    msg.channel.send("pong")
    return
  }

  if (msg.author.id != CREATOR_USER_ID) { return }

  if (sendMessageCountsUpdateCommand(msg, messageContent, firestoreDB)) { return }

  if (!(msg.guildId == HOME_GUILD_ID && msg.member.roles.cache.find(role => role.id == TECHNICIAN_ROLE_ID))) { return }

  botCommands = [getRepeatCommand(), getSpeakCommand()]
  if (await runBotCommands(botCommands)) { return }

  switch (messageContent)
  {
    case "randomize":
    // updateRandomColorRole()
    break

    case "logout":
    await prepareBotLogout(client, "Bye bye for now!", msg)
    console.log(endLogMessage)

    logoutBot(client)
    break

    case "restart":
    prepareBotLogout(client, "Bye bye for now!", msg)
      .then(() => client.destroy())
      .then(() => loginBot(client, "And we're back!", msg.channel.id, msg.guild.id))
    break

    case "reboot":
    rebootBot(client, "Bye bye for now!", "And we're back!", msg)
    break

    case "sleep":
    msg.channel.send("zzz")
    client.user.setPresence({status: "idle"})
    break
  }
})
