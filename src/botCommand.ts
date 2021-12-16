import { TextChannel, Message, Client, User, GuildMember, Guild } from "discord.js"
import { Firestore } from "firebase-admin/firestore"

type ParseCommandStringFunction = (messageString: string, channel?: TextChannel, usageMessage?: string) => boolean | string[]
type ExecuteCommandFunction = (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => Promise<BotCommandError | void>

export class BotCommand
{
  name: string
  description: string

  parseCommandString: ParseCommandStringFunction
  usageMessage: string | null

  executeCommand: ExecuteCommandFunction
  executionRequirement: BotCommandRequirement | null

  constructor(name: string, description: string, parseCommandStringFunction: ParseCommandStringFunction, usageMessage: string | null, executeCommand: ExecuteCommandFunction, executionRequirement?: BotCommandRequirement)
  {
    this.name = name
    this.description = description
    this.parseCommandString = parseCommandStringFunction
    this.usageMessage = "**Usage: `@BetaBot " + usageMessage + "`**"
    this.executeCommand = executeCommand
    this.executionRequirement = executionRequirement
  }

  static fromRegex(name: string, description: string, fullRegex: RegExp, partialRegex: RegExp | null, usageMessage: string | null, executeCommand: ExecuteCommandFunction, executionRequirement?: BotCommandRequirement): BotCommand
  {
    fullRegex = new RegExp(fullRegex, "i")
    partialRegex = partialRegex ? new RegExp(partialRegex, "i") : null

    return new BotCommand(name, description, (messageString: string, channel?: TextChannel, usageMessage?: string) => {
      let partialRegexTest = partialRegex && partialRegex.test(messageString)
      let fullRegexTest = fullRegex.test(messageString)

      if (!fullRegexTest)
      {
        if (partialRegexTest)
        {
          channel && usageMessage && channel.send(usageMessage)
          return true
        }
        return false
      }

      return fullRegex.exec(messageString) as string[]
    }, usageMessage, executeCommand, executionRequirement)
  }

  async execute(messageString: string, message: Message, client: Client, firestoreDB: Firestore): Promise<boolean>
  {
    let textChannel = message.channel as TextChannel
    let parseCallback = this.parseCommandString(messageString, textChannel, this.usageMessage)
    if (parseCallback === false || parseCallback === true) { return false }

    if (this.executionRequirement && !(await this.executionRequirement.testMessage(message))) { return false }

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

type RequirementTestFunction = (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild) => Promise<boolean>

export class BotCommandRequirement
{
  requirementTest: RequirementTestFunction

  constructor(requirementTestFunction: RequirementTestFunction)
  {
    this.requirementTest = requirementTestFunction
  }

  async testMessage(message: Message): Promise<boolean>
  {
    return await this.requirementTest(message.author, message.member, message, message.channel as TextChannel, message.guild)
  }
}

export class BotCommandUserIDRequirement extends BotCommandRequirement
{
  constructor(userID: string)
  {
    super(async (user: User) => {
      return user.id == userID
    })
  }
}

export class BotCommandRoleIDRequirement extends BotCommandRequirement
{
  constructor(roleID: string)
  {
    super(async (_, member: GuildMember) => {
      return member.roles.cache.some(role => role.id == roleID)
    })
  }
}

export class BotCommandServerIDRequirement extends BotCommandRequirement
{
  constructor(serverID: string)
  {
    super(async (_, __, ___, ____, server: Guild) => {
      return server.id == serverID
    })
  }
}

export class BotCommandUnionRequirement extends BotCommandRequirement
{
  constructor(requirements: BotCommandRequirement[])
  {
    super(async (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild) => {
      return requirements.some(requirement => requirement.requirementTest(user, member, message, channel, server))
    })
  }
}

export class BotCommandIntersectionRequirement extends BotCommandRequirement
{
  constructor(requirements: BotCommandRequirement[])
  {
    super(async (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild) => {
      return requirements.every(requirement => requirement.requirementTest(user, member, message, channel, server))
    })
  }
}

export class BotCommandInverseRequirement extends BotCommandRequirement
{
  constructor(requirement: BotCommandRequirement)
  {
    super(async (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild) => {
      return !requirement.requirementTest(user, member, message, channel, server)
    })
  }
}
