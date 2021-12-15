import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'

export const initFirestore = function()
{
  const serviceAccount = JSON.parse(process.env.FIRESTORE_KEY_JSON)

  initializeApp({
    credential: cert(serviceAccount)
  })

  return getFirestore()
}

import { Client } from "discord.js"

import { interpretRoleSetting, removeRoleSetting, RoleMessageConfiguration } from "./roleMessages"
import { interpretVoiceToTextChannelSetting } from "./linkedTextChannels"
import { interpretStatsSetting, StatsConfiguration } from "./serverStats"

import { PollConfiguration, PollResponse } from "./poll/sharedPoll"
import { interpretDMPollSetting, removeDMPollSetting, cleanDMPollResponseMessages } from "./poll/dmPoll"
import { interpretServerPollSetting, removeServerPollSetting } from "./poll/serverPoll"

import { interpretRoleAssignmentSetting, RoleAssignmentConfiguration } from "./roleAssignment"

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
    updateDocFunction: async function(roleSettingDoc: QueryDocumentSnapshot, shouldDelete: boolean, client: Client) {
      let roleSettingDocData = roleSettingDoc.data()
      let roleSettingID = roleSettingDoc.id

      if (!shouldDelete && await interpretRoleSetting(client, roleSettingID, roleSettingDocData as RoleMessageConfiguration))
      {
        roleSettingDocData.set(roleSettingDocData)
      }
      else if (shouldDelete)
      {
        await removeRoleSetting(client, roleSettingID, roleSettingDocData as RoleMessageConfiguration)
      }
    }
  },
  {
    collectionID: voiceToTextCollectionID,
    updateDocFunction: async function(voiceToTextSettingDoc: QueryDocumentSnapshot, shouldDelete: boolean) {
      let voiceToTextSettingDocData = voiceToTextSettingDoc.data()
      let voiceToTextGuildID = voiceToTextSettingDoc.id

      if (!shouldDelete)
      {
        await interpretVoiceToTextChannelSetting(voiceToTextGuildID, voiceToTextSettingDocData["voiceToTextMap"])
      }
    }
  },
  {
    collectionID: statChannelsCollectionID,
    updateDocFunction: async function(statSettingDoc: QueryDocumentSnapshot, shouldDelete: boolean, client: Client, firestoreDB: Firestore) {
      let statSettingsDocData = statSettingDoc.data()
      let statSettingsID = statSettingDoc.id

      if (!shouldDelete)
      {
        await interpretStatsSetting(client, statSettingsID, statSettingsDocData as StatsConfiguration, firestoreDB)
      }
    }
  },
  {
    collectionID: pollsCollectionID,
    updateDocFunction: async function(pollSettingDoc: QueryDocumentSnapshot, shouldDelete: boolean, client: Client, firestoreDB: Firestore) {
      let pollSettingDocData = pollSettingDoc.data()
      let pollSettingID = pollSettingDoc.id

      if (!shouldDelete)
      {
        switch (pollSettingDocData.pollType)
        {
          case "dm":
          pollSettingDocData = await interpretDMPollSetting(client, pollSettingID, pollSettingDocData as PollConfiguration, firestoreDB)
          break

          case "server":
          pollSettingDocData = await interpretServerPollSetting(client, pollSettingID, pollSettingDocData as PollConfiguration, firestoreDB)
          break
        }

        firestoreDB.doc(pollsCollectionID + "/" + pollSettingID).set(pollSettingDocData)
      }
      else
      {
        switch (pollSettingDocData.pollType)
        {
          case "dm":
          await removeDMPollSetting(client, pollSettingID, pollSettingDocData as PollConfiguration)
          break

          case "server":
          await removeServerPollSetting(client, pollSettingID, pollSettingDocData as PollConfiguration)
          break
        }
      }
    },
    initFunction: async function(client: Client, firestoreDB: Firestore) {
      let pollSettingsCollection = await firestoreDB.collection(pollsCollectionID).get()
      pollSettingsCollection.forEach(async (pollSettingDoc) => {
        let pollResponses = await firestoreDB.collection(pollsCollectionID + "/" + pollSettingDoc.id + "/" + pollResponsesCollectionID).get()
        pollResponses.forEach((pollResponseDoc) => {
          cleanDMPollResponseMessages(client, pollResponseDoc.id, pollResponseDoc.data() as PollResponse)
        })
      })
    }
  },
  {
    collectionID: roleAssignmentCollectionID,
    updateDocFunction: async function(roleAssignmentSettingDoc: QueryDocumentSnapshot, shouldDelete: boolean, client: Client, firestoreDB: Firestore) {
      let roleAssignmentSettingDocData = roleAssignmentSettingDoc.data()
      let roleAssignmentSettingID = roleAssignmentSettingDoc.id

      if (!shouldDelete)
      {
        roleAssignmentSettingDocData = await interpretRoleAssignmentSetting(client, roleAssignmentSettingID, roleAssignmentSettingDocData as RoleAssignmentConfiguration)
        firestoreDB.doc(roleAssignmentCollectionID + "/" + roleAssignmentSettingID).set(roleAssignmentSettingDocData)
      }
    }
  }
]

export const initFirestoreCollectionListeners = function(firestoreDB: Firestore, client: Client)
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

            case "removed":
            collectionData.updateDocFunction(docChange.doc, true, client, firestoreDB)
            break
          }
        })
      })
    )

    collectionData.initFunction && collectionData.initFunction(client, firestoreDB)
  })
}
