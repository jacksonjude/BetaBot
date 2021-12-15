import { TextChannel, Message, Client } from "discord.js"
import { Firestore } from "firebase-admin/firestore"

type ExecuteCommandFunction = (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => Promise<BotCommandError | void>

export class BotCommand
{
  parseCommandString: (messageString: string, channel: TextChannel) => boolean | string[]
  usageMessage: string | null

  executeCommand: ExecuteCommandFunction

  constructor(parseCommandStringFunction: (messageString: string, channel: TextChannel) => boolean | string[], usageMessage: string | null, executeCommand: ExecuteCommandFunction)
  {
    this.parseCommandString = parseCommandStringFunction
    this.usageMessage = "Usage: `@BetaBot " + usageMessage + "`"
    this.executeCommand = executeCommand
  }

  static fromRegex(fullRegex: RegExp, partialRegex: RegExp | null, usageMessage: string | null, executeCommand: ExecuteCommandFunction): BotCommand
  {
    return new BotCommand((messageString: string, channel: TextChannel) => {
      if (partialRegex && !partialRegex.test(messageString.toLowerCase())) { return false }
      if (!fullRegex.test(messageString.toLowerCase()))
      {
        if (partialRegex)
        {
          channel.send(usageMessage)
        }
        return false
      }
      return fullRegex.exec(messageString.toLowerCase()) as string[]
    }, usageMessage, executeCommand)
  }

  async execute(messageString: string, message: Message, client: Client, firestoreDB: Firestore): Promise<boolean>
  {
    let textChannel = message.channel as TextChannel
    let parseCallback = this.parseCommandString(messageString, textChannel)
    if (parseCallback === false || parseCallback === true) { return parseCallback }

    let currentArguments = parseCallback
    let commandCallback = await this.executeCommand(currentArguments, message, client, firestoreDB)
    if (commandCallback)
    {
      await textChannel.send("Error: " + commandCallback.errorMessage)
      commandCallback.shouldShowUsage && await textChannel.send(this.usageMessage)
    }
    return true
  }
}

export class BotCommandError
{
  errorMessage: string
  shouldShowUsage: boolean

  constructor(errorMessage: string, shouldShowUsage: boolean)
  {
    this.errorMessage = errorMessage
    this.shouldShowUsage = shouldShowUsage
  }
}
