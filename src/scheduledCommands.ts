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
  startAt?: number
  endAt?: number
  job?: CronJob

  channelID: string
  messageID: string

  createdAt: number
}

var scheduledCommands: ScheduledCommand[] = []

type HandleCommandExecution = (messageContent: string, msg: Message) => Promise<void>

export async function interpretScheduledCommandSetting(client: Client, scheduledCommand: ScheduledCommand, handleCommandExecution: HandleCommandExecution)
{
  let channel = await client.channels.fetch(scheduledCommand.channelID) as TextChannel
  let message = await channel.messages.fetch(scheduledCommand.messageID)

  createScheduledCommand(scheduledCommand.commandString, scheduledCommand.startAt, scheduledCommand.endAt, scheduledCommand.cronString,  message, scheduledCommand.createdAt, scheduledCommand.id, handleCommandExecution)
}

export function removeScheduledCommandSetting(scheduledCommandToDelete: ScheduledCommand)
{
  if (!scheduledCommandToDelete) { return }

  scheduledCommandToDelete.job && scheduledCommandToDelete.job.stop()
  scheduledCommands = scheduledCommands.filter((scheduledCommand) => scheduledCommand.id !== scheduledCommandToDelete.id)
}

export function getScheduleCommand(handleCommandExecutionFunction: HandleCommandExecution): BotCommand
{
  return BotCommand.fromRegex(
    "schedule", "schedules commands using cron strings",
    /^schedule\s+(?:(?:create\s+)?(?:([\d\-T:\.Z,]+)\s+)?(?:([\d\-T:\.Z,]+)\s+)?"([^"]+)"\s+(.*))|(?:remove\s+(.*))|(?:list)$/, /^schedule(\s+.*)?$/,
    "schedule [create | remove | list] [start date] [end date] [\"cron string\" | schedule id] [command]",
    async (commandArguments: string[], commandMessage: Message) => {
      let scheduleAction: "create" | "remove" | "list" = commandArguments[5] != null ? "remove" : (commandArguments[3] ? "create" : "list")
      switch (scheduleAction)
      {
        case "create":
        let startDateString: string = commandArguments[1]
        let endDateString: string = commandArguments[2]

        let startDate: number
        let endDate: number

        if (!startDateString)
        {
          startDate = null
        }
        else if (!isNaN(new Date(startDateString).getTime()))
        {
          startDate = new Date(startDateString).getTime()
        }
        else
        {
          startDate = parseInt(startDateString)
        }

        if (!endDateString)
        {
          endDate = null
        }
        else if (!isNaN(new Date(endDateString).getTime()))
        {
          endDate = new Date(endDateString).getTime()
        }
        else
        {
          endDate = parseInt(endDateString)
        }

        let cronString = commandArguments[3]
        let commandString = commandArguments[4].replace(/^\s*/, "").replace(/\s*$/, "")
        let scheduledCommandID = uid()

        let newScheduledCommand = createScheduledCommand(commandString, startDate, endDate, cronString, commandMessage, Date.now(), scheduledCommandID, handleCommandExecutionFunction)
        let { job: _, ...scheduledCommandForUpload } = newScheduledCommand
        getFirestore().doc(scheduledCommandCollectionID + "/" + newScheduledCommand.id).set(scheduledCommandForUpload)

        await commandMessage.reply(":hourglass_flowing_sand: Scheduled " + scheduledCommandID)
        break

        case "remove":
        let commandIDToStop = commandArguments[5]

        let scheduledCommand = scheduledCommands.find((scheduledCommand) => scheduledCommand.id === commandIDToStop)
        removeScheduledCommandSetting(scheduledCommand)
        await getFirestore().doc(scheduledCommandCollectionID + "/" + scheduledCommand.id).delete()

        await commandMessage.reply(":hourglass: Stopped " + commandIDToStop)
        break

        case "list":
        scheduledCommands.sort((scheduleCommand1, scheduleCommand2) => scheduleCommand1.createdAt-scheduleCommand2.createdAt)
        await commandMessage.channel.send(":hourglass: Scheduled Commands" + scheduledCommands.map(scheduledCommand => {
          return "\n" + scheduledCommand.id + ": \"" + scheduledCommand.cronString + "\"; " + scheduledCommand.commandString
        }))
        break
      }
    }
  )
}

function createScheduledCommand(commandString: string, startAt: number, endAt: number, cronString: string, commandMessage: Message, createdAt: number, scheduledCommandIDToAdd: string, handleCommandExecutionFunction: HandleCommandExecution): ScheduledCommand
{
  if (scheduledCommands.some(scheduledCommand => scheduledCommand.id == scheduledCommandIDToAdd)) { return }

  let scheduledCommandJob = new CronJob(cronString, () => {
    if (startAt && Date.now() < startAt) { return }
    if (endAt && Date.now() > endAt)
    {
      let scheduledCommand = scheduledCommands.find((scheduledCommand) => scheduledCommand.id === scheduledCommandIDToAdd)
      removeScheduledCommandSetting(scheduledCommand)
      getFirestore().doc(scheduledCommandCollectionID + "/" + scheduledCommand.id).delete()
      return
    }

    handleCommandExecutionFunction(commandString, commandMessage)
  }, null, true, "America/Los_Angeles")

  let newScheduledCommand: ScheduledCommand = {id: scheduledCommandIDToAdd, commandString: commandString, startAt: startAt, endAt: endAt, cronString: cronString, job: scheduledCommandJob, channelID: commandMessage.channelId, messageID: commandMessage.id, createdAt: createdAt}
  scheduledCommands.push(newScheduledCommand)

  return newScheduledCommand
}
