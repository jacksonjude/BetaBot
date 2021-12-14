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

import { interpretRoleSetting, removeRoleSetting } from "./roleMessages.js"
import { interpretVoiceToTextChannelSetting } from "./linkedTextChannels.js"
import { interpretStatsSetting } from "./serverStats.js"

import { interpretDMPollSetting, removeDMPollSetting, cleanDMPollResponseMessages } from "./poll/dmPoll.js"
import { interpretServerPollSetting, removeServerPollSetting } from "./poll/serverPoll.js"

import { interpretRoleAssignmentSetting } from "./roleAssignment.js"

const roleMessageCollectionID = "roleMessageConfigurations"
const voiceToTextCollectionID = "voiceToTextConfigurations"
const statChannelsCollectionID = "statsConfigurations"
const pollsCollectionID = "pollConfigurations"
const pollResponsesCollectionID = "responses"
const roleAssignmentCollectionID = "roleAssignmentConfigurations"

var firestoreCollectionListeners = []
const firestoreCollectionSyncHandlers = [
  {
    collectionID: roleMessageCollectionID,
    updateDocFunction: async function(roleSettingDoc, shouldDelete, client) {
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
    updateDocFunction: async function(statSettingDoc, shouldDelete, client, firestoreDB) {
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
    updateDocFunction: async function(pollSettingDoc, shouldDelete, client, firestoreDB) {
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
    initFunction: async function(client, firestoreDB) {
      let pollSettingsCollection = await firestoreDB.collection(pollsCollectionID).get()
      pollSettingsCollection.forEach(async (pollSettingDoc) => {
        let pollResponses = await firestoreDB.collection(pollsCollectionID + "/" + pollSettingDoc.id + "/" + pollResponsesCollectionID).get()
        pollResponses.forEach((pollResponseDoc) => {
          cleanDMPollResponseMessages(client, pollResponseDoc.id, pollResponseDoc.data())
        })
      })
    }
  },
  {
    collectionID: roleAssignmentCollectionID,
    updateDocFunction: async function(roleAssignmentSettingDoc, shouldDelete, client, firestoreDB) {
      let roleAssignmentSettingJSON = roleAssignmentSettingDoc.data()
      let roleAssignmentSettingID = roleAssignmentSettingDoc.id

      if (!shouldDelete)
      {
        roleAssignmentSettingJSON = await interpretRoleAssignmentSetting(client, roleAssignmentSettingID, roleAssignmentSettingJSON)
        firestoreDB.doc(roleAssignmentCollectionID + "/" + roleAssignmentSettingID).set(roleAssignmentSettingJSON)
      }
    }
  }
]

export const initFirestoreCollectionListeners = function(firestoreDB, client)
{
  firestoreCollectionSyncHandlers.forEach((collectionData) => {
    let collectionRef = firestoreDB.collection(collectionData.collectionID)

    firestoreCollectionListeners.push(
      collectionRef.onSnapshot((settingSnapshot) => {
        settingSnapshot.docChanges().forEach((docChange) => {
          console.log("Firestore: " + docChange.type + " " + collectionData.collectionID + "/" + docChange.doc.id)

          switch (docChange.type)
          {
            case "added":
            case "modified":
            collectionData.updateDocFunction(docChange.doc, false, client, firestoreDB)
            break

            case "deleted":
            collectionData.updateDocFunction(docChange.doc, true, client, firestoreDB)
            break
          }
        })
      })
    )

    collectionData.initFunction && collectionData.initFunction(client, firestoreDB)
  })
}
