const APP_VERSION = process.env.HEROKU_RELEASE_VERSION ?? "Local"
const APP_BUILD_NUMBER = process.env.HEROKU_SLUG_DESCRIPTION ?? "Local"
const APP_BUILD_DATE = process.env.HEROKU_RELEASE_CREATED_AT ?? Date.now()

const CREATOR_USER_ID = process.env.CREATOR_USER_ID
const DISCORD_NICKNAME = process.env.DISCORD_NICKNAME

import { Client, GatewayIntentBits, Partials, PermissionFlagsBits, GuildMember, Message, TextChannel } from 'discord.js'
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildPresences,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.DirectMessageReactions,
  GatewayIntentBits.MessageContent
], partials: [Partials.User] }) // PARTIALS: https://github.com/discordjs/discord.js/issues/4980#issuecomment-723519865

import {
  BotCommand,
  BotCommandUserIDRequirement, BotCommandRoleIDRequirement, BotCommandPermissionRequirement,
  BotCommandChannelIDRequirement, BotCommandServerIDRequirement,
  BotCommandFromAliasRequirement,
  BotCommandUnionRequirement, BotCommandIntersectionRequirement
} from "./src/botCommand"

import { loginBot, getRestartCommand } from "./src/login"
import { sendMessageResponses } from "./src/messageResponses"
import {
  getHelpCommand,
  getMessageCommands, getDateCommands, getEmoteSpellCommand, getEchoCommand, getClearCommand,
  getRepeatCommand, getSpeakCommand, getCleanReactionsCommand,
  getCloseChannelsCommand,
  getRerunCommand,
  getReactCommand,
  getPingCommand,
  getClearRoleCommand
} from "./src/miscCommands"

import { setupVoiceChannelEventHandler } from "./src/linkedTextChannels"
import { setupMemberStatsEventHandlers, getMessageCountsUpdateCommand, getMessageCountsLeaderboardCommand } from "./src/serverStats"

import { getExportPollResultsCommand } from "./src/poll/sharedPoll"
import { getDMVoteCommand } from "./src/poll/dmPoll"
import { getCreateServerPollCommand } from "./src/poll/serverPoll"
import { getCreatePollCommand, getEditPollCommand, setupPollEditTextInputEventHandlers } from "./src/poll/createPoll"

import { getScheduleCommand } from "./src/scheduledCommands"

import { getCreateRoleGroupCommand } from "./src/roleGroup"

import { setupRoleCounterEventHandlers } from "./src/roleCounter"

import { executeCommandAlias } from "./src/commandAlias"

import { setupFormMessageEventHandlers } from "./src/formChannel"

import { checkWords } from './src/badWords'

const HOME_GUILD_ID = "704218896298934317"
const TECHNICIAN_ROLE_ID = "804147385923403826"

import { Firestore } from "firebase-admin/firestore"
import { initFirestore, initFirestoreCollectionListeners } from "./src/firebase"

var firestoreDB: Firestore

import { initDataFetch } from './src/mapData/mapData'

// Login Bot

loginBot(client)

// Client Init

client.on('ready', async () => {
  console.log(`[App] Logged in as ${client.user.tag}!`)

  client.user.setPresence({status: "online"})

  client.guilds.cache.forEach((guild) => {
    guild.members.fetch(client.user).then(member => updateNickname(member))
  })

  firestoreDB = initFirestore()
  initFirestoreCollectionListeners(firestoreDB, client)

  setupVoiceChannelEventHandler(client)
  setupMemberStatsEventHandlers(client)
  setupRoleCounterEventHandlers(client)
  setupPollEditTextInputEventHandlers(client, firestoreDB)
  setupFormMessageEventHandlers(client)

  initCommands()
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
    console.log("[App] Updated name in " + clientMember.guild.name + " from " + clientMember.displayName + " to " + DISCORD_NICKNAME)
    clientMember.setNickname(DISCORD_NICKNAME)
  }
}

// App Build Date String Parsing

function getFormattedBuildDateString(rawBuildDate: string | number): string
{
  let timestamp = Math.round(new Date(rawBuildDate).getTime()/1000)
  return `<t:${timestamp}:R>`
}

// Setup Commands

var botCommands: BotCommand[]

function initCommands()
{
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

  var botTesterPermissionRequirement = new BotCommandUnionRequirement(
    [
      new BotCommandRoleIDRequirement(TECHNICIAN_ROLE_ID),
      new BotCommandRoleIDRequirement("982191695066177557"), // @bot tester (jacksonjude.com)
      new BotCommandFromAliasRequirement(),
      ownerUserRequirement
    ]
  )
  var manageChannelsPermissionRequirement = new BotCommandUnionRequirement(
    [
      new BotCommandPermissionRequirement([PermissionFlagsBits.ManageChannels]),
      ownerUserRequirement
    ]
  )
  var serverAdminPermissionRequirement = new BotCommandUnionRequirement(
    [
      new BotCommandPermissionRequirement([PermissionFlagsBits.Administrator]),
      ownerUserRequirement
    ]
  )
  var botAdminPermissionRequirement = new BotCommandUnionRequirement(
    [
      new BotCommandRoleIDRequirement(TECHNICIAN_ROLE_ID),
      new BotCommandRoleIDRequirement("1002116413051379813"), // @bot admin (jacksonjude.com)
      serverAdminPermissionRequirement
    ]
  )
  var botAdminOrAliasPermissionRequirement = new BotCommandUnionRequirement(
    [
      botAdminPermissionRequirement,
      new BotCommandFromAliasRequirement(),
    ]
  )

  botCommands = [
    ...getMessageCommands(),
    ...getDateCommands(),
    getEmoteSpellCommand().withRequirement(botChannelRequirement),
    getClearCommand(),
    getDMVoteCommand(),
    getPingCommand(),
    getExportPollResultsCommand(botAdminPermissionRequirement),
    getCloseChannelsCommand().withRequirement(manageChannelsPermissionRequirement),
    getEchoCommand().withRequirement(botAdminOrAliasPermissionRequirement),
    getScheduleCommand(handleCommandExecution).withRequirement(botAdminPermissionRequirement),
    getCreateServerPollCommand().withRequirement(botTesterPermissionRequirement),
    getEditPollCommand().withRequirement(botAdminPermissionRequirement),
    getCreatePollCommand().withRequirement(botAdminPermissionRequirement),
    getCreateRoleGroupCommand().withRequirement(botAdminPermissionRequirement),
    getMessageCountsLeaderboardCommand(),
    getMessageCountsUpdateCommand().withRequirement(ownerUserRequirement),
    getCleanReactionsCommand().withRequirement(ownerUserRequirement),
    getClearRoleCommand().withRequirement(ownerUserRequirement),
    getReactCommand().withRequirement(ownerUserRequirement),
    getRepeatCommand().withRequirement(developmentRequirement),
    getSpeakCommand().withRequirement(developmentRequirement),
    getRerunCommand(handleCommandExecution).withRequirement(botAdminPermissionRequirement),
    getRestartCommand().withRequirement(ownerUserAndDevelopmentRequirement)
  ]
  botCommands.unshift(getHelpCommand(botCommands))
}

// Receive Message

client.on('messageCreate', async msg => {
  // console.log(msg.channel.id + " :: " + msg.content)

  if (msg.author.id == client.user.id)
  {
    msg.guild && console.log("[App] Sent '" + msg.content + "' in " + msg.guild.name)
    return
  }
  
  if (await checkWords(msg)) return

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
    client.user.setPresence({status: 'online'});
    (msg.channel as TextChannel).send("\\*yawn\\*")
  }

  messageContent = messageContent.replace(/^\s*/, "").replace(/\s*$/, "")

  console.log("[App] Command from " + msg.author.username + " in " + msg.guild.name + " '" + messageContent + "'")

  try
  {
    await handleCommandExecution(messageContent, msg, false)
  }
  catch (error)
  {
    console.log('[App] Unhandled command error: ', error)
  }
})

export async function handleCommandExecution(messageContent: string, msg: Message, fromAlias: boolean)
{
  const runBotCommands = async function(botCommands: BotCommand[]): Promise<boolean>
  {
    for (let botCommand of botCommands)
    {
      if (await botCommand.execute(messageContent, msg, client, firestoreDB, fromAlias)) { return true }
    }
    return false
  }

  if (await runBotCommands(botCommands)) { return }

  if (await executeCommandAlias(messageContent, msg, handleCommandExecution)) { return }

  switch (messageContent)
  {
    case "info":
    (msg.channel as TextChannel).send(`βəταBot **${APP_VERSION}** *(${APP_BUILD_NUMBER.replace('Deploy ', '')}, ${getFormattedBuildDateString(APP_BUILD_DATE)})*\nCreated by <@${CREATOR_USER_ID}> (2020-${new Date(APP_BUILD_DATE ?? "2022-01-02").getFullYear()})\nwith inspiration from We4therman\n*\\*Possibly Powered By DELL OS\\**`)
    return

    case "ping":
    (msg.channel as TextChannel).send("pong")
    return
  }
}

initDataFetch();

process.on('unhandledRejection', error => {
  console.log('[App] Unhandled error: ', error)
})
