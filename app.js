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
import { sendMessageResponses } from "./src/messageResponses.js"
import { sendDateCommands, sendMessageCommands, sendEmoteSpellCommand, sendClearCommand, sendRepeatCommand, sendSpeakCommand } from "./src/miscCommands.js"

import { sendExportPollResultsCommand, executeExportPollResultsCommand } from "./src/poll/sharedPoll.js"
import { interpretDMPollSetting, cleanDMPollResponseMessages, sendDMVoteCommand, executeDMVoteCommand } from "./src/poll/dmPoll.js"
import { interpretServerPollSetting } from "./src/poll/serverPoll.js"

import { interpretRoleSetting } from "./src/roleMessages.js"
import { interpretVoiceToTextChannelSetting, setupVoiceChannelEventHandler } from "./src/linkedTextChannels.js"
import { interpretStatsSetting, setupMemberStatsEventHandlers } from "./src/serverStats.js"

import { initFirestore } from "./src/firebase.js"

const roleMessageCollectionID = "roleMessageConfigurations"
const voiceToTextCollectionID = "voiceToTextConfigurations"
const statChannelsCollectionID = "statsConfigurations"
const pollsCollectionID = "pollConfigurations"
const pollResponsesCollectionID = "responses"

const HOME_GUILD_ID = "704218896298934317"
const TECHNICIAN_ROLE_ID = "804147385923403826"

var firestoreDB
var firestoreCollectionListeners = []
const firebaseCollectionSyncHandlers = [
  {
    collectionID: roleMessageCollectionID,
    handleDocFunction: async function(roleSettingDoc) {
      let roleSettingJSON = roleSettingDoc.data()
      let roleSettingID = roleSettingDoc.id

      if (await interpretRoleSetting(client, roleSettingID, roleSettingJSON))
      {
        roleSettingDoc.set(roleSettingJSON)
      }
    }
  },
  {
    collectionID: voiceToTextCollectionID,
    handleDocFunction: async function(voiceToTextSettingDoc) {
      let voiceToTextSettingJSON = voiceToTextSettingDoc.data()
      let voiceToTextGuildID = voiceToTextSettingDoc.id
      await interpretVoiceToTextChannelSetting(voiceToTextGuildID, voiceToTextSettingJSON["voiceToTextMap"])
    }
  },
  {
    collectionID: statChannelsCollectionID,
    handleDocFunction: async function(statSettingDoc) {
      let statSettingsJSON = statSettingDoc.data()
      let statSettingsID = statSettingDoc.id
      await interpretStatsSetting(client, statSettingsID, statSettingsJSON)
    }
  },
  {
    collectionID: pollsCollectionID,
    handleDocFunction: async function(pollSettingDoc) {
      let pollSettingJSON = pollSettingDoc.data()
      let pollSettingID = pollSettingDoc.id

      switch (pollSettingJSON.pollType)
      {
        case "dm":
        pollSettingJSON = await interpretDMPollSetting(client, pollSettingID, pollSettingJSON, firestoreDB)
        break

        case "server":
        pollSettingJSON = await interpretServerPollSetting(client, pollSettingID, pollSettingJSON, firestoreDB)
        break
      }

      firestoreDB.doc(pollsCollectionID + "/" + pollSettingID).set(pollSettingJSON)
    },
    initFunction: async function() {
      let pollSettingsCollection = await firestoreDB.collection(pollsCollectionID).get()
      pollSettingsCollection.forEach(async (pollSettingDoc) => {
        let pollResponses = await firestoreDB.collection(pollsCollectionID + "/" + pollSettingDoc.id + "/" + pollResponsesCollectionID).get()
        pollResponses.forEach((pollResponseDoc) => {
          cleanDMPollResponseMessages(client, pollResponseDoc.id, pollResponseDoc.data())
        })
      })
    }
  }
]

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

  initFirestoreCollectionListeners()
})

function initFirestoreCollectionListeners()
{
  firestoreDB = initFirestore()

  firebaseCollectionSyncHandlers.forEach(async (collectionData) => {
    let collectionRef = firestoreDB.collection(collectionData.collectionID)

    firestoreCollectionListeners.push(
      collectionRef.onSnapshot((settingSnapshot) => {
        settingSnapshot.docChanges().forEach((docChange) => {
          console.log("Firestore: " + docChange.type + " " + collectionData.collectionID + "/" + docChange.doc.id)
          collectionData.handleDocFunction(docChange.doc)
        })
      })
    )

    collectionData.initFunction && collectionData.initFunction()
  })
}

// Nickname Enforcement

client.on('guildMemberUpdate', async (_, newMember) => {
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

  var messageContent = msg.content
  if (msg.mentions.members && msg.mentions.members.has(client.user.id))
  {
    messageContent = messageContent.replace(new RegExp("<@!?" + client.user.id + ">"), "")
  }
  else { return }

  messageContent = messageContent.replace(/^\s*/, "").replace(/\s*$/, "")

  // console.log("Command from " + msg.author.id + " in " + msg.guildId + " '" + messageContent + "'")

  if (sendMessageCommands(msg, messageContent)) { return }
  if (sendDateCommands(msg, messageContent)) { return }
  if (sendEmoteSpellCommand(msg, messageContent))

  if (await sendClearCommand(client, msg, messageContent)) { return }

  let pollID = await sendDMVoteCommand(msg, messageContent)
  if (pollID)
  {
    await executeDMVoteCommand(client, msg.author, pollID, firestoreDB)
    return
  }

  let exportPollID = await sendExportPollResultsCommand(msg, messageContent)
  if (exportPollID)
  {
    await executeExportPollResultsCommand(msg.author, exportPollID, firestoreDB)
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

  if (!(msg.guildId == HOME_GUILD_ID && msg.member.roles.cache.find(role => role.id == TECHNICIAN_ROLE_ID))) { return }

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
