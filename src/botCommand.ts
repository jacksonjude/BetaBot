import { TextChannel, Message, Client } from "discord.js"
import { Firestore } from "firebase-admin/firestore"

type ParseCommandStringFunction = (messageString: string, channel: TextChannel, usageMessage: string) => boolean | string[]
type ExecuteCommandFunction = (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => Promise<BotCommandError | void>

export class BotCommand
{
  parseCommandString: ParseCommandStringFunction
  usageMessage: string | null

  executeCommand: ExecuteCommandFunction

  constructor(parseCommandStringFunction: ParseCommandStringFunction, usageMessage: string | null, executeCommand: ExecuteCommandFunction)
  {
    this.parseCommandString = parseCommandStringFunction
    this.usageMessage = "**Usage: `@BetaBot " + usageMessage + "`**"
    this.executeCommand = executeCommand
  }

  static fromRegex(fullRegex: RegExp, partialRegex: RegExp | null, usageMessage: string | null, executeCommand: ExecuteCommandFunction): BotCommand
  {
    fullRegex = new RegExp(fullRegex, "i")
    partialRegex = new RegExp(partialRegex, "i")

    return new BotCommand((messageString: string, channel: TextChannel, usageMessage: string) => {
      let partialRegexTest = partialRegex && partialRegex.test(messageString)
      let fullRegxTest = fullRegex.test(messageString)

      if (!fullRegxTest)
      {
        if (partialRegexTest)
        {
          channel.send(usageMessage)
        }
        return false
      }
      return fullRegex.exec(messageString) as string[]
    }, usageMessage, executeCommand)
  }

  async execute(messageString: string, message: Message, client: Client, firestoreDB: Firestore): Promise<boolean>
  {
    let textChannel = message.channel as TextChannel
    let parseCallback = this.parseCommandString(messageString, textChannel, this.usageMessage)
    if (parseCallback === false || parseCallback === true) { return parseCallback }

    let currentArguments = parseCallback
    let commandCallback = await this.executeCommand(currentArguments, message, client, firestoreDB)
    if (commandCallback)
    {
      await textChannel.send("**Error: " + commandCallback.errorMessage + "**")
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
