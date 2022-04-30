import { Client, TextChannel, DMChannel, MessageReaction, User, Message, ReactionCollector } from "discord.js"

const catchAllFilter = () => true

export class ActionMessage<T>
{
  client: Client
  channel: TextChannel | DMChannel
  liveMessage: Message
  messageID: string
  messageSettings: T

  getMessageContent: (messageSettings: T, channel: TextChannel | DMChannel) => Promise<string>
  handleMessageCreation: (message: Message, messageSettings: T) => Promise<void>
  handleMessageReaction: (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, messageSettings: T) => void

  reactionCollector: ReactionCollector

  constructor(channel: TextChannel | DMChannel, messageID: string, messageSettings: T,
    getMessageContent: (messageSettings: T, channel: TextChannel | DMChannel) => Promise<string>,
    handleMessageCreation: (message: Message, messageSettings: T) => Promise<void>,
    handleMessageReaction: (reaction: MessageReaction, user: User, reactionEventType: MessageReactionEventType, messageSettings: T) => void
  )
  {
    this.channel = channel
    this.messageID = messageID
    this.messageSettings = messageSettings
    this.getMessageContent = getMessageContent
    this.handleMessageCreation = handleMessageCreation
    this.handleMessageReaction = handleMessageReaction
  }

  async initActionMessage(): Promise<void>
  {
    this.liveMessage = await this.sendMessage()

    if (this.messageID != null)
    {
      if (this.reactionCollector)
      {
        this.reactionCollector.stop()
      }

      this.reactionCollector = this.liveMessage.createReactionCollector({ filter: catchAllFilter, dispose: true })
      this.reactionCollector.on('collect', async (reaction, user) => {
        await user.fetch()
        console.log("Add", reaction.emoji.name, user.username)
        this.handleMessageReaction(reaction, user, "added", this.messageSettings)
      })
      this.reactionCollector.on('remove', async (reaction, user) => {
        await user.fetch()
        console.log("Remove", reaction.emoji.name, user.username)
        this.handleMessageReaction(reaction, user, "removed", this.messageSettings)
      })
    }
  }

  async sendMessage(): Promise<Message>
  {
    let shouldCreateMessage = this.messageID == null
    let messageContent = await this.getMessageContent(this.messageSettings, this.channel)

    let message: Message

    if (!shouldCreateMessage)
    {
      try
      {
        message = this.liveMessage ?? await this.channel.messages.fetch(this.messageID)
        if (message.content != messageContent)
        {
          message.edit(messageContent)
        }
      }
      catch
      {
        shouldCreateMessage = true
      }
    }

    if (shouldCreateMessage)
    {
      message = await this.channel.send(messageContent)
      this.messageID = message.id

      await this.handleMessageCreation(message, this.messageSettings)
    }

    return message
  }

  async removeActionMessage(): Promise<void>
  {
    this.reactionCollector.stop()

    try
    {
      await this.channel.messages.delete(this.messageID)
    }
    catch {}
  }
}

export type MessageReactionEventType = "added" | "removed"

declare global
{
  interface String
  {
    containsEmoji(): boolean
  }
}

String.prototype.containsEmoji = function(): boolean {
  return /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/gi.test(this)
}
