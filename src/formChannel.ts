import { Client, TextChannel, Message, PermissionFlagsBits } from "discord.js"
import { Timestamp } from "firebase-admin/firestore"

import { CronJob } from "cron"

var formChannels: { [k: string]: FormChannel } = {}
var closeFormChannelCronJobs: { [k: string]: CronJob } = {}

export class FormChannel
{
  channelID: string
  whitelistUserIDs?: string[]
  closeConfig?: FormChannelCloseConfiguration
}

class FormChannelCloseConfiguration
{
  closeTime?: Timestamp
  closeMessage?: string
  closeRoleIDs?: string[]
}

export async function interpretFormChannelSetting(client: Client, formID: string, formChannel: FormChannel)
{
  formChannels[formID] = formChannel

  let textChannel = await client.channels.fetch(formChannel.channelID) as TextChannel
  filterFormChannelMessages(textChannel, [...formChannel.whitelistUserIDs, client.user.id])

  if (formChannel.closeConfig)
  {
    setupFormCloseCronJob(client, formID, formChannel)
  }
  else if (closeFormChannelCronJobs[formID])
  {
    closeFormChannelCronJobs[formID].stop()
    delete closeFormChannelCronJobs[formID]
  }
}

export function setupFormMessageEventHandlers(client: Client)
{
  client.on('messageCreate', (message) => {
    let formChannel = Object.values(formChannels).find(formChannel => {
      return formChannel.channelID == message.channelId
    })
    if (!formChannel) { return }
    filterFormChannelMessages(message.channel as TextChannel, [...formChannel.whitelistUserIDs, client.user.id])
  })
}

function setupFormCloseCronJob(client: Client, formID: string, formChannel: FormChannel)
{
  let formCloseCronJob = new CronJob(formChannel.closeConfig.closeTime.toDate(), () => {
    client.channels.fetch(formChannel.channelID).then(async (channel: TextChannel) => {
      for (let roleID of formChannel.closeConfig.closeRoleIDs)
      {
        await channel.permissionOverwrites.edit(roleID, {[PermissionFlagsBits.SendMessages.toString()]: false})
        await channel.send(formChannel.closeConfig.closeMessage)
      }
    })
  }, null, true)
  formCloseCronJob.start()

  if (closeFormChannelCronJobs[formID])
  {
    closeFormChannelCronJobs[formID].stop()
  }

  closeFormChannelCronJobs[formID] = formCloseCronJob
}

async function filterFormChannelMessages(textChannel: TextChannel, whitelistUserIDs: string[])
{
  let channelMessages: Message[]
  let usersWithMessages: string[] = []
  let previousChannelMessage: Message
  while (channelMessages == null || channelMessages.length > 0)
  {
    try
    {
      let lastChannelMessage = channelMessages?.[channelMessages.length-1]
      channelMessages = Array.from((await textChannel.messages.fetch({before: lastChannelMessage?.id, limit: 100})).values())
      previousChannelMessage = channelMessages.length > 0 ? lastChannelMessage : null
    }
    catch
    {
      break
    }

    channelMessages = await channelMessages.filterAsync(async (message) => {
      if (whitelistUserIDs.includes(message.author.id)) return true

      if (usersWithMessages.includes(message.author.id))
      {
        try
        {
          await message.delete()
        }
        catch {}
        return false
      }
      else
      {
        usersWithMessages.push(message.author.id)
        return true
      }
    })
    if (channelMessages.length == 0 && previousChannelMessage)
    {
      channelMessages = [previousChannelMessage]
    }
  }
}
