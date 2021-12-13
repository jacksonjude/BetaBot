import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

export const initFirestore = function()
{
  const serviceAccount = JSON.parse(process.env.FIRESTORE_KEY_JSON)

  initializeApp({
    credential: cert(serviceAccount)
  })

  return getFirestore()
}

import { interpretDMPollSetting, removeDMPollSetting, cleanDMPollResponseMessages } from "./poll/dmPoll.js"
import { interpretServerPollSetting, removeServerPollSetting } from "./poll/serverPoll.js"

import { interpretRoleSetting, removeRoleSetting } from "./roleMessages.js"
import { interpretVoiceToTextChannelSetting } from "./linkedTextChannels.js"
import { interpretStatsSetting } from "./serverStats.js"

const roleMessageCollectionID = "roleMessageConfigurations"
const voiceToTextCollectionID = "voiceToTextConfigurations"
const statChannelsCollectionID = "statsConfigurations"
const pollsCollectionID = "pollConfigurations"
const pollResponsesCollectionID = "responses"

var firestoreCollectionListeners = []
const firebaseCollectionSyncHandlers = [
  {
    collectionID: roleMessageCollectionID,
    updateDocFunction: async function(roleSettingDoc, shouldDelete, _, client) {
      let roleSettingJSON = roleSettingDoc.data()
      let roleSettingID = roleSettingDoc.id

      if (!shouldDelete && await interpretRoleSetting(client, roleSettingID, roleSettingJSON))
      {
        roleSettingDoc.set(roleSettingJSON)
      }
      else if (shouldDelete)
      {
        await removeRoleSetting(client, roleSettingID, roleSettingJSON)
      }
    }
  },
  {
    collectionID: voiceToTextCollectionID,
    updateDocFunction: async function(voiceToTextSettingDoc, shouldDelete) {
      let voiceToTextSettingJSON = voiceToTextSettingDoc.data()
      let voiceToTextGuildID = voiceToTextSettingDoc.id

      if (!shouldDelete)
      {
        await interpretVoiceToTextChannelSetting(voiceToTextGuildID, voiceToTextSettingJSON["voiceToTextMap"])
      }
    }
  },
  {
    collectionID: statChannelsCollectionID,
    updateDocFunction: async function(statSettingDoc, shouldDelete, firestoreDB, client) {
      let statSettingsJSON = statSettingDoc.data()
      let statSettingsID = statSettingDoc.id

      if (!shouldDelete)
      {
        await interpretStatsSetting(client, statSettingsID, statSettingsJSON, firestoreDB)
      }
    }
  },
  {
    collectionID: pollsCollectionID,
    updateDocFunction: async function(pollSettingDoc, shouldDelete, firestoreDB, client) {
      let pollSettingJSON = pollSettingDoc.data()
      let pollSettingID = pollSettingDoc.id

      if (!shouldDelete)
      {
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
      }
      else
      {
        switch (pollSettingJSON.pollType)
        {
          case "dm":
          await removeDMPollSetting(client, pollSettingID, pollSettingJSON)
          break

          case "server":
          await removeServerPollSetting(client, pollSettingID, pollSettingJSON)
          break
        }
      }
    },
    initFunction: async function(firestoreDB, client) {
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

export const initFirestoreCollectionListeners = function(firestoreDB, client)
{
  firebaseCollectionSyncHandlers.forEach(async (collectionData) => {
    let collectionRef = firestoreDB.collection(collectionData.collectionID)

    firestoreCollectionListeners.push(
      collectionRef.onSnapshot((settingSnapshot) => {
        settingSnapshot.docChanges().forEach((docChange) => {
          console.log("Firestore: " + docChange.type + " " + collectionData.collectionID + "/" + docChange.doc.id)

          switch (docChange.type)
          {
            case "added":
            case "modified":
            collectionData.updateDocFunction(docChange.doc, false, firestoreDB, client)
            break

            case "deleted":
            collectionData.updateDocFunction(docChange.doc, true, firestoreDB, client)
            break
          }
        })
      })
    )

    collectionData.initFunction && collectionData.initFunction(firestoreDB, client)
  })
}
