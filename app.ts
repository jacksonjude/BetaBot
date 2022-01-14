const APP_VERSION = process.env.HEROKU_RELEASE_VERSION ?? "Local"
const APP_BUILD_NUMBER = process.env.HEROKU_SLUG_DESCRIPTION ?? "Local"
const APP_BUILD_DATE = process.env.HEROKU_RELEASE_CREATED_AT

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
], partials: ['USER'] }) // PARTIALS: https://github.com/discordjs/discord.js/issues/4980#issuecomment-723519865

import {
  BotCommand,
  BotCommandUserIDRequirement, BotCommandRoleIDRequirement, BotCommandChannelIDRequirement, BotCommandServerIDRequirement,
  BotCommandUnionRequirement, BotCommandIntersectionRequirement
} from "./src/botCommand"

import { loginBot, getRestartCommand } from "./src/login"
import { sendMessageResponses } from "./src/messageResponses"
import { getHelpCommand, getMessageCommands, getDateCommands, getEmoteSpellCommand, getClearCommand, getRepeatCommand, getSpeakCommand, getCleanReactionsCommand } from "./src/miscCommands"

import { setupVoiceChannelEventHandler } from "./src/linkedTextChannels"
import { setupMemberStatsEventHandlers, getMessageCountsUpdateCommand, getMessageCountsLeaderboardCommand } from "./src/serverStats"

import { getExportPollResultsCommand, getEditPollCommand } from "./src/poll/sharedPoll"
import { getDMVoteCommand } from "./src/poll/dmPoll"

const HOME_GUILD_ID = "704218896298934317"
const TECHNICIAN_ROLE_ID = "804147385923403826"

import { Firestore } from "firebase-admin/firestore"
import { initFirestore, initFirestoreCollectionListeners } from "./src/firebase"

var firestoreDB: Firestore

// Login Bot

loginBot(client)

setupVoiceChannelEventHandler(client)
setupMemberStatsEventHandlers(client)

// Client Init

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`)

  client.user.setPresence({status: "online"})

  client.guilds.cache.forEach((guild) => {
    guild.members.fetch(client.user).then(member => updateNickname(member))
  })

  firestoreDB = initFirestore()
  initFirestoreCollectionListeners(firestoreDB, client)
})

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

// App Build Date String Parsing

function getFormattedBuildDateString(rawBuildDateString: string): string
{
  let formattedBuildDateString = "Now"
  if (APP_BUILD_DATE)
  {
    let timeSinceLastBuild = Date.now()-new Date(rawBuildDateString).getTime()
    console.log(timeSinceLastBuild)
    let timeSinceLastBuildComponents = {
      minutes: Math.floor(timeSinceLastBuild/(1000*60)%60).toString()+"m",
      hours: Math.floor(timeSinceLastBuild/(1000*60*60)%24).toString()+"h",
      days: Math.floor(timeSinceLastBuild/(1000*60*60*24)).toString()+"d"
    }

    if (timeSinceLastBuild < 1000*60)
    {
      formattedBuildDateString = "<1m"
    }
    else if (timeSinceLastBuild < 1000*60*60)
    {
      formattedBuildDateString = timeSinceLastBuildComponents.minutes
    }
    else if (timeSinceLastBuild < 1000*60*60*24)
    {
      formattedBuildDateString = timeSinceLastBuildComponents.hours + " " + timeSinceLastBuildComponents.minutes
    }
    else if (timeSinceLastBuild < 1000*60*60*24*7)
    {
      formattedBuildDateString = timeSinceLastBuildComponents.days + " " + timeSinceLastBuildComponents.hours
    }
    else
    {
      formattedBuildDateString = timeSinceLastBuildComponents.days
    }
  }

  return formattedBuildDateString
}

// Recieve Message

client.on('messageCreate', async msg => {
  // console.log(msg.channel.id + " :: " + msg.content)

  if (msg.author.id == client.user.id)
  {
    msg.guild && console.log("Sent '" + msg.content + "' in " + msg.guild.name)
    return
  }

  var messageContent = msg.content
  if ((msg.mentions.members && msg.mentions.members.has(client.user.id)) || (msg.mentions.roles && msg.mentions.roles.find(role => role.name == DISCORD_NICKNAME)))
  {
    messageContent = messageContent.replace(/<@!?&?\d+?>/, "")
  }
  else
  {
    if (sendMessageResponses(msg)) { return }
    return
  }

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

  var ownerUserRequirement = new BotCommandUserIDRequirement(CREATOR_USER_ID)

  var developmentRequirement = new BotCommandIntersectionRequirement(
    [
      new BotCommandServerIDRequirement(HOME_GUILD_ID),
      new BotCommandRoleIDRequirement(TECHNICIAN_ROLE_ID)
    ]
  )

  var ownerUserAndDevelopmentRequirement = new BotCommandIntersectionRequirement(
    [
      ownerUserRequirement,
      developmentRequirement
    ]
  )

  var botChannelRequirement = new BotCommandUnionRequirement(
    [
      new BotCommandChannelIDRequirement("720018214448398346"), // #technolog (negativity)
      new BotCommandChannelIDRequirement("865504790502965248"), // #betabot (jacksonjude.com)
      new BotCommandChannelIDRequirement("781235106832580638"), // #bot-stuff (TMMRAAC)
    ]
  )

  var botCommands = [
    ...getMessageCommands(),
    ...getDateCommands(),
    getEmoteSpellCommand().withRequirement(botChannelRequirement),
    getClearCommand(),
    getDMVoteCommand(),
    getExportPollResultsCommand(),
    getEditPollCommand().withRequirement(ownerUserAndDevelopmentRequirement),
    getMessageCountsLeaderboardCommand(),
    getMessageCountsUpdateCommand().withRequirement(ownerUserRequirement),
    getCleanReactionsCommand().withRequirement(ownerUserRequirement),
    getRepeatCommand().withRequirement(developmentRequirement),
    getSpeakCommand().withRequirement(developmentRequirement),
    getRestartCommand().withRequirement(ownerUserAndDevelopmentRequirement)
  ]
  botCommands.unshift(getHelpCommand(botCommands))
  if (await runBotCommands(botCommands)) { return }

  switch (messageContent)
  {
    case "info":


    msg.channel.send(`βəταBot **${APP_VERSION}** *(${APP_BUILD_NUMBER}, ${getFormattedBuildDateString(APP_BUILD_DATE)})*\nCreated by <@${CREATOR_USER_ID}>\nwith inspiration from We4therman\n*\\*Possibly Powered By DELL OS\\**`)
    return

    case "ping":
    msg.channel.send("pong")
    return
  }
})

process.on('unhandledRejection', error => {
  console.log('Unhandled error: ', error)
})
