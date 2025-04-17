import { TextChannel, Message, Client, User, GuildMember, Guild, PermissionResolvable } from "discord.js"
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

  async execute(messageString: string, message: Message, client: Client, firestoreDB: Firestore, fromAlias: boolean): Promise<boolean>
  {
    let textChannel = message.channel as TextChannel
    let parseCallback = this.parseCommandString(messageString, textChannel, this.usageMessage)
    if (parseCallback === false || parseCallback === true) { return false }

    if (this.executionRequirement && !await this.executionRequirement.testMessage(message, fromAlias, parseCallback))
    {
      await textChannel.send(`**Error: <@${message.author.id}> has invalid permissions to run ${this.name}**`)
      console.log(`[Bot Command] Invalid permissions for ${message.author.username} to run ${this.name} in ${message.guild.name}: ${this.executionRequirement.toString()}`)
      return false
    }

    let commandCallback = await this.executeCommand(parseCallback, message, client, firestoreDB)
    if (commandCallback)
    {
      await textChannel.send("**Error: " + commandCallback.errorMessage + "**")
      commandCallback.shouldShowUsage && await textChannel.send(this.usageMessage)
    }
    return true
  }

  withRequirement(requirement: BotCommandRequirement): BotCommand
  {
    this.executionRequirement = requirement
    return this
  }
  
  withAdditionalRequirement(requirement: BotCommandRequirement): BotCommand
  {
    if (this.executionRequirement != null)
    {
      this.executionRequirement = new BotCommandIntersectionRequirement([requirement, this.executionRequirement])
    }
    else
    {
      this.executionRequirement = requirement
    }
    return this
  }
  
  withOverrideRequirement(requirement: BotCommandRequirement): BotCommand
  {
    if (this.executionRequirement != null)
    {
      this.executionRequirement = new BotCommandUnionRequirement([requirement, this.executionRequirement])
    }
    else
    {
      this.executionRequirement = requirement
    }
    return this
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

type RequirementTestFunction = (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean, commandArguments: string[]) => Promise<boolean>

export class BotCommandRequirement
{
  requirementTest: RequirementTestFunction

  constructor(requirementTestFunction: RequirementTestFunction)
  {
    this.requirementTest = requirementTestFunction
  }

  async testMessage(message: Message, fromAlias: boolean, commandArguments: string[]): Promise<boolean>
  {
    return this.requirementTest(message.author, message.member, message, message.channel as TextChannel, message.guild, fromAlias, commandArguments)
  }
  
  toString(): string
  {
    return "generic"
  }
}

export class BotCommandUserIDRequirement extends BotCommandRequirement
{
  constructor(private userID: string)
  {
    super(async (user: User) => {
      return user.id == userID
    })
  }
  
  override toString(): string
  {
    return `userID=${this.userID}`
  }
}

export class BotCommandRoleIDRequirement extends BotCommandRequirement
{
  constructor(private roleID: string)
  {
    super(async (_, member: GuildMember) => {
      return member.roles.cache.some(role => role.id == roleID)
    })
  }
  
  override toString(): string
  {
    return `roleID=${this.roleID}`
  }
}

export class BotCommandPermissionRequirement extends BotCommandRequirement
{
  constructor(private permissions: PermissionResolvable[])
  {
    super(async (_, member: GuildMember) => {
      return permissions.every(permission => member.permissions.has(permission))
    })
  }
  
  override toString(): string
  {
    return `permissions=(${this.permissions.join(" && ")})`
  }
}

export class BotCommandChannelIDRequirement extends BotCommandRequirement
{
  constructor(private channelID: string)
  {
    super(async (_, __, ___, channel: TextChannel) => {
      return channel.id == channelID
    })
  }
  
  override toString(): string
  {
    return `channelID=${this.channelID}`
  }
}

export class BotCommandServerIDRequirement extends BotCommandRequirement
{
  constructor(private serverID: string)
  {
    super(async (_, __, ___, ____, server: Guild) => {
      return server.id == serverID
    })
  }
  
  override toString(): string
  {
    return `serverID=${this.serverID}`
  }
}

export class BotCommandFromAliasRequirement extends BotCommandRequirement
{
  constructor()
  {
    super(async (_, __, ___, ____, _____, fromAlias: boolean) => {
      return fromAlias == true
    })
  }
  
  override toString(): string
  {
    return `fromAlias=true`
  }
}

export class BotCommandUnionRequirement extends BotCommandRequirement
{
  constructor(private requirements: BotCommandRequirement[])
  {
    super(async (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean, commandArguments: string[]) => {
      for (let requirement of requirements) {
        if (await requirement.requirementTest(user, member, message, channel, server, fromAlias, commandArguments)) return true
      }
      return false
    })
  }
  
  override toString(): string
  {
    return `(${this.requirements.map(r => r.toString()).join(" || ")})`
  }
}

export class BotCommandIntersectionRequirement extends BotCommandRequirement
{
  constructor(private requirements: BotCommandRequirement[])
  {
    super(async (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean, commandArguments: string[]) => {
      for (let requirement of requirements) {
        if (!await requirement.requirementTest(user, member, message, channel, server, fromAlias, commandArguments)) return false
      }
      return true
    })
  }
  
  override toString(): string
  {
    return `(${this.requirements.map(r => r.toString()).join(" && ")})`
  }
}

export class BotCommandInverseRequirement extends BotCommandRequirement
{
  constructor(private requirement: BotCommandRequirement)
  {
    super(async (user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean, commandArguments: string[]) => {
      return !await requirement.requirementTest(user, member, message, channel, server, fromAlias, commandArguments)
    })
  }
  
  override toString(): string
  {
    return `!(${this.requirement.toString()})`
  }
}
