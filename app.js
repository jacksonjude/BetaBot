const CREATOR_USER_ID = process.env.CREATOR_USER_ID
const DISCORD_NICKNAME = process.env.DISCORD_NICKNAME

import { Client, Intents } from 'discord.js'
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

// PARTIALS: https://github.com/discordjs/discord.js/issues/4980#issuecomment-723519865

import { loginBot, printLoginMessage, prepareBotLogout, rebootBot } from "./src/login.js"
import { sendMessageResponses } from "./src/responses.js"
import { sendDateCommands, sendMessageCommands, sendClearCommand, sendRepeatCommand, sendSpeakCommand } from "./src/commands.js"
import { interpretPollSetting, sendVoteCommand, sendVoteDM } from "./src/dmPoll.js"

import { interpretRoleSetting } from "./src/roleMessages.js"
import { interpretVoiceToTextChannelSetting, setupVoiceChannelEventHandler } from "./src/linkedTextChannels.js"
import { interpretStatsSetting, setupMemberStatsEventHandlers } from "./src/serverStats.js"

import { initFirestore } from "./src/firebase.js"

const technicianRoleName = "technician"

const botSettingsChannelIDs = [
  "738578711510646856" // sekret in negativity ("704218896298934317")
]
const roleMessageCollectionID = "roleMessageConfigurations"
const voiceToTextCollectionID = "voiceToTextConfigurations"
const statChannelsCollectionID = "statsConfigurations"
const pollsCollectionID = "pollConfigurations"
const pollResponsesCollectionID = "responses"

const HOME_GUILD_ID = "704218896298934317"

var firestoreDB

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

  firestoreDB = await initFirestore()

  var roleMessageSettings = await firestoreDB.collection(roleMessageCollectionID).get()
  var voiceToTextChannelSettings = await firestoreDB.collection(voiceToTextCollectionID).get()
  var statChannelsSettings = await firestoreDB.collection(statChannelsCollectionID).get()
  var pollsSettings = await firestoreDB.collection(pollsCollectionID).get()

  roleMessageSettings.forEach(async (roleSettingDoc) => {
    let roleSettingJSON = roleSettingDoc.data()
    let roleSettingID = roleSettingDoc.id

    if (await interpretRoleSetting(client, roleSettingID, roleSettingJSON))
    {
      roleSettingDoc.set(roleSettingJSON)
    }
  })

  voiceToTextChannelSettings.forEach(async (voiceToTextSettingDoc) => {
    let voiceToTextSettingJSON = voiceToTextSettingDoc.data()
    let voiceToTextGuildID = voiceToTextSettingDoc.id
    await interpretVoiceToTextChannelSetting(voiceToTextGuildID, voiceToTextSettingJSON["voiceToTextMap"])
  })

  statChannelsSettings.forEach(async (statSettingDoc) => {
    let statSettingsJSON = statSettingDoc.data()
    let statSettingsID = statSettingDoc.id
    await interpretStatsSetting(client, statSettingsID, statSettingsJSON)
  })

  pollsSettings.forEach(async (pollSettingDoc) => {
    let pollSettingJSON = pollSettingDoc.data()
    let pollSettingID = pollSettingDoc.id
    await interpretPollSetting(pollSettingID, pollSettingJSON)
  })
})

// Nickname Enforcement

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  var clientMember = await newMember.guild.members.fetch(client.user)
  if (newMember.id !== clientMember.id) { return }

  updateNickname(clientMember)
})

function updateNickname(clientMember)
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

  if (client.user.presence.status === "idle")
  {
    client.user.setPresence({status: "online"})
    msg.channel.send("\\*yawn\\*")
  }

  if (sendMessageResponses(msg)) { return }

  var messageContent = msg.content.toLowerCase()
  if (msg.mentions.members && msg.mentions.members.has(client.user.id))
  {
    messageContent = messageContent.replace("<@!" + client.user.id + ">", "")
  }
  else { return }

  messageContent = messageContent.replace(/^\s*/, "").replace(/\s*$/, "")

  if (sendMessageCommands(msg, messageContent)) { return }
  if (sendDateCommands(msg, messageContent)) { return }

  if (await sendClearCommand(client, msg, messageContent)) { return }

  let pollID = await sendVoteCommand(msg, messageContent)
  if (pollID)
  {
    var uploadPollResponse = async (pollID, userID, questionIDToOptionIDMap) => {
      await firestoreDB.doc(pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + msg.author.id).set(questionIDToOptionIDMap)
    }

    let pollResponsePath = pollsCollectionID + "/" + pollID + "/" + pollResponsesCollectionID + "/" + msg.author.id
    let pollResponseDoc = await firestoreDB.doc(pollResponsePath).get()
    let previousPollResponseMessageIDs
    if (pollResponseDoc != null && pollResponseDoc.data() != null && pollResponseDoc.data().messageIDs != null)
    {
      previousPollResponseMessageIDs = pollResponseDoc.data().messageIDs
    }

    try
    {
      let newPollResponseMessageIDs = await sendVoteDM(client, msg.author, pollID, uploadPollResponse, previousPollResponseMessageIDs)
      await firestoreDB.doc(pollResponsePath).set({messageIDs: newPollResponseMessageIDs})
    }
    catch (error)
    {
      console.log("Vote DM Error: " + error)
    }

    return
  }

  switch (messageContent)
  {
    case "info":
    msg.channel.send(`βəτα Bot Dev 1.0\nCreated by <@${CREATOR_USER_ID}>\nwith inspiration from We4therman\n*\\*Powered By DELL OS\\**`)
    break

    case "ping":
    msg.channel.send("pong")
    break
  }

  if (!(msg.guildId == HOME_GUILD_ID && msg.member.roles.cache.find(role => role.name == technicianRoleName))) { return }

  if (sendRepeatCommand(msg, messageContent)) { return }
  if (sendSpeakCommand(msg, messageContent)) { return }

  switch (messageContent)
  {
    case "randomize":
    updateRandomColorRole()
    break

    case "logout":
    await prepareBotLogout("Bye bye for now!", msg)
    console.log(endLogMessage)

    logoutBot()
    break

    case "restart":
    prepareBotLogout("Bye bye for now!", msg)
      .then(client.destroy())
      .then(loginBot("And we're back!", msg.channel.id, msg.guild.id))
    break

    case "reboot":
    rebootBot("Bye bye for now!", "And we're back!", msg)
    break

    case "sleep":
    msg.channel.send("zzz")
    client.user.setPresence({status: "idle"})
    break
  }
})
