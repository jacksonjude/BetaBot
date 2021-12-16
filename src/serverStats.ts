import { Client, Guild, TextChannel, Collection, Message } from "discord.js"
import { Firestore, Timestamp } from "firebase-admin/firestore"
import { BotCommand, BotCommandError } from "./botCommand"

import { CronJob } from "cron"

const statChannelsCollectionID = "statsConfigurations"

var statsData: { [k: string]: StatsConfiguration } = {}
var onlineMemberCountCronJob: CronJob
var messageCountsCronJobs: { [k: string]: CronJob } = {}

export class StatsConfiguration
{
  totalCountChannelID: string | null
  onlineCountChannelID: string | null
  boostCountChannelID: string | null

  messageCounts: MessageCountsConfiguration | null
}

class MessageCountsConfiguration
{
  cronHours: string
  hours: number

  startTime: Timestamp
  timeZone: string

  segmentSums: MessageCountSegmentSumConfiguration[]
}

class MessageCountSegmentSumConfiguration
{
  key: string
  name: string
  count: number
}

export const interpretStatsSetting = async function(client: Client, guildID: string, statsDataJSON: StatsConfiguration, firestoreDB: Firestore)
{
  statsData[guildID] = statsDataJSON

  client.guilds.fetch(guildID).then(guild => {
    updateTotalMembersStat(guild)
    updateOnlineMembersStat(guild)
    updateBoostMembersStat(guild)
  }).catch(console.error)

  if (statsData[guildID].messageCounts)
  {
    let messageCountsData = statsData[guildID].messageCounts
    setupMessageCountsCronJob(client, guildID, messageCountsData, firestoreDB)
  }
}

export const setupMemberStatsEventHandlers = function(client: Client)
{
  client.on('guildMemberAdd', (member) => {
    // Update members stat
    if (member == null || member.guild == null) { return }
    updateTotalMembersStat(member.guild)
  })

  client.on('guildMemberRemove', (member) => {
    // Update members stat
    if (member == null || member.guild == null) { return }
    updateTotalMembersStat(member.guild)
  })

  onlineMemberCountCronJob = new CronJob("0 */10 * * * *", () => {
    Object.keys(statsData).forEach((guildID) => {
      client.guilds.fetch(guildID).then(guild => {
        updateOnlineMembersStat(guild)
      })
    })
  })
  onlineMemberCountCronJob.start()

  client.on('guildMemberUpdate', async (oldMember, _) => {
    // Update boost stat
    if (oldMember == null || oldMember.guild == null) { return }
    updateBoostMembersStat(oldMember.guild)
  })
}

function setupMessageCountsCronJob(client: Client, guildID: string, messageCountsData: MessageCountsConfiguration, firestoreDB: Firestore)
{
  let messageCountCronJob = new CronJob("1 0 " + (messageCountsData.cronHours ?? "0") + " * * *", () => {
    client.guilds.fetch(guildID).then(async guild => {
      updateMessageCounts(guild, messageCountsData.hours, messageCountsData.startTime.toMillis(), firestoreDB)
    })
  }, null, true, messageCountsData.timeZone ?? "America/Los_Angeles")
  messageCountCronJob.start()

  if (messageCountsCronJobs[guildID])
  {
    messageCountsCronJobs[guildID].stop()
  }

  messageCountsCronJobs[guildID] = messageCountCronJob
}

function updateTotalMembersStat(guild: Guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.totalCountChannelID == null) { return }

  var totalCount = guild.memberCount

  updateStatChannelName(guild, guildStatsSettings.totalCountChannelID, totalCount)
}

async function updateOnlineMembersStat(guild: Guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.onlineCountChannelID == null) { return }

  var guildMembers = await guild.members.fetch()
  var onlineCount = guildMembers.filter(m => m.presence != null && m.presence.status != "offline").size

  updateStatChannelName(guild, guildStatsSettings.onlineCountChannelID, onlineCount)
}

function updateBoostMembersStat(guild: Guild)
{
  var guildStatsSettings = statsData[guild.id]
  if (guildStatsSettings == null || guildStatsSettings.boostCountChannelID == null) { return }

  var boostCount = guild.premiumSubscriptionCount

  updateStatChannelName(guild, guildStatsSettings.boostCountChannelID, boostCount)
}

async function updateStatChannelName(guild: Guild, channelID: string, statValue: number)
{
  let channelToUpdate = await guild.channels.fetch(channelID)
  if (channelToUpdate == null) { return }

  let currentChannelName = channelToUpdate.name
  let newChannelName = currentChannelName.replace(/\d+/, statValue.toString())
  await channelToUpdate.setName(newChannelName)
}

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

async function updateMessageCounts(guild: Guild, hoursPerSegment: number, trackingStartTime: number, firestoreDB: Firestore, verbose: boolean = false)
{
  let messageCountsCollectionPath = statChannelsCollectionID + "/" + guild.id + "/" + "messageCounts"
  let previousMessageCounts = await firestoreDB.collection(messageCountsCollectionPath).get()

  let previouslyCalculatedSegments = []
  previousMessageCounts.forEach((messageCountsDoc) => {
    previouslyCalculatedSegments.push(messageCountsDoc.id)
  })

  var updatedMessageCountSegments = {}

  var guildChannels = await guild.channels.fetch()
  for (let channel of guildChannels.toJSON())
  {
    if (channel.type != "GUILD_TEXT") { continue }
    let textChannel = channel as TextChannel

    let channelMessages: Collection<string,Message>
    try
    {
      channelMessages = await textChannel.messages.fetch({limit: 100})
    }
    catch (error)
    {
      continue
    }

    const processMessages = async function(messages: Message[])
    {
      for (let message of messages)
      {
        let messageCreatedTimestamp = message.createdAt.getTime()
        if (messageCreatedTimestamp < trackingStartTime) { return true }
        if (message.author.bot) { continue }

        let segmentStartTime = messageCreatedTimestamp-((messageCreatedTimestamp-trackingStartTime)%(hoursPerSegment*60*60*1000))
        if ((new Date(segmentStartTime)).isDSTObserved() != (new Date(trackingStartTime)).isDSTObserved())
        {
          segmentStartTime -= new Date(segmentStartTime).getOffsetDueToDST()
        }
        if (segmentStartTime+hoursPerSegment*60*60*1000 > Date.now())
        {
          continue
        }
        if (previouslyCalculatedSegments.includes(segmentStartTime.toString()))
        {
          return true
        }

        if (!updatedMessageCountSegments[segmentStartTime])
        {
          updatedMessageCountSegments[segmentStartTime] = {}
        }
        if (!updatedMessageCountSegments[segmentStartTime][message.author.id])
        {
          updatedMessageCountSegments[segmentStartTime][message.author.id] = 0
        }

        updatedMessageCountSegments[segmentStartTime][message.author.id] += 1
      }

      return false
    }

    let shouldBreakMessageLoop = false
    let fetchedMessageCount = channelMessages.size
    while (channelMessages.size > 0 && !shouldBreakMessageLoop)
    {
      if (verbose)
      {
        console.log("Message Counts: " + channel.id + " (count = " + fetchedMessageCount + ", time = " + channelMessages.last().createdAt.getTime() + ")")
      }
      shouldBreakMessageLoop = await processMessages(Object.values(channelMessages.toJSON()))

      if (channelMessages.size > 0 && channelMessages.last().id)
      {
        try
        {
          channelMessages = await channel.messages.fetch({before: channelMessages.last().id, limit: 100})
          fetchedMessageCount += channelMessages.size
        }
        catch
        {
          shouldBreakMessageLoop = true
        }
      }
    }
  }

  for (let messageCountSegmentTime in updatedMessageCountSegments)
  {
    console.log("Message Counts: Add segment " + messageCountSegmentTime + " (" + new Date(parseInt(messageCountSegmentTime)) + ") in " + guild.name)
    await firestoreDB.doc(messageCountsCollectionPath + "/" + messageCountSegmentTime).set(updatedMessageCountSegments[messageCountSegmentTime])
  }
}

export const sendMessageCountsUpdateCommand = async function(msg: Message, messageContent: string, firestoreDB: Firestore)
{
  const updateMessageCountsRegex = /^updateleaderboard$/

  if (updateMessageCountsRegex.test(messageContent) && statsData[msg.guildId] && statsData[msg.guildId].messageCounts)
  {
    let guild = await msg.guild.fetch()
    let messageCountsData = statsData[msg.guildId].messageCounts

    updateMessageCounts(guild, messageCountsData.hours, messageCountsData.startTime.toMillis(), firestoreDB, true)

    return true
  }

  return false
}

Date.prototype.toDMYString = function() {
  return (this.getMonth()+1) + "/" + this.getDate() + "/" + this.getFullYear()
}

Date.prototype.changeTimezone = function(ianatz: string, multiplier: number = null) {
  // suppose the date is 12:00 UTC
  var invdate = new Date(this.toLocaleString('en-US', {
    timeZone: ianatz
  }))

  // then invdate will be 07:00 in Toronto
  // and the diff is 5 hours
  var diff = this.getTime() - invdate.getTime()
  diff *= multiplier ?? 1

  // so 12:00 in Toronto is 17:00 UTC
  this.setTime(this.getTime() - diff) // needs to substract
}

export function getMessageCountsLeaderboardCommand(): BotCommand
{
  return BotCommand.fromRegex(
    "leaderboard", "displays the message count leaderboard for the server",
    /^leaderboard(\s+(false|true))?(\s+(\w+))?(\s+([\d\/]+))?(\s+([\d\/]+))?$/, /^leaderboard(\s+.*)?$/,
    "leaderboard [mentions toggle (true | false)] [range preset (day | week | month)] [date 1 (M/D/YYYY)] [date 2 (M/D/YYYY)]",
    async (commandArguments: string[], message: Message, client: Client, firestoreDB: Firestore) => {
      if (!statsData[message.guildId] || !statsData[message.guildId].messageCounts)
      {
        return new BotCommandError("Leaderboard not available in this server", false)
      }

      let messageCountsData = statsData[message.guildId].messageCounts

      let leaderboardToShow = commandArguments[4]

      let messageCountsCollection = await firestoreDB.collection(statChannelsCollectionID + "/" + message.guildId + "/" + "messageCounts").get()

      let currentTime = Date.now()

      let isAllTime = false
      let segmentSumType: MessageCountSegmentSumConfiguration
      let segmentSumTimeRange = {start: messageCountsData.startTime.toMillis(), end: currentTime, startString: null, endString: null}

      if (messageCountsData.segmentSums)
      {
        segmentSumType = statsData[message.guildId].messageCounts.segmentSums.find((segmentSumType) => segmentSumType.key == leaderboardToShow)

        if (segmentSumType)
        {
          segmentSumTimeRange.start = currentTime-((currentTime-messageCountsData.startTime.toMillis())%(messageCountsData.hours*60*60*1000))-(segmentSumType.count*messageCountsData.hours*60*60*1000)
          segmentSumTimeRange.startString = new Date(segmentSumTimeRange.start).toDMYString()
        }

        segmentSumTimeRange.end = currentTime-((currentTime-messageCountsData.startTime.toMillis())%(messageCountsData.hours*60*60*1000))
        segmentSumTimeRange.endString = new Date(segmentSumTimeRange.end).toDMYString()
      }

      if (!segmentSumType && commandArguments[6])
      {
        segmentSumTimeRange.startString = commandArguments[6]
        segmentSumTimeRange.endString = commandArguments[8] ?? commandArguments[6]

        let startDateParts = segmentSumTimeRange.startString.split("/")
        let endDateParts = segmentSumTimeRange.endString.split("/")

        if (startDateParts.length != 3 || endDateParts.length != 3)
        {
          return new BotCommandError("M/D/YYYY format is required", true)
        }

        let startDate = new Date(parseInt(startDateParts[2]), parseInt(startDateParts[0])-1, parseInt(startDateParts[1]))
        let endDate = new Date(parseInt(endDateParts[2]), parseInt(endDateParts[0])-1, parseInt(endDateParts[1]))

        startDate.changeTimezone(messageCountsData.timeZone, -1)
        endDate.changeTimezone(messageCountsData.timeZone, -1)

        if (startDate.getTime() == NaN || endDate.getTime() == NaN)
        {
          return new BotCommandError("M/D/YYYY format is required", true)
        }

        segmentSumTimeRange.start = startDate.getTime()
        segmentSumTimeRange.end = endDate.getTime()
      }
      else if (!segmentSumType)
      {
        isAllTime = true
        segmentSumTimeRange.startString = new Date(messageCountsData.startTime.toMillis()).toDMYString()
      }

      let shouldUseMentions = true
      if (commandArguments[2] == "false")
      {
        shouldUseMentions = false
      }

      await message.channel.sendTyping()

      let sortedMessageCountsDocs = messageCountsCollection.docs.sort((doc1, doc2) => parseInt(doc2.id)-parseInt(doc1.id))

      let summedMessageCounts = {}
      for (let docSnapshot of sortedMessageCountsDocs)
      {
        if (parseInt(docSnapshot.id) < segmentSumTimeRange.start || parseInt(docSnapshot.id) > segmentSumTimeRange.end) { continue }

        let messageCountsSegment = docSnapshot.data()
        for (let userID of Object.keys(messageCountsSegment))
        {
          if (!summedMessageCounts[userID])
          {
            summedMessageCounts[userID] = 0
          }
          summedMessageCounts[userID] += messageCountsSegment[userID]
        }
      }

      let sortedSummedMessageCounts = []
      for (let userID of Object.keys(summedMessageCounts))
      {
        sortedSummedMessageCounts.push({id: userID, count: summedMessageCounts[userID]})
      }
      sortedSummedMessageCounts.sort((messageCount1, messageCount2) => messageCount1.id-messageCount2.id)
      sortedSummedMessageCounts.sort((messageCount1, messageCount2) => messageCount2.count-messageCount1.count)

      let guild = await client.guilds.fetch(message.guildId)

      let leaderboardMessage = "__** Leaderboard (" + (segmentSumType ? segmentSumType.name + ": " : (isAllTime ? "All-Time: " : "")) + segmentSumTimeRange.startString + (segmentSumTimeRange.start != segmentSumTimeRange.end && segmentSumTimeRange.endString ? " to " + segmentSumTimeRange.endString : "") + ")**__"
      for (let messageCountPairIndex in sortedSummedMessageCounts)
      {
        leaderboardMessage += "\n"

        let userTag = "#0000"
        let guildName: string

        let userID = sortedSummedMessageCounts[messageCountPairIndex].id

        try
        {
          guildName = (await guild.members.fetch(userID)).displayName
        }
        catch
        {}

        try
        {
          let user = await client.users.fetch(userID)
          userTag = user.tag
        }
        catch {}

        let messageCount = sortedSummedMessageCounts[messageCountPairIndex].count
        let nextMessageCount: number
        let placementIndex = parseInt(messageCountPairIndex)+1
        do
        {
          placementIndex -= 1
          nextMessageCount = placementIndex-1 >= 0 ? sortedSummedMessageCounts[placementIndex-1].count : null
        }
        while (nextMessageCount && messageCount == nextMessageCount)

        leaderboardMessage += "**#" + (placementIndex+1) + "**  *(" + messageCount + ")*  " + (shouldUseMentions && guildName ? "<@" + userID + ">" : (!shouldUseMentions && guildName ? guildName : userTag))
      }
      message.channel.send({
        "content": leaderboardMessage,
        "allowedMentions": { "users" : []}
      })
    }
  )
}
