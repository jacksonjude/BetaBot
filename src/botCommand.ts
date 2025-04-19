import { TextChannel, Message, Client, User, GuildMember, Guild, PermissionResolvable } from "discord.js"
import { Firestore } from "firebase-admin/firestore"

type ParseCommandStringFunction = (messageString: string, channel?: TextChannel, usageMessage?: string) => boolean | string[]
type ValidateCommandFunction<T> = (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => Promise<BotCommandError | T>
type ExecuteCommandFunction<T> = (commandArguments: T, message: Message, client: Client, firestoreDB: Firestore) => Promise<BotCommandError | void>

export class BotCommand<T = string[]>
{
  name: string
  description: string

  parseCommandString: ParseCommandStringFunction
  usageMessage: string | null

  validateCommand: ValidateCommandFunction<T>
  executionRequirement: BotCommandRequirement<T> | null
  executeCommand: ExecuteCommandFunction<T>

  constructor(name: string, description: string, parseCommandStringFunction: ParseCommandStringFunction, usageMessage: string | null, validateCommand: ValidateCommandFunction<T>, executionRequirement: BotCommandRequirement<T> | null, executeCommand: ExecuteCommandFunction<T>)
  {
    this.name = name
    this.description = description
    this.parseCommandString = parseCommandStringFunction
    this.usageMessage = "**Usage: `@BetaBot " + usageMessage + "`**"
    this.validateCommand = validateCommand
    this.executionRequirement = executionRequirement
    this.executeCommand = executeCommand
  }

  static fromRegex(name: string, description: string, fullRegex: RegExp, partialRegex: RegExp | null, usageMessage: string | null, executeCommand: ExecuteCommandFunction<null>): BotCommand
  {
    return new BotCommand(name, description, BotCommand.getRegexFunction(fullRegex, partialRegex), usageMessage, (async (commandArguments: string[]) => commandArguments), null, executeCommand)
  }
  
  static fromRegexWithValidation<V>(name: string, description: string, fullRegex: RegExp, partialRegex: RegExp | null, usageMessage: string | null, validateCommand: ValidateCommandFunction<V> | null, executionRequirement: BotCommandRequirement<V> | null, executeCommand: ExecuteCommandFunction<V>): BotCommand<V>
  {
    return new BotCommand<V>(name, description, BotCommand.getRegexFunction(fullRegex, partialRegex), usageMessage, validateCommand, executionRequirement, executeCommand)
  }
  
  private static getRegexFunction(fullRegex: RegExp, partialRegex: RegExp | null): ParseCommandStringFunction
  {
    fullRegex = new RegExp(fullRegex, "i")
    partialRegex = partialRegex ? new RegExp(partialRegex, "i") : null
    
    return (messageString: string, channel?: TextChannel, usageMessage?: string) => {
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
    }
  }

  async execute(messageString: string, message: Message, client: Client, firestoreDB: Firestore, fromAlias: boolean): Promise<boolean>
  {
    let textChannel = message.channel as TextChannel
    let parseCallback = this.parseCommandString(messageString, textChannel, this.usageMessage)
    if (parseCallback === false || parseCallback === true) { return false }
    
    let validateCallback = await this.validateCommand(parseCallback, message, client, firestoreDB)
    if (validateCallback instanceof BotCommandError)
    {
      await textChannel.send("**Error: " + validateCallback.errorMessage + "**")
      validateCallback.shouldShowUsage && await textChannel.send(this.usageMessage)
      return false
    }

    if (this.executionRequirement && !await this.executionRequirement.testMessage(message, fromAlias, validateCallback))
    {
      await textChannel.send(`**Error: <@${message.author.id}> has invalid permissions to run ${this.name}**`)
      console.log(`[Bot Command] Invalid permissions for ${message.author.username} to run ${this.name} in ${message.guild.name}: ${this.executionRequirement.toString()}`)
      return false
    }

    let commandCallback = await this.executeCommand(validateCallback, message, client, firestoreDB)
    if (commandCallback)
    {
      await textChannel.send("**Error: " + commandCallback.errorMessage + "**")
      commandCallback.shouldShowUsage && await textChannel.send(this.usageMessage)
    }
    return true
  }

  withRequirement(requirement: BotCommandRequirement<T>): BotCommand<T>
  {
    this.executionRequirement = requirement
    return this
  }
  
  withAdditionalRequirement(requirement: BotCommandRequirement<T>): BotCommand<T>
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
  
  withOverrideRequirement(requirement: BotCommandRequirement<T>): BotCommand<T>
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

type RequirementTestFunction<T> = (commandArguments: T, user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean) => Promise<boolean>

export class BotCommandRequirement<T = string[]>
{
  requirementTest: RequirementTestFunction<T>

  constructor(requirementTestFunction: RequirementTestFunction<T>)
  {
    this.requirementTest = requirementTestFunction
  }

  async testMessage(message: Message, fromAlias: boolean, commandArguments: T): Promise<boolean>
  {
    return this.requirementTest(commandArguments, message.author, message.member, message, message.channel as TextChannel, message.guild, fromAlias)
  }
  
  toString(): string
  {
    return "generic"
  }
}

export class BotCommandUserIDRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private userID: string)
  {
    super(async (_commandArguments, user: User) => {
      return user.id == userID
    })
  }
  
  override toString(): string
  {
    return `userID=${this.userID}`
  }
}

export class BotCommandRoleIDRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private roleID: string)
  {
    super(async (_commandArguments, _user, member: GuildMember) => {
      return member.roles.cache.some(role => role.id == roleID)
    })
  }
  
  override toString(): string
  {
    return `roleID=${this.roleID}`
  }
}

export class BotCommandPermissionRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private permissions: PermissionResolvable[])
  {
    super(async (_commandArguments, _user, member: GuildMember) => {
      return permissions.every(permission => member.permissions.has(permission))
    })
  }
  
  override toString(): string
  {
    return `permissions=(${this.permissions.join(" && ")})`
  }
}

export class BotCommandChannelIDRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private channelID: string)
  {
    super(async (_commandArguments, _user, _member, _message, channel: TextChannel) => {
      return channel.id == channelID
    })
  }
  
  override toString(): string
  {
    return `channelID=${this.channelID}`
  }
}

export class BotCommandServerIDRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private serverID: string)
  {
    super(async (_commandArguments, _user, _member, _message, _channel, server: Guild) => {
      return server.id == serverID
    })
  }
  
  override toString(): string
  {
    return `serverID=${this.serverID}`
  }
}

export class BotCommandFromAliasRequirement<T> extends BotCommandRequirement<T>
{
  constructor()
  {
    super(async (_commandArguments, _user, _member, _message, _channel, _server, fromAlias: boolean) => {
      return fromAlias == true
    })
  }
  
  override toString(): string
  {
    return `fromAlias=true`
  }
}

export class BotCommandUnionRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private requirements: BotCommandRequirement<T>[])
  {
    super(async (commandArguments: T, user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean) => {
      for (let requirement of requirements) {
        if (await requirement.requirementTest(commandArguments, user, member, message, channel, server, fromAlias)) return true
      }
      return false
    })
  }
  
  override toString(): string
  {
    return `(${this.requirements.map(r => r.toString()).join(" || ")})`
  }
}

export class BotCommandIntersectionRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private requirements: BotCommandRequirement<T>[])
  {
    super(async (commandArguments: T, user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean) => {
      for (let requirement of requirements) {
        if (!await requirement.requirementTest(commandArguments, user, member, message, channel, server, fromAlias)) return false
      }
      return true
    })
  }
  
  override toString(): string
  {
    return `(${this.requirements.map(r => r.toString()).join(" && ")})`
  }
}

export class BotCommandInverseRequirement<T> extends BotCommandRequirement<T>
{
  constructor(private requirement: BotCommandRequirement<T>)
  {
    super(async (commandArguments: T, user: User, member: GuildMember, message: Message, channel: TextChannel, server: Guild, fromAlias: boolean) => {
      return !await requirement.requirementTest(commandArguments, user, member, message, channel, server, fromAlias)
    })
  }
  
  override toString(): string
  {
    return `!(${this.requirement.toString()})`
  }
}
