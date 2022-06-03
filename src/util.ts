import { User, Guild, Role, Client, GuildEmoji, ReactionEmoji, EmojiResolvable } from 'discord.js'

// Update Roles

export async function setRole(user: User, guild: Guild, roleID: string, shouldAddRole: boolean)
{
  var roleObject = (await getRolesByID([roleID], guild))[0]
  if (roleObject == null) { return false }

  var guildMember = await guild.members.fetch(user)

  if (shouldAddRole)
  {
    guildMember.roles.add(roleObject)
  }
  else
  {
    guildMember.roles.remove(roleObject)
  }

  return true
}

export async function getRolesByID(roleIDs: string[], guild?: Guild, guildID?: string, client?: Client)
{
  if (!guild && (!guildID || !client)) { return [] }

  guild = guild ?? await client.guilds.fetch(guildID)
  let roleObjects: Role[] = []

  for (let roleID of roleIDs)
  {
    let roleObject = await guild.roles.fetch(roleID)
    roleObjects.push(roleObject)
  }

  return roleObjects
}

// Emoji Converter

import * as emojiConverter from 'node-emoji'
const overrideEmoteNameToEmojiMap = {
  "white_heart": "🤍"
}
const overrideEmojiToEmoteNameMap = {
  "🤍": "white_heart"
}

export function getEmoji(client: Client, emoteName: string, emoteID?: string): EmojiResolvable
{
  let emojiCache = client.emojis.cache
  let emoji = emojiCache.find(emoji => emoji.id == emoteID && emoji.name == emoteName)
  if (emoji != null)
  {
    return emoji
  }

  let emote = emojiConverter.get(":" + emoteName + ":")
  if (emote != null && !emote.includes(":"))
  {
    return emote
  }

  return overrideEmoteNameToEmojiMap[emoteName]
}

export function getEmoteName(emoji: EmojiResolvable)
{
  let emojiString: string
  if (emoji instanceof GuildEmoji || emoji instanceof ReactionEmoji)
  {
    emojiString = emoji.name
  }
  else
  {
    emojiString = emoji as string
  }
  return overrideEmojiToEmoteNameMap[emoji.toString()] ?? emojiConverter.unemojify(emojiString).replace(/:/g, '')
}

export class Emote
{
  name: string
  id: string
  isAnimated: boolean

  constructor(emoteString: string)
  {
    this.name = /:(\w+):/.exec(emoteString)[1]
    this.id = (/<a?:\w+:(\d+)>/.exec(emoteString) ?? [])[1]
    this.isAnimated = /<a:\w+:\d+>/.test(emoteString)
  }

  static fromEmoji(emoji: EmojiResolvable)
  {
    return new Emote(Emote.getEmoteString(emoji))
  }

  static fromStringList(emotesString: string)
  {
    let emotes: Emote[] = []
    const emoteRegex = /^\s*(<?a?:\w+:\d*>?)/

    while (emoteRegex.test(emotesString))
    {
      let singleEmoteString = emoteRegex.exec(emotesString)[1]
      let newEmote = new Emote(singleEmoteString)

      emotes.push(newEmote)
      emotesString = emotesString.replace(singleEmoteString, "")
    }

    return emotes
  }

  toString()
  {
    return this.id ? `<${this.isAnimated ? "a" : ""}:${this.name}:${this.id}>` : `:${this.name}:`
  }

  toEmoji(client: Client): EmojiResolvable
  {
    return Emote.getEmoji(client, this.name, this.id)
  }

  private static getEmoteString(emoji: EmojiResolvable): string
  {
    if (emoji instanceof GuildEmoji || emoji instanceof ReactionEmoji)
    {
      return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`
    }

    let emojiString = emoji as string
    return overrideEmojiToEmoteNameMap[emoji.toString()] ?? emojiConverter.unemojify(emojiString).replace(/:/g, '')
  }

  private static getEmoji(client: Client, emoteName: string, emoteID?: string): EmojiResolvable
  {
    let emojiCache = client.emojis.cache
    let emoji = emojiCache.find(emoji => emoji.id == emoteID && emoji.name == emoteName)
    if (emoji != null)
    {
      return emoji
    }

    let emote = emojiConverter.get(":" + emoteName + ":")
    if (emote != null && !emote.includes(":"))
    {
      return emote
    }

    return overrideEmoteNameToEmojiMap[emoteName]
  }
}

// class ServerEmote extends Emote
// {
//   constructor(emoteString: string)
//   {
//     super(emoteString)
//     this.id = /:<a:\w+:(\d+)>:/.exec(emoteString)[1]
//     this.isAnimated = /:<a:\w+:\d+>:/.test(emoteString)
//   }
//
//   toString()
//   {
//     return `<${this.isAnimated ? "a" : ""}:${this.name}:${this.id}>`
//   }
//
//   toEmoji(client: Client): EmojiResolvable
//   {
//     return getEmoji(client, this.name, this.id)
//   }
// }
