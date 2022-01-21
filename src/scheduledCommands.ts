import { Client, Message, TextChannel } from "discord.js"
import { getFirestore } from "firebase-admin/firestore"
import { BotCommand } from "./botCommand"
import { CronJob } from "cron"
import ShortUniqueID from "short-unique-id"
const uid = new ShortUniqueID({ length: 10 })

const scheduledCommandCollectionID = "scheduledCommands"

export class ScheduledCommand
{
  id: string
  commandString: string
  cronString: string
  job?: CronJob

  channelID: string
  messageID: string
}

var scheduledCommands: ScheduledCommand[] = []

type HandleCommandExecution = (messageContent: string, msg: Message) => Promise<void>

export async function interpretScheduledCommandSetting(client: Client, scheduledCommand: ScheduledCommand, handleCommandExecution: HandleCommandExecution)
{
  let channel = await client.channels.fetch(scheduledCommand.channelID) as TextChannel
  let message = await channel.messages.fetch(scheduledCommand.messageID)

  createScheduledCommand(scheduledCommand.commandString, scheduledCommand.cronString, message, scheduledCommand.id, handleCommandExecution)
}

export function removeScheduledCommandSetting(scheduledCommand: ScheduledCommand)
{
  scheduledCommand.job && scheduledCommand.job.stop()
  scheduledCommands = scheduledCommands.filter((scheduledCommand) => scheduledCommand.id !== scheduledCommand.id)
}

export function getScheduleCommand(handleCommandExecutionFunction: HandleCommandExecution): BotCommand
{
  return BotCommand.fromRegex(
    "schedule", "schedules commands using cron strings",
    /^schedule\s+(?:(?:create\s+)?"([^"]+)"\s+(.*))|(?:remove\s+(.*))|(?:list)$/, /^close(\s+.*)?$/,
    "schedule [create | remove | list] [\"cron string\" | schedule id] [command]",
    async (commandArguments: string[], commandMessage: Message) => {
      let scheduleAction: "create" | "remove" | "list" = commandArguments[3] != null ? "remove" : (commandArguments[1] ? "create" : "list")
      switch (scheduleAction)
      {
        case "create":
        let cronString = commandArguments[1]
        let commandString = commandArguments[2].replace(/^\s*/, "").replace(/\s*$/, "")
        let scheduledCommandID = uid()

        let newScheduledCommand = createScheduledCommand(commandString, cronString, commandMessage, scheduledCommandID, handleCommandExecutionFunction)
        getFirestore().doc(scheduledCommandCollectionID + "/" + newScheduledCommand.id).set({id: newScheduledCommand.id, commandString: newScheduledCommand.commandString, cronString: newScheduledCommand.cronString, channelID: newScheduledCommand.channelID, messageID: newScheduledCommand.messageID})

        await commandMessage.reply(":hourglass_flowing_sand: Scheduled " + scheduledCommandID)
        break

        case "remove":
        let commandIDToStop = commandArguments[3]

        let scheduledCommand = scheduledCommands.find((scheduledCommand) => scheduledCommand.id === commandIDToStop)
        removeScheduledCommandSetting(scheduledCommand)
        await getFirestore().doc(scheduledCommandCollectionID + "/" + scheduledCommand.id).delete()

        await commandMessage.reply(":hourglass: Stopped " + commandIDToStop)
        break

        case "list":
        await commandMessage.channel.send(":hourglass: Scheduled Commands" + scheduledCommands.map(scheduledCommand => {
          return "\n" + scheduledCommand.id + ": '" + scheduledCommand.cronString + "'; " + scheduledCommand.commandString
        }))
        break
      }
    }
  )
}

function createScheduledCommand(commandString: string, cronString: string, commandMessage: Message, scheduledCommandID: string, handleCommandExecutionFunction: HandleCommandExecution): ScheduledCommand
{
  if (scheduledCommands.some(scheduledCommand => scheduledCommand.id == scheduledCommandID)) { return }

  let scheduledCommandJob = new CronJob(cronString, () => {
    handleCommandExecutionFunction(commandString, commandMessage)
  }, () => {
    scheduledCommands = scheduledCommands.filter((scheduledCommand) => scheduledCommand.id !== scheduledCommandID)
  }, true, "America/Los_Angeles")
  scheduledCommandJob.start()

  let newScheduledCommand: ScheduledCommand = {id: scheduledCommandID, commandString: commandString, cronString: cronString, job: scheduledCommandJob, channelID: commandMessage.channelId, messageID: commandMessage.id}
  scheduledCommands.push(newScheduledCommand)
  return newScheduledCommand
}
