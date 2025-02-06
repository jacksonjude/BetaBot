import { User, Guild, Role, RoleResolvable, Client, GuildEmoji, ReactionEmoji, EmojiResolvable, Message } from 'discord.js'

// Update Roles

export async function setRole(user: User, guild: Guild, role: RoleResolvable, shouldAddRole: boolean)
{
  guild = await guild.fetch()
  let guildMember = await guild.members.fetch(user)

  if (shouldAddRole)
  {
    guildMember.roles.add(role)
  }
  else
  {
    guildMember.roles.remove(role)
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

import emojiConverter from 'discord-emoji-converter'
const overrideEmoteNameToEmojiMap = {
  ":white_heart:": "🤍",
  ":map:": "🗺️",
  ":regional_indicator_i:": "🇮",
  ":pen_ballpoint:": "🖊"
}
const overrideEmojiToEmoteNameMap = {
  "🤍": ":white_heart:",
  "🗺️": ":map:",
  "🇮": ":regional_indicator_i:",
  "🖊": ":pen_ballpoint:"
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

  static async isValidEmote(emoji: EmojiResolvable, client: Client)
  {
    try
    {
      return new Emote(emoji as string).name != null
    }
    catch (e)
    {
      try
      {
        return await Emote.fromEmoji(emoji).toEmoji(client) != null
      }
      catch (e)
      {
        return false
      }
    }
  }

  toString()
  {
    return this.id ? `<${this.isAnimated ? "a" : ""}:${this.name}:${this.id}>` : `:${this.name}:`
  }

  async toEmoji(client: Client): Promise<EmojiResolvable>
  {
    return await Emote.getEmoji(client, this.name, this.id)
  }

  private static getEmoteString(emoji: EmojiResolvable): string
  {
    if (emoji instanceof GuildEmoji)
    {
      return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`
    }

    let emojiString = emoji instanceof ReactionEmoji ? emoji.toString() : emoji as string
    
    if (emojiString.startsWith("<"))
    {
      return emojiString
    }
    
    if (overrideEmojiToEmoteNameMap[emojiString])
    {
      return overrideEmojiToEmoteNameMap[emojiString]
    }
    
    try
    {
      return emojiConverter.getShortcode(emojiString)
    }
    catch (error) {}
    
    try
    {
      return emojiConverter.getShortcode(removeEmojiVariations(emojiString))
    }
    catch (error)
    {
      console.log(`[Emote] Emoji converter error while decoding ${emoji}: ${error}`)
    }
  }

  private static async getEmoji(client: Client, emoteName: string, emoteID?: string): Promise<EmojiResolvable>
  {
    let emojiCache = client.emojis.cache
    let emoji = emojiCache.find(emoji => emoji.id == emoteID && emoji.name == emoteName)
    if (emoji != null)
    {
      return emoji
    }
    
    if (emoteID)
    {
      let guilds = Array.from(client.guilds.cache.values())
      for (let guild of guilds)
      {
        let emoji: GuildEmoji
        try
        {
          emoji = await guild.emojis.fetch(emoteID)
        }
        catch {}
        if (emoji != null)
        {
          return emoji
        }
      }
    }
    
    try
    {
      return emojiConverter.getEmoji(emoteName)
    }
    catch
    {
      return overrideEmoteNameToEmojiMap[":" + emoteName + ":"]
    }
  }
}

function removeEmojiVariations(str) {
  return str.normalize('NFKD').replace(/[\uFE0F\u20E3]/g, '');
}

// Types

export type HandleCommandExecution = (messageContent: string, msg: Message) => Promise<void>

// Prototypes

declare global
{
  interface Date
  {
    stdTimezoneOffset(): void
    dstTimezoneOffset(): void
    isDSTObserved(): boolean
    getOffsetDueToDST(): number
    toDMYString(): string
    changeTimezone(ianatz: string, multiplier: number): void
  }
}

Date.prototype.stdTimezoneOffset = function() {
  var jan = new Date(this.getFullYear(), 0, 1)
  var jul = new Date(this.getFullYear(), 6, 1)
  return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())
}

Date.prototype.dstTimezoneOffset = function() {
  var jan = new Date(this.getFullYear(), 0, 1)
  var jul = new Date(this.getFullYear(), 6, 1)
  return Math.min(jan.getTimezoneOffset(), jul.getTimezoneOffset())
}

Date.prototype.isDSTObserved = function() {
  return this.getTimezoneOffset() < this.stdTimezoneOffset()
}

Date.prototype.getOffsetDueToDST = function() {
  return 1000*60*(this.isDSTObserved() ? this.stdTimezoneOffset()-this.getTimezoneOffset() : this.dstTimezoneOffset()-this.getTimezoneOffset())
}

Date.prototype.toDMYString = function() {
  return (this.getMonth()+1) + "/" + this.getDate() + "/" + this.getFullYear()
}

Date.prototype.changeTimezone = function(ianatz: string, multiplier: number) {
  // suppose the date is 12:00 UTC
  var invdate = new Date(this.toLocaleString('en-US', {
    timeZone: ianatz
  }))

  var diff = this.getTime() - invdate.getTime()
  diff *= multiplier

  this.setTime(this.getTime() - diff) // needs to subtract
}
