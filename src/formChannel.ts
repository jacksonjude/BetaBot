import { Client, TextChannel, Message, PermissionFlagsBits } from "discord.js"
import { Timestamp } from "firebase-admin/firestore"

let formChannels: { [k: string]: FormChannel } = {}

export class FormChannel
{
  channelID: string
  closeTime: Timestamp
}

export async function interpretFormChannelSetting(client: Client, formID: string, formChannel: FormChannel)
{
  formChannels[formID] = formChannel

  const textChannel = await client.channels.fetch(formChannel.channelID) as TextChannel
  filterFormChannelMessages(textChannel)
}

export function setupFormMessageEventHandlers(client: Client)
{
  client.on('messageCreate', async (message) => {
    const formChannel = Object.values(formChannels).find(formChannel => {
      return formChannel.channelID == message.channelId
    })
    if (!formChannel) { return }
    
    if (Date.now() > formChannel.closeTime.toMillis())
    {
      await message.delete()
      return
    }
    
    filterFormChannelMessages(message.channel as TextChannel)
  })
}

async function filterFormChannelMessages(textChannel: TextChannel)
{
  let channelMessages: Message[]
  const usersWithMessages: string[] = []
  let previousChannelMessage: Message
  while (channelMessages == null || channelMessages.length > 0)
  {
    try
    {
      const lastChannelMessage = channelMessages?.[channelMessages.length-1]
      channelMessages = Array.from((await textChannel.messages.fetch({before: lastChannelMessage?.id, limit: 100})).values())
      previousChannelMessage = channelMessages.length > 0 ? lastChannelMessage : null
    }
    catch
    {
      break
    }
    
    const filteredChannelMessages = []
    for (const message of channelMessages)
    {
      if (!/^<@\d+>.+/.test(message.content)) {
        // console.log("Skipping", message.createdTimestamp, message.content)
        filteredChannelMessages.push(message)
        continue
      }
      
      // console.log("Checking", message.createdTimestamp, message.content)
      
      const userID = message.content.replace(/>.+/, '').replace(/<@/, '')
      if (usersWithMessages.includes(userID))
      {
        try
        {
          await message.delete()
        }
        catch {}
      }
      else
      {
        usersWithMessages.push(userID)
        filteredChannelMessages.push(message)
      }
    }
    channelMessages = filteredChannelMessages

    if (channelMessages.length == 0 && previousChannelMessage)
    {
      channelMessages = [previousChannelMessage]
    }
  }
}
